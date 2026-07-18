// Internal chat controller.
//
// Endpoints (all authed; see chatRoutes for permission gates):
//   GET  /api/chat/users                          — user picker
//   GET  /api/chat/channels                       — my channels + unread + last-msg
//   POST /api/chat/channels                       — create channel
//   POST /api/chat/dm/:userId                     — get-or-create DM w/ another user
//   GET  /api/chat/channels/:id/messages          — page messages
//   POST /api/chat/channels/:id/messages          — send message (broadcasts via Socket.io)
//   POST /api/chat/channels/:id/read              — mark read up to a message id
//   POST /api/chat/upload                         — multipart file upload
//   Admin:
//     GET  /api/chat/audit/channels                — every channel
//     GET  /api/chat/audit/channels/:id/messages   — messages regardless of membership
const path  = require('path');
const fs    = require('fs');
const multer = require('multer');
const { sql, getPool } = require('../config/db');
const chatSocket = require('../services/chatSocket');

// ---- File uploads ----------------------------------------------------------
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'chat');
if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
    filename:    (_req, file, cb) => {
        // Preserve extension; prefix with epoch + rand so collisions are impossible
        // and the original name lives on in the DB (AttachmentName).
        const ext = path.extname(file.originalname) || '';
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
});
exports.uploadMiddleware = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
}).single('file');

exports.uploadAttachment = (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    // Relative path so the frontend can hit /uploads/chat/<name>
    res.json({
        AttachmentPath: `/uploads/chat/${req.file.filename}`,
        AttachmentName: req.file.originalname,
        AttachmentType: req.file.mimetype,
        AttachmentSize: req.file.size,
    });
};

// ---- Users -----------------------------------------------------------------
exports.listUsers = async (req, res) => {
    try {
        const pool = await getPool();
        // GLUser uses `Userid` (lowercase d) + `Active` bit; GLUserGroup exposes
        // GroupTitle. Alias UserId so the frontend can match `u.UserId`.
        const r = await pool.request().query(`
            SELECT u.Userid AS UserId, u.UserName, ISNULL(g.GroupTitle,'') AS GroupTitle
            FROM   GLUser u
            LEFT   JOIN GLUserGroup g ON g.GroupID = u.GroupID
            WHERE  ISNULL(u.Active, 1) = 1
            ORDER  BY u.UserName`);
        res.json(r.recordset.filter(u => u.UserId !== req.user.userId));
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ---- Channels list (mine) --------------------------------------------------
exports.listMyChannels = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('uid', sql.Int, req.user.userId)
            .query(`
                SELECT c.ChannelID, c.Kind, c.Name, c.Description,
                       c.CreatedBy, c.CreatedAt, c.LastMessageAt,
                       m.LastReadMessageID,
                       -- Unread count = messages after our LastReadMessageID
                       ISNULL((
                           SELECT COUNT(*)
                           FROM   dms_ChatMessages msg
                           WHERE  msg.ChannelID = c.ChannelID
                             AND  msg.DeletedAt IS NULL
                             AND  (m.LastReadMessageID IS NULL OR msg.MessageID > m.LastReadMessageID)
                             AND  msg.SenderID <> @uid
                       ), 0) AS UnreadCount,
                       -- Last message preview
                       (SELECT TOP 1 CONCAT(u.UserName, ': ',
                               CASE WHEN msg.Content IS NULL OR msg.Content = ''
                                    THEN CONCAT('[', ISNULL(msg.AttachmentName, 'file'), ']')
                                    ELSE msg.Content END)
                        FROM   dms_ChatMessages msg
                        LEFT   JOIN GLUser u ON u.UserId = msg.SenderID
                        WHERE  msg.ChannelID = c.ChannelID AND msg.DeletedAt IS NULL
                        ORDER  BY msg.MessageID DESC) AS LastMessagePreview
                FROM   dms_ChatChannels c
                JOIN   dms_ChatMembers  m ON m.ChannelID = c.ChannelID
                WHERE  m.UserID = @uid
                ORDER  BY ISNULL(c.LastMessageAt, c.CreatedAt) DESC`);

        // Attach the "other user" for DMs so the UI can label them.
        const dms = r.recordset.filter(c => c.Kind === 'dm').map(c => c.ChannelID);
        let dmPeers = new Map();
        if (dms.length) {
            const dmR = await pool.request()
                .input('uid', sql.Int, req.user.userId)
                .query(`
                    SELECT m.ChannelID, u.UserId, u.UserName
                    FROM   dms_ChatMembers m
                    JOIN   GLUser u ON u.UserId = m.UserID
                    WHERE  m.ChannelID IN (${dms.join(',')})
                      AND  m.UserID <> @uid`);
            for (const row of dmR.recordset) dmPeers.set(row.ChannelID, row);
        }
        res.json(r.recordset.map(c => ({
            ...c,
            DmPeerUserId:  dmPeers.get(c.ChannelID)?.UserId  || null,
            DmPeerName:    dmPeers.get(c.ChannelID)?.UserName || null,
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ---- Create channel --------------------------------------------------------
exports.createChannel = async (req, res) => {
    try {
        const { kind, name, description, memberUserIds } = req.body;
        if (kind !== 'public' && kind !== 'private') {
            return res.status(400).json({ error: 'kind must be "public" or "private".' });
        }
        if (!name?.trim()) return res.status(400).json({ error: 'Channel name is required.' });

        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const ins = await new sql.Request(tx)
                .input('kind', sql.NVarChar(20), kind)
                .input('name', sql.NVarChar(100), name.trim())
                .input('desc', sql.NVarChar(500), (description || '').trim() || null)
                .input('by',   sql.Int, req.user.userId)
                .query(`INSERT INTO dms_ChatChannels (Kind, Name, Description, CreatedBy)
                        OUTPUT INSERTED.ChannelID
                        VALUES (@kind, @name, @desc, @by)`);
            const channelId = ins.recordset[0].ChannelID;

            // Creator is always a member (as owner).
            await new sql.Request(tx)
                .input('cid', sql.Int, channelId)
                .input('uid', sql.Int, req.user.userId)
                .query(`INSERT INTO dms_ChatMembers (ChannelID, UserID, Role)
                        VALUES (@cid, @uid, 'owner')`);
            // Extra invitees, dedup.
            const extras = Array.isArray(memberUserIds) ? memberUserIds : [];
            const seen = new Set([req.user.userId]);
            for (const raw of extras) {
                const uid = parseInt(raw);
                if (!Number.isFinite(uid) || seen.has(uid)) continue;
                seen.add(uid);
                await new sql.Request(tx)
                    .input('cid', sql.Int, channelId)
                    .input('uid', sql.Int, uid)
                    .query(`INSERT INTO dms_ChatMembers (ChannelID, UserID, Role) VALUES (@cid, @uid, 'member')`);
            }
            await tx.commit();
            res.status(201).json({ ChannelID: channelId });
        } catch (e) {
            await tx.rollback();
            throw e;
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ---- Get-or-create DM ------------------------------------------------------
exports.getOrCreateDM = async (req, res) => {
    try {
        const otherId = parseInt(req.params.userId);
        const me = req.user.userId;
        if (!Number.isFinite(otherId) || otherId === me) {
            return res.status(400).json({ error: 'Invalid target user.' });
        }
        const pool = await getPool();
        // Look for an existing DM channel that has EXACTLY these two members.
        const existing = await pool.request()
            .input('a', sql.Int, me)
            .input('b', sql.Int, otherId)
            .query(`
                SELECT TOP 1 c.ChannelID
                FROM   dms_ChatChannels c
                WHERE  c.Kind = 'dm'
                  AND  EXISTS (SELECT 1 FROM dms_ChatMembers WHERE ChannelID = c.ChannelID AND UserID = @a)
                  AND  EXISTS (SELECT 1 FROM dms_ChatMembers WHERE ChannelID = c.ChannelID AND UserID = @b)
                  AND  (SELECT COUNT(*) FROM dms_ChatMembers WHERE ChannelID = c.ChannelID) = 2`);
        if (existing.recordset.length) {
            return res.json({ ChannelID: existing.recordset[0].ChannelID, existed: true });
        }
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const ins = await new sql.Request(tx)
                .input('by', sql.Int, me)
                .query(`INSERT INTO dms_ChatChannels (Kind, CreatedBy) OUTPUT INSERTED.ChannelID VALUES ('dm', @by)`);
            const channelId = ins.recordset[0].ChannelID;
            for (const uid of [me, otherId]) {
                await new sql.Request(tx)
                    .input('cid', sql.Int, channelId)
                    .input('uid', sql.Int, uid)
                    .query(`INSERT INTO dms_ChatMembers (ChannelID, UserID, Role) VALUES (@cid, @uid, 'member')`);
            }
            await tx.commit();
            // Tell the peer socket so it can hot-join.
            chatSocket.emitToUser(otherId, 'channel:new', { ChannelID: channelId });
            res.status(201).json({ ChannelID: channelId, existed: false });
        } catch (e) {
            await tx.rollback();
            throw e;
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// Guard helper — throws unless the user is a member (or has chat_admin).
async function assertMemberOrAdmin(pool, req, channelId) {
    const isAdmin = req.user.groupId === 1 ||
        (Array.isArray(req.user.modules) && req.user.modules.includes('chat_admin'));
    if (isAdmin) return;
    const r = await pool.request()
        .input('cid', sql.Int, channelId)
        .input('uid', sql.Int, req.user.userId)
        .query(`SELECT 1 FROM dms_ChatMembers WHERE ChannelID = @cid AND UserID = @uid`);
    if (!r.recordset.length) {
        const err = new Error('Not a member of this channel.');
        err.status = 403;
        throw err;
    }
}

// ---- Messages page ---------------------------------------------------------
exports.getMessages = async (req, res) => {
    try {
        const channelId = parseInt(req.params.id);
        const before    = req.query.before ? parseInt(req.query.before) : null;
        const limit     = Math.min(parseInt(req.query.limit) || 50, 200);
        const pool = await getPool();
        await assertMemberOrAdmin(pool, req, channelId);
        const r = await pool.request()
            .input('cid', sql.Int, channelId)
            .input('bef', sql.Int, before)
            .input('lim', sql.Int, limit)
            .query(`
                SELECT TOP (@lim)
                       m.MessageID, m.ChannelID, m.SenderID, u.UserName AS SenderName,
                       m.Content, m.CreatedAt, m.EditedAt, m.DeletedAt,
                       m.AttachmentPath, m.AttachmentName, m.AttachmentType, m.AttachmentSize
                FROM   dms_ChatMessages m
                LEFT   JOIN GLUser u ON u.UserId = m.SenderID
                WHERE  m.ChannelID = @cid
                  AND  (@bef IS NULL OR m.MessageID < @bef)
                ORDER  BY m.MessageID DESC`);
        // Return oldest → newest so the UI can append.
        res.json(r.recordset.reverse());
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// ---- Send message ----------------------------------------------------------
exports.sendMessage = async (req, res) => {
    try {
        const channelId = parseInt(req.params.id);
        const { Content, AttachmentPath, AttachmentName, AttachmentType, AttachmentSize } = req.body || {};
        const content = (Content || '').trim();
        if (!content && !AttachmentPath) {
            return res.status(400).json({ error: 'Message must have text or an attachment.' });
        }
        const pool = await getPool();
        await assertMemberOrAdmin(pool, req, channelId);
        const ins = await pool.request()
            .input('cid', sql.Int, channelId)
            .input('sid', sql.Int, req.user.userId)
            .input('body', sql.NVarChar(sql.MAX), content || null)
            .input('ap',   sql.NVarChar(300), AttachmentPath || null)
            .input('an',   sql.NVarChar(200), AttachmentName || null)
            .input('at',   sql.NVarChar(100), AttachmentType || null)
            .input('as',   sql.BigInt, AttachmentSize || null)
            .query(`INSERT INTO dms_ChatMessages
                        (ChannelID, SenderID, Content,
                         AttachmentPath, AttachmentName, AttachmentType, AttachmentSize)
                    OUTPUT INSERTED.MessageID, INSERTED.CreatedAt
                    VALUES (@cid, @sid, @body, @ap, @an, @at, @as)`);
        const { MessageID, CreatedAt } = ins.recordset[0];

        // Denormalised LastMessageAt for cheap sort.
        await pool.request()
            .input('cid', sql.Int, channelId)
            .input('t',   sql.DateTime, CreatedAt)
            .query(`UPDATE dms_ChatChannels SET LastMessageAt = @t WHERE ChannelID = @cid`);

        const message = {
            MessageID, ChannelID: channelId,
            SenderID:   req.user.userId,
            SenderName: req.user.userName,
            Content:    content || null,
            CreatedAt,
            AttachmentPath: AttachmentPath || null,
            AttachmentName: AttachmentName || null,
            AttachmentType: AttachmentType || null,
            AttachmentSize: AttachmentSize || null,
        };
        // Broadcast to every member connected right now.
        chatSocket.emitToChannel(channelId, 'chat:message', message);
        res.status(201).json(message);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// ---- Mark read -------------------------------------------------------------
exports.markRead = async (req, res) => {
    try {
        const channelId = parseInt(req.params.id);
        const { messageId } = req.body || {};
        const pool = await getPool();
        await assertMemberOrAdmin(pool, req, channelId);
        await pool.request()
            .input('cid', sql.Int, channelId)
            .input('uid', sql.Int, req.user.userId)
            .input('mid', sql.Int, messageId || null)
            .query(`UPDATE dms_ChatMembers
                    SET LastReadMessageID = CASE
                        WHEN LastReadMessageID IS NULL THEN @mid
                        WHEN @mid IS NULL              THEN LastReadMessageID
                        WHEN @mid > LastReadMessageID  THEN @mid
                        ELSE LastReadMessageID END
                    WHERE ChannelID = @cid AND UserID = @uid`);
        res.json({ ok: true });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// ---- Admin audit -----------------------------------------------------------
exports.auditListChannels = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT c.ChannelID, c.Kind, c.Name, c.Description,
                   c.CreatedBy, c.CreatedAt, c.LastMessageAt,
                   (SELECT COUNT(*) FROM dms_ChatMembers WHERE ChannelID = c.ChannelID) AS MemberCount,
                   (SELECT COUNT(*) FROM dms_ChatMessages WHERE ChannelID = c.ChannelID) AS MessageCount
            FROM   dms_ChatChannels c
            ORDER  BY ISNULL(c.LastMessageAt, c.CreatedAt) DESC`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};
