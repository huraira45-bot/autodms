/**
 * Bay screen devices — service tablet app, Phase 3 (plan 2026-09-14).
 *
 * A bay screen is a tablet or TV fixed at one bay. It can't live on an 8-hour
 * login, so it holds a long-lived DEVICE token instead, built so that it can
 * do nothing except show and time its own bay's jobs:
 *   - the token's scope is 'bay_screen', and the main API auth middleware
 *     refuses any scoped token, so it works nowhere else in DealerDesk
 *   - every request re-checks dms_BayScreenDevices, so unregistering a screen
 *     cuts it off immediately
 *   - the bay comes from the device record, never from the request, so a
 *     screen can only act on job lines on its own bay
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sql, getPool } = require('../config/db');

const DEVICE_TOKEN_DAYS = 365;

const newTokenId = () => crypto.randomUUID();

function signDeviceToken(deviceId, tokenId) {
    return jwt.sign({ scope: 'bay_screen', deviceId, jti: tokenId }, process.env.JWT_SECRET,
                    { expiresIn: `${DEVICE_TOKEN_DAYS}d` });
}

/** The active (not revoked) device a verified token belongs to, or null. */
async function findActiveDevice(decoded) {
    if (decoded?.scope !== 'bay_screen' || !Number.isInteger(decoded.deviceId) || !decoded.jti) return null;
    const pool = await getPool();
    const r = await pool.request()
        .input('id', sql.Int, decoded.deviceId)
        .input('jti', sql.UniqueIdentifier, decoded.jti)
        .query(`SELECT d.DeviceID, d.DeviceName, d.BayID, b.BayName
                FROM   dms_BayScreenDevices d
                JOIN   dms_Bays b ON b.BayID = d.BayID
                WHERE  d.DeviceID = @id AND d.TokenID = @jti AND d.RevokedAt IS NULL`);
    return r.recordset[0] || null;
}

/** Express middleware for /api/bay-screen: a valid, unrevoked device token. */
function requireBayDevice(req, res, next) {
    const refuse = (code, error) => res.status(401).json({ error, code });
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return refuse('device_unregistered', 'This screen is not registered to a bay.');

    let decoded;
    try {
        decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    } catch {
        return refuse('device_unregistered', 'This screen\'s registration has expired. Register it again.');
    }
    if (decoded.scope !== 'bay_screen') return refuse('device_unregistered', 'This screen is not registered to a bay.');

    findActiveDevice(decoded)
        .then((device) => {
            if (!device) return refuse('device_revoked', 'This screen has been unregistered. Register it again.');
            req.device = device;
            // "Last seen" for the device list, written at most once a minute.
            getPool()
                .then(pool => pool.request().input('id', sql.Int, device.DeviceID)
                    .query(`UPDATE dms_BayScreenDevices SET LastSeenAt = GETDATE()
                            WHERE DeviceID = @id
                              AND (LastSeenAt IS NULL OR LastSeenAt < DATEADD(MINUTE, -1, GETDATE()))`))
                .catch(() => {});
            return next();
        })
        .catch((err) => {
            console.error('requireBayDevice:', err);
            res.status(500).json({ error: err.message });
        });
}

module.exports = { DEVICE_TOKEN_DAYS, newTokenId, signDeviceToken, findActiveDevice, requireBayDevice };
