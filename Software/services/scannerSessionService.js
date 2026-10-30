const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_PAGE_BYTES = 10 * 1024 * 1024;
const MAX_BATCH_BYTES = 200 * 1024 * 1024;
const MAX_PAGES = 100;
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const digest = value => crypto.createHash('sha256').update(value).digest();

class ScannerSessionStore {
    constructor({ root = path.join(__dirname, '..', '.scanner-temp'), ttl = 30 * 60 * 1000, now = Date.now } = {}) {
        this.root = path.resolve(root); this.ttl = ttl; this.now = now; this.sessions = new Map();
    }
    directory(id) {
        if (!/^[a-f0-9]{32}$/.test(id)) fail(404, 'Scan session not found.');
        const target = path.resolve(this.root, id);
        if (path.dirname(target) !== this.root) fail(400, 'Invalid scan directory.');
        return target;
    }
    async cleanup() {
        for (const [id, session] of this.sessions) if (session.expiresAt <= this.now()) await this.remove(id);
        if (!fs.existsSync(this.root)) return;
        for (const entry of await fs.promises.readdir(this.root, { withFileTypes: true })) {
            if (!entry.isDirectory() || !/^[a-f0-9]{32}$/.test(entry.name) || this.sessions.has(entry.name)) continue;
            const directory = this.directory(entry.name), stat = await fs.promises.stat(directory);
            if (stat.mtimeMs + this.ttl <= this.now()) await fs.promises.rm(directory, { recursive: true, force: true });
        }
    }
    async create(user, source = 'duplex', format = 'jpeg') {
        if (!user?.userId) fail(401, 'Sign in before scanning.');
        if (!['duplex', 'feeder'].includes(source)) fail(400, 'Choose single-sided or double-sided scanning.');
        if (!['jpeg', 'pdf'].includes(format)) fail(400, 'Choose page images or one PDF.');
        await this.cleanup();
        if (this.sessions.size >= 20 || [...this.sessions.values()].filter(s => String(s.owner) === String(user.userId)).length >= 2)
            fail(429, 'Finish or cancel an existing scan before starting another.');
        const id = crypto.randomBytes(16).toString('hex'), token = crypto.randomBytes(32).toString('hex');
        const session = { id, owner: user.userId, tokenHash: digest(token), source, format, status: 'waiting',
            expiresAt: this.now() + this.ttl, pages: [], bytes: 0, error: null };
        this.sessions.set(id, session);
        try { await fs.promises.mkdir(this.directory(id), { recursive: true }); }
        catch (error) { this.sessions.delete(id); throw error; }
        return { id, expiresAt: session.expiresAt,
            launchUrl: `autodms-scan://scan/${id}?token=${token}&source=${source}&format=${format}` };
    }
    get(id) {
        this.directory(id);
        const session = this.sessions.get(id);
        if (!session || session.expiresAt <= this.now()) fail(410, 'This scan session expired or the server restarted. Start a new scan.');
        return session;
    }
    owned(id, user) {
        const session = this.get(id);
        if (String(session.owner) !== String(user?.userId)) fail(403, 'This scan belongs to another user.');
        return session;
    }
    ingest(id, token) {
        const session = this.get(id);
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !crypto.timingSafeEqual(digest(token), session.tokenHash))
            fail(401, 'Invalid scanner session key.');
        return session;
    }
    claim(session) {
        if (session.status !== 'waiting') fail(409, 'This scan has already started.');
        session.status = 'scanning';
    }
    async addPage(session, index, file) {
        if (this.get(session.id) !== session || session.status !== 'scanning') fail(409, 'This scan is not accepting pages.');
        if (!Number.isInteger(index) || index < 1 || index > MAX_PAGES || session.pages.some(p => p.index === index))
            fail(400, 'Invalid or duplicate scanned page number.');
        const mime = session.format === 'pdf' ? 'application/pdf' : 'image/jpeg';
        if (!file || file.mimetype !== mime || file.size < 5 || file.size > MAX_PAGE_BYTES || (session.format === 'pdf' && index !== 1))
            fail(400, 'The scanned file has the wrong format or exceeds 10 MB.');
        if (session.bytes + file.size > MAX_BATCH_BYTES) fail(413, 'This batch exceeds 200 MB. Scan a smaller batch.');
        if (path.dirname(path.resolve(file.path)) !== this.directory(session.id)) fail(400, 'Invalid scanned page path.');
        const handle = await fs.promises.open(file.path, 'r');
        try {
            const head = Buffer.alloc(5); await handle.read(head, 0, 5, 0);
            const valid = session.format === 'pdf' ? head.toString('ascii') === '%PDF-'
                : head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
            if (!valid) fail(400, 'The scanner did not return the expected JPG or PDF file.');
        } finally { await handle.close(); }
        // Recheck after disk I/O, including cancellation and concurrent uploads.
        if (this.get(session.id) !== session || session.status !== 'scanning') fail(409, 'This scan was cancelled.');
        if (session.pages.some(p => p.index === index) || session.bytes + file.size > MAX_BATCH_BYTES)
            fail(409, 'Duplicate page or batch limit reached.');
        session.pages.push({ index, name: session.format === 'pdf' ? 'Scanned-document.pdf' : `Scanned-page-${String(index).padStart(3, '0')}.jpg`,
            size: file.size, path: file.path, mime });
        session.bytes += file.size;
    }
    complete(session, body) {
        if (session.status !== 'scanning') fail(409, 'This scan has not started or is already finished.');
        if (typeof body?.error === 'string' && body.error.trim()) {
            session.status = 'error'; session.error = body.error.trim().slice(0, 500); return;
        }
        const pages = [...session.pages].sort((a, b) => a.index - b.index);
        if (!pages.length || body?.count !== pages.length || pages.some((p, i) => p.index !== i + 1))
            fail(400, 'Not every scanned page arrived. Start a new scan or upload the saved files manually.');
        session.status = 'ready';
    }
    state(session) {
        return { id: session.id, status: session.status, expiresAt: session.expiresAt, error: session.error,
            pages: [...session.pages].sort((a, b) => a.index - b.index).map(({ index, name, size, mime }) => ({ index, name, size, mime })) };
    }
    async remove(id) {
        const directory = this.directory(id), session = this.sessions.get(id);
        if (session) session.status = 'cancelled';
        this.sessions.delete(id);
        await fs.promises.rm(directory, { recursive: true, force: true });
    }
}
module.exports = { ScannerSessionStore, MAX_PAGE_BYTES, MAX_PAGES };
