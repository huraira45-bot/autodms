/**
 * What the customer authorised at the vehicle, and the walk-around video.
 *
 * Owner ask 2026-09-25: the signed estimate, the job card and the video all
 * have to be viewable from the tablet AND from the web app. The tablet screens
 * already had the estimate; this is the same record seen from the job card, so
 * an advisor or cashier at a desk can check what was agreed without picking up
 * the tablet.
 *
 * It renders nothing at all for a job card written at the desk on paper, so
 * every existing screen looks exactly as it did.
 *
 * Both the signature image and the video need the login, and neither an <img>
 * nor a <video> tag sends an Authorization header. The signature is small, so
 * it is fetched as a blob. A walk-around can be a couple of hundred megabytes,
 * so it is not: the player asks the server for a short-lived ticket and streams
 * with that, which lets the customer skip straight to the scratch being
 * discussed instead of waiting for the whole file to arrive.
 */
import { useEffect, useState } from 'react';
import axios from 'axios';
import { PenLine, Video, Loader2, AlertTriangle } from 'lucide-react';

const money = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when  = v => v ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
const mb    = n => (Number(n || 0) / (1024 * 1024)).toFixed(1) + ' MB';

const S = {
    wrap:  { border: '1px solid #c8d4e4', borderRadius: 6, background: '#f7fafc', padding: 12, marginTop: 10 },
    head:  { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#1a3a6a', marginBottom: 8 },
    row:   { display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' },
    label: { fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
    value: { fontSize: 13, fontWeight: 600, color: '#0f172a' },
    sig:   { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 4, padding: 4, maxHeight: 70 },
    btn:   { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 11px',
             border: '1px solid #1a3a6a', background: '#fff', color: '#1a3a6a', borderRadius: 4, cursor: 'pointer' },
    warn:  { display: 'flex', gap: 7, alignItems: 'center', fontSize: 12, color: '#92400e',
             background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '7px 10px', marginTop: 8 },
};

export default function ServiceAuthorisation({
    jobCardId,
    signatures = [],
    media = [],
    apiBase = '/api/workshop/job-cards',
    // 'tablet' enlarges the type and the touch targets. The panel is read at
    // a desk with a mouse and at the vehicle at arm's length, and desk-sized
    // type is too small for the second.
    size = 'desk',
}) {
    const big = size === 'tablet';
    const f = (n) => (big ? Math.round(n * 1.35) : n);
    const [sigUrls, setSigUrls] = useState({});
    const [playing, setPlaying] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        let dead = false;
        const made = [];
        (async () => {
            for (const s of signatures) {
                try {
                    const r = await axios.get(`${apiBase}/${jobCardId}/signature/${s.SignatureID}`,
                                              { responseType: 'blob' });
                    if (dead) return;
                    const u = URL.createObjectURL(r.data);
                    made.push(u);
                    setSigUrls(p => ({ ...p, [s.SignatureID]: u }));
                } catch {
                    // The record still shows who signed and when; only the
                    // picture is missing, which is worth less than a wrong error.
                }
            }
        })();
        // A blob URL holds the image in memory until it is handed back.
        return () => { dead = true; made.forEach(u => URL.revokeObjectURL(u)); };
    }, [jobCardId, apiBase, signatures]);

    const watch = async (m) => {
        setBusy(true);
        setErr(null);
        try {
            const r = await axios.get(`${apiBase}/${jobCardId}/media/${m.MediaID}/ticket`);
            setPlaying(r.data);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
        } finally {
            setBusy(false);
        }
    };

    if (!signatures.length && !media.length) return null;

    return (
        <div style={S.wrap}>
            <div style={{ ...S.head, fontSize: f(12) }}><PenLine size={f(15)} /> Authorised by the customer at the vehicle</div>

            {signatures.map((s, i) => (
                <div key={s.SignatureID}
                     style={{ ...S.row,
                              borderTop: i ? '1px dashed #cbd5e1' : 'none',
                              paddingTop: i ? 10 : 0, marginTop: i ? 10 : 0 }}>
                    <div>
                        <div style={{ ...S.label, fontSize: f(10) }}>{i === 0 ? 'Signed by' : `Additional work · revision ${s.RevisionNo}`}</div>
                        <div style={{ ...S.value, fontSize: f(13) }}>{s.SignerName}</div>
                        {s.SignerMobile && <div style={{ fontSize: 11, color: '#475569' }}>{s.SignerMobile}</div>}
                    </div>
                    <div>
                        <div style={{ ...S.label, fontSize: f(10) }}>When</div>
                        <div style={{ ...S.value, fontSize: f(13) }}>{when(s.SignedAt)}</div>
                    </div>
                    <div>
                        <div style={{ ...S.label, fontSize: f(10) }}>Agreed total</div>
                        <div style={{ ...S.value, fontSize: f(13) }}>Rs {money(s.GrandTotal)}</div>
                    </div>
                    {s.EstimateNo && (
                        <div>
                            <div style={{ ...S.label, fontSize: f(10) }}>Estimate</div>
                            <div style={{ ...S.value, fontSize: f(13) }}>{s.EstimateNo}</div>
                        </div>
                    )}
                    {s.BayName && (
                        <div>
                            <div style={{ ...S.label, fontSize: f(10) }}>Bay</div>
                            <div style={{ ...S.value, fontSize: f(13) }}>{s.BayName}</div>
                        </div>
                    )}
                    <div>
                        <div style={{ ...S.label, fontSize: f(10) }}>Signature</div>
                        {sigUrls[s.SignatureID]
                            ? <img src={sigUrls[s.SignatureID]} alt={`Signature of ${s.SignerName}`} style={S.sig} />
                            : <div style={{ ...S.value, color: '#94a3b8' }}>—</div>}
                    </div>
                </div>
            ))}

            {media.length > 0 && (
                <div style={{ marginTop: signatures.length ? 12 : 0,
                              paddingTop: signatures.length ? 10 : 0,
                              borderTop: signatures.length ? '1px solid #e2e8f0' : 'none' }}>
                    <div style={{ ...S.head, fontSize: f(12) }}><Video size={f(15)} /> Walk-around at reception</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {media.map(m => (
                            <button key={m.MediaID} type="button" disabled={busy}
                                    style={{ ...S.btn, fontSize: f(12), minHeight: big ? 56 : undefined,
                                             padding: big ? '10px 16px' : '6px 11px' }}
                                    onClick={() => watch(m)}>
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />}
                                {m.MediaType === 'PHOTO' ? 'Photo' : 'Video'}
                                <span style={{ color: '#64748b', fontWeight: 400 }}>
                                    {when(m.CapturedAt)}{m.SizeBytes ? ` · ${mb(m.SizeBytes)}` : ''}
                                </span>
                            </button>
                        ))}
                    </div>

                    {playing && (
                        <div style={{ marginTop: 10 }}>
                            {playing.MediaType === 'PHOTO'
                                ? <img src={playing.url} alt="Walk-around" style={{ maxWidth: '100%', borderRadius: 4 }} />
                                : <video src={playing.url} controls playsInline
                                         style={{ width: '100%', maxWidth: 640, borderRadius: 4, background: '#000' }} />}
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                Recorded by {playing.CapturedByName || 'the advisor'} · {when(playing.CapturedAt)}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {err && <div style={S.warn}><AlertTriangle size={15} /> {err}</div>}
        </div>
    );
}
