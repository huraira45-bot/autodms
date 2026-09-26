/**
 * Bay camera relay — PROOF OF CONCEPT.
 *
 * Owner ask 2026-09-26: show the bay camera on the customer's watch page,
 * locally, to prove the idea end to end.
 *
 * How it works: the bay screen grabs a frame from its camera every so often,
 * encodes it as a JPEG and sends it over the socket it already holds. This
 * relays it to whoever is watching that car. The viewer's page draws each
 * frame as it arrives.
 *
 * THIS IS NOT HOW IT SHOULD SHIP. It is JPEG frames over a websocket — a slide
 * show, not video. It costs far more bandwidth per frame than real video
 * compression, it has no audio, and it will not scale past a handful of
 * viewers. It is here because it proves the whole path — camera, server,
 * customer's browser, the right car — with parts already in place, and that
 * is what a proof of concept is for. Real streaming means WebRTC or a media
 * server, decided separately.
 *
 * Two things it does NOT cut corners on, because they would be wrong at any
 * stage:
 *
 *   * A viewer proves which car they may watch with their watch token, which
 *     is checked against the database on connect. One customer cannot watch
 *     another's car by editing a number.
 *   * A bay screen may only send frames for a car actually on its own bay,
 *     checked once when it starts rather than on every frame.
 *
 * Nothing is written to disk. Recording is a separate job.
 */
const { sql, getPool } = require('../config/db');

let watchNsp = null;

// Roughly a 720p JPEG at middling quality. A frame larger than this is not a
// camera frame, it is something else, and is dropped rather than relayed.
const MAX_FRAME_BYTES = 400 * 1024;

const roomFor = (jobCardId) => `watch:${jobCardId}`;

/** The car a watch token is good for, or null. */
async function jobCardForToken(token) {
    if (!token || typeof token !== 'string' || token.length > 64) return null;
    const pool = await getPool();
    const r = await pool.request().input('t', sql.NVarChar(64), token).query(`
        SELECT JobCardID, JobCardNo, VehicleRegNo, BayName
        FROM   dms_BayStreamLinks
        WHERE  Token = @t AND Status = 'Active' AND ExpiresAt > GETDATE()`);
    return r.recordset[0] || null;
}

/** Is this car on this bay screen's bay? Checked when a stream starts. */
async function carIsOnBay(jobCardId, bayName) {
    const pool = await getPool();
    const r = await pool.request()
        .input('jc', sql.Int, jobCardId)
        .input('bay', sql.NVarChar(20), bayName)
        .query(`SELECT TOP 1 1 AS ok FROM Addata_JobCardInfoDetail
                WHERE JobCardId = @jc AND BayNo = @bay`);
    return !!r.recordset.length;
}

/** How many people are watching this car right now. */
const viewerCount = (jobCardId) => {
    const room = watchNsp?.adapter?.rooms?.get(roomFor(jobCardId));
    return room ? room.size : 0;
};

/**
 * Tell the bay screens whether anyone is watching a car.
 *
 * Without this the bay screen would encode and send frames into nothing all
 * day, for every car on the bay — a camera that costs CPU and bandwidth with
 * nobody at the other end.
 */
function announceViewers(serviceNsp, jobCardId) {
    if (!serviceNsp) return;
    serviceNsp.to('bay-screens').emit('watch:viewers', {
        JobCardId: jobCardId,
        viewers: viewerCount(jobCardId),
    });
}

/**
 * Wires the relay onto the socket server.
 *   serviceNsp — the existing /service namespace (bay screens live there)
 *   io         — so the public /watch namespace can be created
 */
function attach(io, serviceNsp) {
    if (watchNsp || !io) return;

    // ---- viewers: public, no login, the token is the credential ----
    watchNsp = io.of('/watch');
    watchNsp.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        jobCardForToken(token)
            .then((car) => {
                if (!car) return next(new Error('unauthorized'));
                socket.data.car = car;
                next();
            })
            .catch(() => next(new Error('unauthorized')));
    });

    watchNsp.on('connection', (socket) => {
        const car = socket.data.car;
        socket.join(roomFor(car.JobCardID));
        socket.emit('watch:ready', {
            JobCardNo: car.JobCardNo,
            VehicleRegNo: car.VehicleRegNo,
            BayName: car.BayName,
        });
        announceViewers(serviceNsp, car.JobCardID);

        socket.on('disconnect', () => {
            // The socket has already left the room by the time this fires, so
            // the count is the remaining viewers.
            announceViewers(serviceNsp, car.JobCardID);
        });
    });

    // ---- senders: the bay screens, on the namespace they already use ----
    if (!serviceNsp) return;
    serviceNsp.on('connection', (socket) => {
        const who = socket.data.who;
        if (who?.kind !== 'bay') return;

        // Which cars this screen has been cleared to send for. Checked once
        // here rather than on every frame, which would be a database query
        // several times a second.
        socket.data.streamingFor = new Set();

        socket.on('bay:stream-begin', async (payload, ack) => {
            const jobCardId = parseInt(payload?.JobCardId);
            if (!Number.isInteger(jobCardId)) return ack?.({ ok: false, error: 'Which car?' });
            try {
                const allowed = await carIsOnBay(jobCardId, who.device.BayName);
                if (!allowed) return ack?.({ ok: false, error: 'That car is not on this bay.' });
                socket.data.streamingFor.add(jobCardId);
                ack?.({ ok: true, viewers: viewerCount(jobCardId) });
            } catch (err) {
                ack?.({ ok: false, error: err.message });
            }
        });

        socket.on('bay:stream-end', (payload) => {
            const jobCardId = parseInt(payload?.JobCardId);
            if (Number.isInteger(jobCardId)) {
                socket.data.streamingFor.delete(jobCardId);
                watchNsp.to(roomFor(jobCardId)).emit('watch:stopped');
            }
        });

        socket.on('bay:frame', (payload) => {
            const jobCardId = parseInt(payload?.JobCardId);
            const frame = payload?.frame;
            if (!socket.data.streamingFor?.has(jobCardId)) return;   // never cleared for this car
            if (typeof frame !== 'string' || frame.length > MAX_FRAME_BYTES) return;
            if (!viewerCount(jobCardId)) return;                     // nobody is watching
            watchNsp.to(roomFor(jobCardId)).emit('watch:frame', { frame, at: Date.now() });
        });

        socket.on('disconnect', () => {
            for (const jobCardId of socket.data.streamingFor || []) {
                watchNsp.to(roomFor(jobCardId)).emit('watch:stopped');
            }
        });
    });
}

module.exports = { attach };
