const fs = require('fs'), os = require('os'), path = require('path');
const { ScannerSessionStore, MAX_PAGE_BYTES } = require('../services/scannerSessionService');
const { permitted } = require('../routes/scannerRoutes');
let store, root, clock;
const user = { userId: 12 };
beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'autodms-scan-test-')); clock = Date.now();
    store = new ScannerSessionStore({ root, now: () => clock, ttl: 1000 });
});
afterEach(async () => { if (path.dirname(root) === os.tmpdir()) await fs.promises.rm(root, { recursive: true, force: true }); });
const scanKey = created => new URL(created.launchUrl).searchParams.get('token');
async function page(session, index, bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1]), mime = 'image/jpeg') {
    const filename = path.join(store.directory(session.id), `page-${index}-${Math.random()}.jpg`);
    await fs.promises.writeFile(filename, bytes);
    return { path: filename, size: bytes.length, mimetype: mime };
}

test('launch contains a batch-only capability and no server address, user JWT or customer data', async () => {
    const created = await store.create(user), uri = new URL(created.launchUrl);
    expect(uri.protocol).toBe('autodms-scan:'); expect(uri.hostname).toBe('scan');
    expect(scanKey(created)).toMatch(/^[a-f0-9]{64}$/);
    const session = store.owned(created.id, user);
    expect(session.tokenHash.toString('hex')).not.toBe(scanKey(created));
    expect(store.state(session)).not.toHaveProperty('tokenHash');
    expect(store.state(session)).not.toHaveProperty('owner');
    expect(created.launchUrl).not.toContain('http');
});
test('only the owning user can read or cancel a session', async () => {
    const created = await store.create(user);
    expect(() => store.owned(created.id, { userId: 99 })).toThrow('another user');
    expect(store.owned(created.id, user).id).toBe(created.id);
});
test('helper upload keys are bound to one session and required even for knowing its ID', async () => {
    const first = await store.create(user), second = await store.create({ userId: 13 });
    for (const token of [null, '', 'x'.repeat(64), scanKey(second)])
        expect(() => store.ingest(first.id, token)).toThrow('Invalid scanner');
    expect(store.ingest(first.id, scanKey(first)).id).toBe(first.id);
});
test('a scanner capability cannot be used as an application login token', async () => {
    const created = await store.create(user), auth = require('../middleware/auth');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }, next = jest.fn();
    await auth({ headers: { authorization: `Bearer ${scanKey(created)}` } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401); expect(next).not.toHaveBeenCalled();
});
test('a launch cannot scan the feeder twice for the same session', async () => {
    const created = await store.create(user), session = store.get(created.id);
    store.claim(session); expect(() => store.claim(session)).toThrow('already started');
});
test('a complete ordered batch is available for review with no server paths disclosed', async () => {
    const created = await store.create(user), session = store.get(created.id); store.claim(session);
    await store.addPage(session, 2, await page(session, 2)); await store.addPage(session, 1, await page(session, 1));
    store.complete(session, { count: 2 });
    const state = store.state(session);
    expect(state.status).toBe('ready'); expect(state.pages.map(p => p.index)).toEqual([1, 2]);
    expect(state.pages.every(p => !('path' in p))).toBe(true);
    await expect(store.addPage(session, 3, await page(session, 3))).rejects.toMatchObject({ status: 409 });
});
test('missing pages or a mismatched file count cannot be marked complete', async () => {
    const created = await store.create(user), session = store.get(created.id); store.claim(session);
    expect(() => store.complete(session, { count: 0 })).toThrow('Not every');
    await store.addPage(session, 2, await page(session, 2));
    expect(() => store.complete(session, { count: 1 })).toThrow('Not every');
    expect(() => store.complete(session, { count: 2 })).toThrow('Not every');
});
test('duplicate page indices do not create duplicate files in the review list', async () => {
    const created = await store.create(user), session = store.get(created.id); store.claim(session);
    await store.addPage(session, 1, await page(session, 1));
    await expect(store.addPage(session, 1, await page(session, 1))).rejects.toMatchObject({ status: 400 });
    expect(session.pages).toHaveLength(1);
});
test('mime labels alone cannot pass invalid file content', async () => {
    const created = await store.create(user), session = store.get(created.id); store.claim(session);
    await expect(store.addPage(session, 1, await page(session, 1, Buffer.from('not a jpeg')))).rejects.toThrow('expected JPG');
});
test('PDF mode accepts one PDF and retains its type and name', async () => {
    const created = await store.create(user, 'feeder', 'pdf'), session = store.get(created.id); store.claim(session);
    await store.addPage(session, 1, await page(session, 1, Buffer.from('%PDF-1.4\n'), 'application/pdf'));
    store.complete(session, { count: 1 });
    expect(store.state(session).pages[0]).toMatchObject({ name: 'Scanned-document.pdf', mime: 'application/pdf' });
});
test('PDF mode cannot be used to upload additional files or a disguised JPEG', async () => {
    const created = await store.create(user, 'feeder', 'pdf'), session = store.get(created.id); store.claim(session);
    await expect(store.addPage(session, 2, await page(session, 2, Buffer.from('%PDF-1.4\n'), 'application/pdf'))).rejects.toThrow('wrong format');
    await expect(store.addPage(session, 1, await page(session, 1))).rejects.toThrow('wrong format');
});
test('page, batch and page-number limits are enforced', async () => {
    const created = await store.create(user), session = store.get(created.id); store.claim(session);
    const file = await page(session, 1);
    await expect(store.addPage(session, 101, file)).rejects.toThrow('page number');
    await expect(store.addPage(session, 1, { ...file, size: MAX_PAGE_BYTES + 1 })).rejects.toThrow('10 MB');
    session.bytes = 200 * 1024 * 1024;
    await expect(store.addPage(session, 1, file)).rejects.toMatchObject({ status: 413 });
});
test('cancellation removes temporary files and revokes the helper key', async () => {
    const created = await store.create(user), session = store.get(created.id); store.claim(session);
    const file = await page(session, 1); await store.addPage(session, 1, file);
    await store.remove(created.id); expect(fs.existsSync(file.path)).toBe(false);
    expect(() => store.ingest(created.id, scanKey(created))).toThrow('expired');
});
test('expired sessions cannot upload/read and their files are cleaned up', async () => {
    const created = await store.create(user), session = store.get(created.id);
    const directory = store.directory(created.id); clock += 1001;
    expect(() => store.owned(created.id, user)).toThrow('expired');
    await store.cleanup(); expect(fs.existsSync(directory)).toBe(false);
    expect(session.status).toBe('cancelled');
});
test('cancelled work cannot add a page even if an in-flight upload has a session object', async () => {
    const created = await store.create(user), session = store.get(created.id); store.claim(session);
    const file = await page(session, 1); await store.remove(created.id);
    await expect(store.addPage(session, 1, file)).rejects.toThrow('expired');
});
test('path traversal cannot select a directory or page outside the private batch', async () => {
    expect(() => store.directory('../uploads')).toThrow('not found');
    const created = await store.create(user), session = store.get(created.id); store.claim(session);
    await expect(store.addPage(session, 1, { path: path.join(root, 'outside.jpg'), size: 6, mimetype: 'image/jpeg' })).rejects.toThrow('page path');
});
test('per-user limits and input validation apply before scanning', async () => {
    await expect(store.create({})).rejects.toMatchObject({ status: 401 });
    await expect(store.create(user, 'glass')).rejects.toMatchObject({ status: 400 });
    await expect(store.create(user, 'duplex', 'exe')).rejects.toMatchObject({ status: 400 });
    await store.create(user); await store.create(user);
    await expect(store.create(user)).rejects.toMatchObject({ status: 429 });
});
test('concurrent create requests cannot bypass the per-user session limit', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => store.create(user)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(2);
    expect(store.sessions.size).toBe(2);
});
test('scanner failures stay failures rather than appearing as an empty successful upload', async () => {
    const created = await store.create(user), session = store.get(created.id); store.claim(session);
    store.complete(session, { error: 'Scanner disconnected' });
    expect(store.state(session)).toMatchObject({ status: 'error', error: 'Scanner disconnected' });
});

test('empty failed scans stop occupying quota when another scan is requested', async () => {
    const failed = [];
    for (let i = 0; i < 2; i++) {
        const created = await store.create(user), session = store.get(created.id);
        store.claim(session); store.complete(session, { error: 'Scanner busy' }); failed.push(created);
    }
    const next = await store.create(user);
    expect(store.sessions.size).toBe(1); expect(store.get(next.id).status).toBe('waiting');
    for (const old of failed) {
        expect(() => store.ingest(old.id, scanKey(old))).toThrow('expired');
        expect(fs.existsSync(store.directory(old.id))).toBe(false);
    }
});

test('failed attempts with received pages are preserved for explicit cancellation', async () => {
    const created = await store.create(user), session = store.get(created.id); store.claim(session);
    const file = await page(session, 1); await store.addPage(session, 1, file);
    store.complete(session, { error: 'Second page upload failed' });
    await store.create(user);
    await expect(store.create(user)).rejects.toMatchObject({ status: 429 });
    expect(fs.existsSync(file.path)).toBe(true); expect(store.get(created.id).status).toBe('error');
});

test('listing after browser refresh exposes only owned metadata, without launch keys or paths', async () => {
    const first = await store.create(user), other = await store.create({ userId: 99 });
    store.claim(store.get(first.id));
    const list = await store.listOwned({ userId: '12' });
    expect(list).toHaveLength(1); expect(list[0]).toMatchObject({ id: first.id, status: 'scanning', format: 'jpeg' });
    const serialized = JSON.stringify(list);
    for (const secret of [scanKey(first), other.id, root, 'tokenHash', 'launchUrl', 'owner']) expect(serialized).not.toContain(secret);
    await expect(store.listOwned({})).rejects.toMatchObject({ status: 401 });
});

test('old waiting and ready attempts remain visible until explicitly cancelled', async () => {
    const ready = await store.create(user), session = store.get(ready.id); store.claim(session);
    await store.addPage(session, 1, await page(session, 1)); store.complete(session, { count: 1 });
    const waiting = await store.create(user);
    await expect(store.create(user)).rejects.toMatchObject({ status: 429 });
    expect((await store.listOwned(user)).map(s => s.status)).toEqual(['ready', 'waiting']);
    store.owned(waiting.id, user); await store.remove(waiting.id);
    await expect(store.create(user)).resolves.toHaveProperty('id');
    expect(store.get(ready.id).pages).toHaveLength(1);
});

test('creating a scan does not clear another user failed attempts', async () => {
    const other = await store.create({ userId: 99 }), session = store.get(other.id);
    store.claim(session); store.complete(session, { error: 'Scanner disconnected' });
    await store.create(user); expect(store.get(other.id).status).toBe('error');
});

test('session listing cleans expired drafts', async () => {
    const old = await store.create(user); clock += 1001;
    expect(await store.listOwned(user)).toEqual([]);
    expect(fs.existsSync(store.directory(old.id))).toBe(false);
});
test.each(['sales_executive', 'sales_agm', 'sales_gm', 'sales_master_settlement', 'sales_admin_settings'])('%s can scan for its existing document forms', key => {
    const next = jest.fn(); permitted({ user: { modules: [key] } }, {}, next); expect(next).toHaveBeenCalled();
});
test('main Admin is allowed and report-only users are denied', () => {
    const next = jest.fn(); permitted({ user: { groupId: 1 } }, {}, next); expect(next).toHaveBeenCalled();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    permitted({ user: { modules: ['sales_reports'] } }, res, jest.fn()); expect(res.status).toHaveBeenCalledWith(403);
});
