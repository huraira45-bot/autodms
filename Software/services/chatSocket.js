// Socket.io server for internal chat.
//
// Attach with chatSocket.attach(httpServer) after Express is wired up.
// Clients connect at the /chat namespace with a JWT in the handshake
// (either as `auth.token` or `?token=`). Once authed, each client is
// auto-joined to a room per channel it belongs to, and any new message
// posted via /api/chat/channels/:id/messages is broadcast to that room.
//
// Public API:
//   attach(httpServer)                  — bind to the http.Server
//   emitToChannel(channelId, evt, data) — broadcast to every member online
//   emitToUser(userId, evt, data)       — direct emit to one user (all sockets)
const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../config/db');

let io = null;

function channelRoom(id)      { return `channel:${id}`; }
function userRoom(userId)     { return `user:${userId}`; }

async function loadChannelIdsForUser(userId) {
    const pool = await getPool();
    const r = await pool.request()
        .input('uid', sql.Int, userId)
        .query('SELECT ChannelID FROM dms_ChatMembers WHERE UserID = @uid');
    return r.recordset.map(x => x.ChannelID);
}

function verifyHandshakeToken(handshake) {
    const raw = handshake.auth?.token
        || handshake.query?.token
        || (handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!raw) return null;
    try { return jwt.verify(raw, process.env.JWT_SECRET); }
    catch { return null; }
}

function attach(httpServer) {
    if (io) return io;
    const { Server } = require('socket.io');
    io = new Server(httpServer, {
        cors: { origin: '*' },
        path: '/socket.io',
    });

    const chat = io.of('/chat');

    chat.use((socket, next) => {
        const user = verifyHandshakeToken(socket.handshake);
        if (!user?.userId) return next(new Error('unauthorized'));
        // A user without the `chat_use` permission can't send/receive.
        // Admin group (1) is always allowed.
        const allowed = user.groupId === 1
            || (Array.isArray(user.modules) && user.modules.includes('chat_use'))
            || (Array.isArray(user.modules) && user.modules.includes('chat_admin'));
        if (!allowed) return next(new Error('chat permission required'));
        socket.data.user = user;
        return next();
    });

    chat.on('connection', async (socket) => {
        const { userId, userName } = socket.data.user;
        socket.join(userRoom(userId));
        try {
            const channels = await loadChannelIdsForUser(userId);
            for (const cid of channels) socket.join(channelRoom(cid));
        } catch (e) {
            console.error('[chatSocket] join channels failed:', e.message);
        }

        // Broadcast presence — best-effort.
        chat.emit('presence:online', { userId, userName });

        socket.on('chat:typing', ({ channelId }) => {
            if (!channelId) return;
            socket.to(channelRoom(channelId)).emit('chat:typing', {
                channelId, userId, userName,
            });
        });

        socket.on('chat:join', ({ channelId }) => {
            // Client-driven re-join after being added to a new channel.
            if (channelId) socket.join(channelRoom(channelId));
        });

        socket.on('disconnect', () => {
            chat.emit('presence:offline', { userId });
        });
    });

    return io;
}

function emitToChannel(channelId, event, data) {
    if (!io) return;
    io.of('/chat').to(channelRoom(channelId)).emit(event, data);
}

function emitToUser(userId, event, data) {
    if (!io) return;
    io.of('/chat').to(userRoom(userId)).emit(event, data);
}

module.exports = { attach, emitToChannel, emitToUser };
