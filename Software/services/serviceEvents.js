/**
 * Live updates for the service tablet app — plan 2026-09-14, Phase 3.
 * A socket.io namespace, /service, on the same server as chat.
 *
 * Events carry ids only. A screen that hears one reloads what it shows through
 * the normal permission-checked API, so a socket can never hand anyone data
 * they couldn't already fetch. The screens also poll every 15 seconds, so a
 * dropped socket makes them slower to update, never wrong.
 *
 * Rooms:
 *   bay-screens     every registered bay screen
 *   parts-counter   signed-in users holding parts_requisition (or admin)
 *   advisor:<id>    each signed-in user holding workshop_tablet (or admin)
 */
const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../config/db');
const { findActiveDevice } = require('./bayDevices');

let nsp = null;

async function identify(handshake) {
    const raw = handshake.auth?.token || handshake.query?.token;
    if (!raw) return null;
    let decoded;
    try { decoded = jwt.verify(raw, process.env.JWT_SECRET); } catch { return null; }

    if (decoded.scope === 'bay_screen') {
        const device = await findActiveDevice(decoded);
        return device ? { kind: 'bay', device } : null;
    }
    if (decoded.scope || !decoded.userId) return null;

    // Permissions fresh from the database, as the REST auth middleware does.
    const pool = await getPool();
    const r = await pool.request().input('g', sql.Int, decoded.groupId)
        .query('SELECT PermissionKey FROM dms_ModulePermissions WHERE GroupID = @g');
    return { kind: 'user', user: decoded, permissions: r.recordset.map(x => x.PermissionKey) };
}

function attach(io) {
    if (nsp || !io) return nsp;
    nsp = io.of('/service');

    nsp.use((socket, next) => {
        identify(socket.handshake)
            .then((who) => {
                if (!who) return next(new Error('unauthorized'));
                socket.data.who = who;
                return next();
            })
            .catch(() => next(new Error('unauthorized')));
    });

    nsp.on('connection', (socket) => {
        const who = socket.data.who;
        if (who.kind === 'bay') {
            socket.join('bay-screens');
            return;
        }
        const has = (key) => who.user.groupId === 1 || who.permissions.includes(key);
        if (has('workshop_tablet')) socket.join(`advisor:${who.user.userId}`);
        if (has('parts_requisition')) socket.join('parts-counter');
    });

    return nsp;
}

const emit = (room, event, payload) => {
    if (nsp) nsp.to(room).emit(event, payload || {});
};

module.exports = {
    attach,
    /** Job lines on some bay changed (opened, added, started, finished). */
    bayJobsChanged: (payload) => emit('bay-screens', 'bay:jobs-changed', payload),
    /** A parts requisition was created, issued against or cancelled. */
    requisitionsChanged: (payload) => emit('parts-counter', 'requisitions:changed', payload),
    /** Something on a job card this advisor opened changed. */
    advisorJobCardChanged: (userId, payload) => {
        if (userId) emit(`advisor:${userId}`, 'jobcard:changed', payload);
    },
};
