/**
 * Walk-around video and photos, held on the tablet until they are safely on
 * the server.
 *
 * Owner report 2026-09-30: a proper walk-around happens OUTSIDE the workshop,
 * where the Wi-Fi is weakest. The video would start uploading, the upload
 * would break as the advisor walked back, and the recording would be gone --
 * a record of the car's condition on arrival, lost. Photos could not be taken
 * at all while a video was uploading.
 *
 * All three had one cause: the recording lived only in React state. A File
 * reference does not survive the page being reloaded, the tablet sleeping, or
 * Chrome reclaiming the tab -- and Android clears the camera's temp file
 * behind it. Nothing was ever written down.
 *
 * So: the moment something is recorded it goes into IndexedDB, BEFORE any
 * upload is attempted. Uploading is then a separate, retrying background job.
 * If the tablet is switched off mid-walk-around the recording is still there
 * when it comes back.
 *
 * IndexedDB rather than localStorage because localStorage holds strings, caps
 * out around 5MB, and a minute of 1080p video is roughly 100MB.
 *
 * Uploads run ONE AT A TIME. Two large videos over a weak link make each other
 * slower and neither finishes.
 */

const DB_NAME = 'dealerdesk-media';
const DB_VERSION = 1;
const STORE = 'pending';

let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) return reject(new Error('This browser cannot store recordings offline.'));
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
                // Everything is read back per estimate, so that is the index.
                store.createIndex('estimateId', 'estimateId', { unique: false });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Could not open the offline store.'));
    });
    return dbPromise;
}

const tx = async (mode, fn) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let out;
        try { out = fn(store); } catch (e) { reject(e); return; }
        t.oncomplete = () => resolve(out?.result !== undefined ? out.result : out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('The offline store rejected the write.'));
    });
};

/**
 * Write a recording down. Called the instant it is taken, before any upload.
 * Returns the queued row, which the screen shows straight away so the advisor
 * can see the recording is held even though it has not gone anywhere yet.
 */
export async function enqueue({ estimateId, file }) {
    const row = {
        estimateId: Number(estimateId),
        blob: file,                                   // a File IS a Blob; IndexedDB stores it whole
        name: file.name || (String(file.type).startsWith('image/') ? 'photo.jpg' : 'walkaround.mp4'),
        type: file.type || 'application/octet-stream',
        size: file.size,
        capturedAt: new Date().toISOString(),
        attempts: 0,
        lastError: null,
        // 'waiting'  — still to be sent
        // 'blocked'  — the server refused it for a reason retrying cannot fix
        state: 'waiting',
    };
    try {
        const id = await tx('readwrite', (store) => store.add(row));
        return { ...row, id };
    } catch (e) {
        // Out of space is the one worth naming: the advisor can free some up.
        if (e?.name === 'QuotaExceededError') {
            throw new Error('This tablet has no room left to hold the recording. '
                          + 'Upload or delete some older ones first.');
        }
        throw e;
    }
}

/** Everything still held for one estimate, oldest first. */
export async function pendingFor(estimateId) {
    const id = Number(estimateId);
    const all = await tx('readonly', (store) => store.index('estimateId').getAll(id));
    return (all || []).sort((a, b) => a.id - b.id);
}

/** Everything still held, for any estimate — what the uploader works through. */
export async function allPending() {
    const all = await tx('readonly', (store) => store.getAll());
    return (all || []).sort((a, b) => a.id - b.id);
}

export async function remove(id) {
    return tx('readwrite', (store) => store.delete(Number(id)));
}

/** Record how an attempt went, so the screen can say what is happening. */
export async function noteAttempt(id, { error = null, blocked = false } = {}) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        const store = t.objectStore(STORE);
        const get = store.get(Number(id));
        get.onsuccess = () => {
            const row = get.result;
            if (!row) return;   // already uploaded and removed
            row.attempts = (row.attempts || 0) + 1;
            row.lastError = error;
            // When it was last tried, so the backoff has something to measure
            // from. Without this every pass would retry immediately and the
            // backoff would do nothing.
            row.lastTriedAt = new Date().toISOString();
            if (blocked) row.state = 'blocked';
            store.put(row);
        };
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
    });
}

/**
 * How long to wait before trying again.
 *
 * Quick at first, because the usual case is the advisor walking twenty paces
 * back into signal. Then it backs off, so a tablet left in a drawer with no
 * network is not hammering a dead connection all day.
 */
export function retryDelayMs(attempts) {
    if (attempts <= 1) return 5000;
    if (attempts === 2) return 15000;
    if (attempts === 3) return 45000;
    return 120000;
}

/**
 * Is this refusal worth retrying?
 *
 * A network failure is: the signal comes back. A 423 (the estimate has been
 * signed or cancelled) or a 413 (too large) never will, and retrying forever
 * would leave the advisor watching a queue that can never drain.
 */
export function isPermanent(err) {
    const status = err?.response?.status;
    if (!status) return false;                 // no response at all = network
    return status === 400 || status === 404 || status === 413 || status === 423;
}
