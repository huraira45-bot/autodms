/**
 * Sends what the tablet is holding, whenever the signal allows.
 *
 * Owner report 2026-09-30. Recording and uploading are now separate jobs: the
 * camera writes to IndexedDB and returns immediately, and this works through
 * what is stored, retrying until each one is on the server.
 *
 * Deliberate choices, each from something that actually goes wrong on a
 * forecourt:
 *
 *   * ONE AT A TIME. Two large videos over a weak link make each other slower
 *     and neither finishes.
 *   * navigator.onLine is NOT trusted as permission to upload. A tablet
 *     connected to workshop Wi-Fi with no route out still reports online. The
 *     only honest signal is whether an upload actually succeeded, so failures
 *     drive the backoff and `online` merely triggers an earlier retry.
 *   * Capture is never blocked by an upload. The advisor walking round a car
 *     must be able to photograph the next panel while the video is still
 *     going up, which is exactly what they could not do before.
 *   * A refusal that retrying cannot fix -- the estimate signed, the file too
 *     large -- stops being retried and says so, rather than leaving a queue
 *     that can never drain.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API } from './estimateFormat';
import { allPending, pendingFor, remove, noteAttempt, retryDelayMs, isPermanent, enqueue } from './mediaQueue';

// ONE pass at a time across the whole app. This used to be a ref inside the
// hook, which meant the estimate screen's copy and the app-wide uploader each
// had their own -- and both would send the same recording at the same moment,
// uploading it twice.
let pumping = false;

export function useMediaQueue(estimateId, { onUploaded } = {}) {
    const [pending, setPending] = useState([]);
    const [sending, setSending] = useState(null);   // { id, name, size, pct }
    const timer = useRef(null);
    const onUploadedRef = useRef(onUploaded);
    onUploadedRef.current = onUploaded;

    const refresh = useCallback(async () => {
        if (!estimateId) return;
        try { setPending(await pendingFor(estimateId)); } catch { /* the store will be read again on the next tick */ }
    }, [estimateId]);

    useEffect(() => { refresh(); }, [refresh]);

    /**
     * Work through the queue once. Re-entrant by design: it is called from a
     * timer, from `online`, and straight after a capture, and only one pass
     * may be in flight at a time.
     */
    const pump = useCallback(async () => {
        if (pumping) return;
        pumping = true;
        try {
            const queue = await allPending();
            for (const row of queue) {
                if (row.state === 'blocked') continue;

                // Respect the backoff for something that has already failed.
                // Measured from the last attempt, not from when it was
                // recorded -- otherwise an old recording would be retried on
                // every single pass.
                if (row.attempts > 0 && row.lastTriedAt) {
                    const since = Date.now() - new Date(row.lastTriedAt).getTime();
                    if (since < retryDelayMs(row.attempts)) continue;
                }

                const fd = new FormData();
                fd.append('media', row.blob, row.name);
                setSending({ id: row.id, name: row.name, size: row.size, pct: 0 });
                try {
                    const { data } = await axios.post(`${API}/estimates/${row.estimateId}/media`, fd, {
                        timeout: 0,   // a long video over weak Wi-Fi takes minutes
                        onUploadProgress: (e) => {
                            if (e.total) {
                                setSending(s => s && s.id === row.id
                                    ? { ...s, pct: Math.round((e.loaded * 100) / e.total) } : s);
                            }
                        },
                    });
                    // Only now is it safe to let go of the local copy.
                    await remove(row.id);
                    if (row.estimateId === Number(estimateId)) onUploadedRef.current?.(data);
                } catch (err) {
                    const permanent = isPermanent(err);
                    await noteAttempt(row.id, {
                        error: err?.response?.data?.error || err.message,
                        blocked: permanent,
                    });
                    // A network failure means the signal is gone; stop the pass
                    // rather than march through the rest and fail each in turn.
                    if (!permanent) break;
                } finally {
                    setSending(null);
                }
            }
        } catch { /* the store was unreadable this time; the next tick tries again */ }
        finally {
            pumping = false;
            refresh();
        }
    }, [estimateId, refresh]);

    // Keep trying: on a timer, when the browser thinks it is back online, and
    // when the advisor returns to the screen.
    useEffect(() => {
        pump();
        timer.current = setInterval(pump, 10000);
        const wake = () => pump();
        window.addEventListener('online', wake);
        document.addEventListener('visibilitychange', wake);
        return () => {
            clearInterval(timer.current);
            window.removeEventListener('online', wake);
            document.removeEventListener('visibilitychange', wake);
        };
    }, [pump]);

    /** Called the moment something is recorded. Stores it, then starts a pass. */
    const add = useCallback(async (file) => {
        const row = await enqueue({ estimateId, file });
        setPending(p => [...p, row]);
        pump();
        return row;
    }, [estimateId, pump]);

    /** Throw away something that will never upload, or was taken by mistake. */
    const drop = useCallback(async (id) => {
        await remove(id);
        refresh();
    }, [refresh]);

    /** Try a blocked or waiting item again now. */
    const retryNow = useCallback(async () => { await pump(); }, [pump]);

    return { pending, sending, add, drop, retryNow };
}


/**
 * Keeps the queue moving wherever the advisor is in the tablet app.
 *
 * Without this the uploader only ran while the walk-around step was on
 * screen -- so an advisor who recorded outside, then moved on to the customer
 * step and walked back into signal, would have nothing upload until they
 * happened to return to that step. Mounted once, near the top of the app.
 */
export function MediaUploader() {
    useMediaQueue(null);
    return null;
}
