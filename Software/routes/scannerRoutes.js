const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ScannerSessionStore, MAX_PAGE_BYTES, MAX_PAGES } = require('../services/scannerSessionService');
const store = new ScannerSessionStore();
const protectedRouter = express.Router(), ingestRouter = express.Router();
const run = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(error =>
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Scanner operation failed. Please try again.' }));
const permitted = (req, res, next) => {
    if (req.user?.groupId === 1 || req.user?.modules?.some(key => ['sales_executive', 'sales_agm', 'sales_gm', 'sales_master_settlement', 'sales_admin_settings'].includes(key))) return next();
    return res.status(403).json({ error: 'Sales document upload permission is required to scan.' });
};
protectedRouter.use(permitted);
protectedRouter.get('/sessions', run(async (req, res) => {
    res.set('Cache-Control', 'no-store'); res.json(await store.listOwned(req.user));
}));
protectedRouter.post('/sessions', run(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(201).json(await store.create(req.user, req.body?.source || 'duplex', req.body?.format || 'jpeg'));
}));
protectedRouter.get('/sessions/:id', run(async (req, res) => {
    res.set('Cache-Control', 'no-store'); res.json(store.state(store.owned(req.params.id, req.user)));
}));
protectedRouter.get('/sessions/:id/pages/:page', run(async (req, res) => {
    const session = store.owned(req.params.id, req.user);
    if (session.status !== 'ready') return res.status(409).json({ error: 'The scanner has not finished yet.' });
    const page = session.pages.find(p => p.index === Number(req.params.page));
    if (!page) return res.status(404).json({ error: 'Scanned page not found.' });
    res.set('Cache-Control', 'no-store'); res.type(page.mime); res.sendFile(page.path);
}));
protectedRouter.delete('/sessions/:id', run(async (req, res) => {
    store.owned(req.params.id, req.user); await store.remove(req.params.id); res.json({ ok: true });
}));
protectedRouter.get('/setup', run(async (req, res) => {
    const origin = new URL(`${req.protocol}://${req.get('host')}`);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('Invalid server address.');
    const directory = path.join(__dirname, '..', 'scanner');
    const worker = await fs.promises.readFile(path.join(directory, 'Start-AutoDMSScan.ps1'));
    const template = await fs.promises.readFile(path.join(directory, 'Install-AutoDMSScanner.ps1'), 'utf8');
    const script = template.replace('__AUTODMS_WORKER_BASE64__', worker.toString('base64'))
        .replace('__AUTODMS_SERVER_ORIGIN__', origin.origin.replace(/'/g, "''"));
    res.set('Cache-Control', 'no-store');
    res.attachment('Install-AutoDMSScanner.ps1').type('text/plain').send(script);
}));

// These endpoints accept only the random, short-lived scan key, never a user JWT.
ingestRouter.use('/:id', run(async (req, _res, next) => {
    req.scanSession = store.ingest(req.params.id, req.get('X-AutoDMS-Scan-Key')); next();
}));
ingestRouter.post('/:id/start', run(async (req, res) => { store.claim(req.scanSession); res.json({ ok: true }); }));
const upload = multer({ storage: multer.diskStorage({
    destination: (req, _file, cb) => cb(null, store.directory(req.scanSession.id)),
    filename: (req, _file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}.${req.scanSession.format === 'pdf' ? 'pdf' : 'jpg'}`),
}), limits: { fileSize: MAX_PAGE_BYTES, files: 1, fields: 0 },
fileFilter: (req, file, cb) => {
    const accepted = file.mimetype === (req.scanSession.format === 'pdf' ? 'application/pdf' : 'image/jpeg');
    cb(accepted ? null : new Error('The scanner returned an unexpected file type.'), accepted);
} }).single('file');
ingestRouter.post('/:id/pages/:page', (req, res, next) => {
    const page = Number(req.params.page);
    if (req.scanSession.status !== 'scanning' || !Number.isInteger(page) || page < 1 || page > MAX_PAGES)
        return res.status(409).json({ error: 'This scan is not accepting that page.' });
    upload(req, res, error => error ? res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.message }) : next());
}, run(async (req, res) => {
    try { await store.addPage(req.scanSession, Number(req.params.page), req.file); res.status(201).json({ ok: true }); }
    catch (error) { if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {}); throw error; }
}));
ingestRouter.post('/:id/complete', run(async (req, res) => { store.complete(req.scanSession, req.body); res.json({ ok: true }); }));
const cleanup = setInterval(() => store.cleanup().catch(() => {}), 60000); cleanup.unref();
module.exports = { protectedRouter, ingestRouter, store, permitted };
