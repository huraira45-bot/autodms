/**
 * Service tablet app — backend.
 * Plan: C:\Users\ServerDeskop\.claude\plans\do-you-have-database-glowing-crayon.md
 *
 * Phase 0 holds only the diagnostics that prove, on the real tablet, that it
 * reaches the server and can upload a walk-around video over the workshop
 * Wi-Fi — before intake, estimates and signatures are built on top of that.
 * The public reachability check lives in server.js, ahead of the auth
 * middleware, because it has to work before anyone has signed in.
 */
const fs = require('fs');

/**
 * POST /api/service-intake/diagnostics/upload   multipart, field "video"
 *
 * Receives a test video, reports what arrived so the tablet can compare it
 * with what it sent, then deletes it. Upload speed is measured on the tablet
 * from progress events — that is the figure that matters to the advisor
 * standing at the car.
 */
exports.diagnosticsUpload = (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'No file received. Send it in the "video" field.' });

    const result = {
        ok: true,
        bytes: f.size,
        megabytes: +(f.size / 1048576).toFixed(2),
        mimetype: f.mimetype,
        originalName: f.originalname,
        serverReceivedAt: new Date().toISOString(),
        note: 'Test upload deleted — nothing was stored.',
    };

    fs.unlink(f.path, (err) => {
        if (err) console.warn('diagnosticsUpload: could not delete test file', f.path, err.message);
    });
    res.json(result);
};
