/**
 * Videos on the lobby job board (owner ask 2026-09-23).
 *
 * The TV shows the job board for a minute, plays one video to the end, shows
 * the board again, plays the next, and loops back to the first after the last.
 * This file is the library behind that: upload, order, switch on and off,
 * delete — plus the anonymous playlist the TV itself reads.
 *
 * The playlist endpoint is public, like /api/kiosk/jobs-live, because the
 * lobby screen has no login. It exposes nothing but the file names of clips
 * somebody deliberately published to a television.
 */
const fs = require('fs');
const path = require('path');
const { sql, getPool } = require('../config/db');
const { UPLOAD_DIR } = require('../middleware/kioskVideoUpload');

const PUBLIC_PREFIX = '/uploads/kiosk-videos/';
const BOARD_SECONDS_MIN = 10;
const BOARD_SECONDS_MAX = 3600;

const fail = (res, code, msg) => res.status(code).json({ error: msg });

// ---------------------------------------------------------------------------
// The lobby screen (no login)
// ---------------------------------------------------------------------------

/** GET /api/kiosk/playlist — what the TV should play, in order. */
exports.getPlaylist = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT VideoID, Title, FileName
            FROM   dms_KioskVideos
            WHERE  IsActive = 1
            ORDER  BY SortOrder, VideoID`);

        const set = await pool.request().query(
            `SELECT SettingValue FROM dms_KioskSettings WHERE SettingKey = 'BoardSeconds'`);
        const boardSeconds = Math.min(BOARD_SECONDS_MAX, Math.max(BOARD_SECONDS_MIN,
            parseInt(set.recordset[0]?.SettingValue, 10) || 60));

        res.json({
            boardSeconds,
            videos: r.recordset.map(v => ({
                VideoID: v.VideoID,
                Title: v.Title,
                url: PUBLIC_PREFIX + v.FileName,
            })),
        });
    } catch (err) {
        console.error('kiosk getPlaylist:', err);
        // The board matters more than the videos: never take the screen down
        // over a playlist problem, just show no videos.
        res.json({ boardSeconds: 60, videos: [] });
    }
};

// ---------------------------------------------------------------------------
// Managing the library (signed in)
// ---------------------------------------------------------------------------

/** GET /api/kiosk-videos */
exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT VideoID, Title, FileName, OriginalName, MimeType, SizeBytes,
                   SortOrder, IsActive, UploadedByName, UploadedAt
            FROM   dms_KioskVideos
            ORDER  BY SortOrder, VideoID`);

        const set = await pool.request().query(
            `SELECT SettingValue FROM dms_KioskSettings WHERE SettingKey = 'BoardSeconds'`);

        res.json({
            boardSeconds: parseInt(set.recordset[0]?.SettingValue, 10) || 60,
            videos: r.recordset.map(v => ({ ...v, url: PUBLIC_PREFIX + v.FileName })),
        });
    } catch (err) {
        console.error('kiosk video list:', err);
        fail(res, 500, err.message);
    }
};

/** POST /api/kiosk-videos  (multipart: video, Title) */
exports.upload = async (req, res) => {
    if (!req.file) return fail(res, 400, 'Choose a video file to upload.');
    try {
        const title = String(req.body?.Title || '').trim()
            || path.basename(req.file.originalname || 'Video', path.extname(req.file.originalname || ''));

        const pool = await getPool();
        // New clips play last until somebody moves them.
        const next = await pool.request().query(
            `SELECT ISNULL(MAX(SortOrder), 0) + 1 AS n FROM dms_KioskVideos`);

        const r = await pool.request()
            .input('t',  sql.NVarChar(200), title.slice(0, 200))
            .input('f',  sql.NVarChar(260), req.file.filename)
            .input('o',  sql.NVarChar(260), (req.file.originalname || '').slice(0, 260))
            .input('m',  sql.NVarChar(100), req.file.mimetype || null)
            .input('s',  sql.BigInt,        req.file.size || null)
            .input('so', sql.Int,           next.recordset[0].n)
            .input('by', sql.Int,           req.user?.employeeId || null)
            .input('bn', sql.NVarChar(200), req.user?.userName || null)
            .query(`INSERT INTO dms_KioskVideos
                        (Title, FileName, OriginalName, MimeType, SizeBytes, SortOrder,
                         IsActive, UploadedByEmployeeID, UploadedByName)
                    OUTPUT INSERTED.VideoID
                    VALUES (@t, @f, @o, @m, @s, @so, 1, @by, @bn)`);

        res.status(201).json({
            message: 'Video added to the lobby board.',
            VideoID: r.recordset[0].VideoID,
            url: PUBLIC_PREFIX + req.file.filename,
        });
    } catch (err) {
        console.error('kiosk video upload:', err);
        // The row is what makes the file real; a file with no row is litter.
        try { fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename)); } catch { /* already gone */ }
        fail(res, 500, err.message);
    }
};

/** PATCH /api/kiosk-videos/:id   { Title?, IsActive? } */
exports.update = async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return fail(res, 400, 'Invalid video id.');
    try {
        const sets = [];
        const pool = await getPool();
        const rq = pool.request().input('id', sql.Int, id);

        if (req.body?.Title !== undefined) {
            const t = String(req.body.Title).trim();
            if (!t) return fail(res, 400, 'A video needs a name.');
            rq.input('t', sql.NVarChar(200), t.slice(0, 200));
            sets.push('Title = @t');
        }
        if (req.body?.IsActive !== undefined) {
            rq.input('a', sql.Bit, req.body.IsActive ? 1 : 0);
            sets.push('IsActive = @a');
        }
        if (!sets.length) return fail(res, 400, 'Nothing to change.');

        const r = await rq.query(`UPDATE dms_KioskVideos SET ${sets.join(', ')} WHERE VideoID = @id`);
        if (!r.rowsAffected[0]) return fail(res, 404, 'That video is not in the library.');
        res.json({ message: 'Saved.' });
    } catch (err) {
        console.error('kiosk video update:', err);
        fail(res, 500, err.message);
    }
};

/** PUT /api/kiosk-videos/order   { order: [VideoID, ...] } */
exports.reorder = async (req, res) => {
    const order = Array.isArray(req.body?.order) ? req.body.order.map(Number).filter(Number.isInteger) : null;
    if (!order || !order.length) return fail(res, 400, 'Send the video ids in the order they should play.');
    try {
        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            for (let i = 0; i < order.length; i++) {
                await new sql.Request(tx)
                    .input('id', sql.Int, order[i])
                    .input('so', sql.Int, i + 1)
                    .query(`UPDATE dms_KioskVideos SET SortOrder = @so WHERE VideoID = @id`);
            }
            await tx.commit();
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
        res.json({ message: 'Play order saved.' });
    } catch (err) {
        console.error('kiosk video reorder:', err);
        fail(res, 500, err.message);
    }
};

/** DELETE /api/kiosk-videos/:id — removes the row and the file. */
exports.remove = async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return fail(res, 400, 'Invalid video id.');
    try {
        const pool = await getPool();
        const found = await pool.request().input('id', sql.Int, id)
            .query(`SELECT FileName FROM dms_KioskVideos WHERE VideoID = @id`);
        if (!found.recordset.length) return fail(res, 404, 'That video is not in the library.');

        await pool.request().input('id', sql.Int, id)
            .query(`DELETE FROM dms_KioskVideos WHERE VideoID = @id`);
        // Disk space on this server is tight, so the file goes with the row.
        try { fs.unlinkSync(path.join(UPLOAD_DIR, found.recordset[0].FileName)); } catch { /* already gone */ }

        res.json({ message: 'Video removed.' });
    } catch (err) {
        console.error('kiosk video delete:', err);
        fail(res, 500, err.message);
    }
};

/** PUT /api/kiosk-videos/settings   { boardSeconds } */
exports.saveSettings = async (req, res) => {
    const secs = parseInt(req.body?.boardSeconds, 10);
    if (!Number.isInteger(secs) || secs < BOARD_SECONDS_MIN || secs > BOARD_SECONDS_MAX) {
        return fail(res, 400, `The board has to show for between ${BOARD_SECONDS_MIN} and ${BOARD_SECONDS_MAX} seconds.`);
    }
    try {
        const pool = await getPool();
        await pool.request()
            .input('v', sql.NVarChar(200), String(secs))
            .input('n', sql.NVarChar(200), req.user?.userName || null)
            .query(`UPDATE dms_KioskSettings
                    SET SettingValue = @v, UpdatedAt = GETDATE(), UpdatedByName = @n
                    WHERE SettingKey = 'BoardSeconds';
                    IF @@ROWCOUNT = 0
                        INSERT INTO dms_KioskSettings (SettingKey, SettingValue, UpdatedByName)
                        VALUES ('BoardSeconds', @v, @n);`);
        res.json({ message: 'Saved.', boardSeconds: secs });
    } catch (err) {
        console.error('kiosk settings:', err);
        fail(res, 500, err.message);
    }
};
