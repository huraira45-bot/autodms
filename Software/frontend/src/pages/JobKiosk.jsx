// Public "Service Performance Board" big-screen — designed for a lobby TV.
// No login required. Auto-refreshes every 15s. Shows every draft JC opened
// today except warranty (WR) / B&P / CT types, grouped by status in a
// bay-style layout with light colours, gentle animations, a live clock,
// per-JC progress bar, active bay/technician chip, and a floor-plan mini-
// map. Survives LAN dropouts via a 10-minute localStorage cache.
//
// Route: /kiosk/jobs (renders full-viewport, no sidebar / header)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
    Clock, Wrench, ShieldCheck, Droplets, CheckCircle,
    Car, Sparkles, MapPin, User,
} from 'lucide-react';

const REFRESH_MS = 15_000;
const CACHE_KEY  = 'kiosk:cache';
const CACHE_TTL_MS = 10 * 60_000;   // 10 minutes — beyond that we hide stale data

const STATUSES = [
    { key: 'Waiting For Service',   short: 'Waiting Bay',    icon: Clock,       accent: '#f59e0b', soft: '#fef3c7', ring: '#fcd34d' },
    { key: 'Being Serviced',        short: 'Service Bay',    icon: Wrench,      accent: '#2563eb', soft: '#dbeafe', ring: '#93c5fd' },
    { key: 'Final Inspection',      short: 'QA Bay',         icon: ShieldCheck, accent: '#7c3aed', soft: '#ede9fe', ring: '#c4b5fd' },
    { key: 'Car Wash',              short: 'Wash Bay',       icon: Droplets,    accent: '#0284c7', soft: '#e0f2fe', ring: '#7dd3fc' },
    { key: 'Waiting For Delivery',  short: 'Ready Bay',      icon: CheckCircle, accent: '#16a34a', soft: '#dcfce7', ring: '#86efac' },
];

// --- CSS keyframes injected once (no external stylesheet needed) ---
const KEYFRAMES = `
@keyframes bayFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}
@keyframes bayPulseDot {
    0%   { transform: scale(1);   opacity: 0.75; }
    50%  { transform: scale(1.35); opacity: 1; }
    100% { transform: scale(1);   opacity: 0.75; }
}
@keyframes bayShimmer {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
}
@keyframes bayReadyGlow {
    0%,100% { box-shadow: 0 0 0 rgba(22,163,74,0); }
    50%     { box-shadow: 0 0 20px rgba(22,163,74,0.5); }
}
@keyframes bayClockTick {
    0%   { opacity: 0.6; }
    50%  { opacity: 1;   }
    100% { opacity: 0.6; }
}
@keyframes bayProgressGrow {
    from { width: 0; }
    to   { width: var(--pct); }
}
`;

const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : '';

// --- localStorage cache helpers (survive LAN dropouts) ------------------
// Read cache; return null if empty or older than TTL.
function readCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.at || !Array.isArray(parsed?.jobs)) return null;
        if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
        return parsed;
    } catch { return null; }
}
function writeCache(jobs) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), jobs })); }
    catch { /* quota / private mode — silently ignore */ }
}

export default function JobKiosk() {
    // Seed from cache so a cold-load with a dead backend still shows
    // something instead of flashing "Reconnecting…".
    const cached = readCache();
    const [jobs, setJobs]     = useState(cached?.jobs || []);
    const [staleAt, setStale] = useState(cached ? cached.at : null);
    const [now, setNow]       = useState(new Date());
    const [error, setError]   = useState(null);

    // Poll every 15s. On success clear stale marker + refresh cache. On
    // failure, keep whatever we last showed and mark the header stale.
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const r = await axios.get('/api/kiosk/jobs-live');
                if (cancelled) return;
                const list = r.data || [];
                setJobs(list);
                setError(null);
                setStale(null);
                writeCache(list);
            } catch (e) {
                if (cancelled) return;
                setError(e.message);
                const c = readCache();
                if (c) { setJobs(c.jobs); setStale(c.at); }
            }
        };
        load();
        const iv = setInterval(load, REFRESH_MS);
        return () => { cancelled = true; clearInterval(iv); };
    }, []);

    // Live clock tick
    useEffect(() => {
        const iv = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(iv);
    }, []);

    const groups = useMemo(() =>
        STATUSES.map(s => ({
            ...s,
            jobs: jobs.filter(j => (j.WorkshopStatus || 'Waiting For Service') === s.key),
        })), [jobs]);

    const totalOnFloor = jobs.length;
    const readyCount   = groups[groups.length - 1].jobs.length;

    return (
        <div style={S.page}>
            <style>{KEYFRAMES}</style>

            {/* HEADER — co-branded, live clock, counters, stale indicator */}
            <div style={S.header}>
                <div style={S.brandRow}>
                    {/* TODO: swap the text badges for real SVGs at
                        assets/logo-changan.svg + assets/logo-saher.svg once
                        marketing shares them. */}
                    <div style={S.brandChangan}>MASTER<br/>CHANGAN</div>
                    <div style={S.brandBadge}>
                        <Car size={26} strokeWidth={2.4} />
                    </div>
                    <div>
                        <div style={S.brandLabel}>Service Performance Board</div>
                        <div style={S.brandTitle}>Saher · Live Workshop Status</div>
                    </div>
                    {staleAt && <StaleChip at={staleAt} />}
                </div>
                <div style={S.headerCounters}>
                    <Counter label="On the floor" value={totalOnFloor} accent="#0f172a" />
                    <Counter label="Ready for pickup" value={readyCount} accent="#16a34a" />
                </div>
                <div style={S.clockBlock}>
                    <div style={S.clock}>
                        {now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                        <span style={{ ...S.clockSecs, animation: 'bayClockTick 1s ease-in-out infinite' }}>
                            {now.toLocaleTimeString('en-PK', { second: '2-digit' }).slice(-2)}
                        </span>
                    </div>
                    <div style={S.date}>
                        {now.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                </div>
            </div>

            {/* BAYS */}
            <div style={S.body}>
                {groups.map(g => (
                    <div key={g.key} style={{ ...S.bayCol, borderColor: g.ring }}>
                        <div style={{ ...S.bayHeader, background: g.soft, color: g.accent, borderBottomColor: g.ring }}>
                            <div style={S.bayHeaderLeft}>
                                <span style={{
                                    ...S.pulseDot,
                                    background: g.accent,
                                    animation: g.key === 'Being Serviced' ? 'bayPulseDot 1.6s ease-in-out infinite' : 'none',
                                }} />
                                <g.icon size={22} strokeWidth={2.2} />
                                <span style={S.bayTitle}>{g.short}</span>
                            </div>
                            <span style={{ ...S.bayCount, background: g.accent }}>{g.jobs.length}</span>
                        </div>
                        <div style={S.bayList}>
                            {g.jobs.length === 0 && (
                                <div style={S.emptyBay}>
                                    <Sparkles size={22} style={{ opacity: 0.35, marginBottom: 6 }} />
                                    <div>Bay is open</div>
                                </div>
                            )}
                            {g.jobs.map((j, i) => (
                                <JobCard key={j.JobCardId} j={j} accent={g.accent} soft={g.soft}
                                         isReady={g.key === 'Waiting For Delivery'}
                                         isService={g.key === 'Being Serviced'}
                                         delayIndex={i} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* FLOOR PLAN MINI-MAP */}
            <FloorPlan jobs={jobs} />

            {/* TICKER + STATUS STRIP */}
            <div style={S.footer}>
                {error && !staleAt ? (
                    <div style={S.errStrip}>Reconnecting… ({error})</div>
                ) : (
                    <div style={S.tickerWrap}>
                        <span style={S.tickerLabel}>READY FOR PICKUP</span>
                        <span style={S.tickerText}>
                            {readyCount === 0
                                ? 'No vehicles ready yet — thank you for your patience.'
                                : groups[groups.length - 1].jobs.map(j =>
                                    `${j.VehicleRegNo}${j.CustomerFirstName ? ` · ${j.CustomerFirstName}` : ''}`).join('   ✦   ')}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ----- Card -----------------------------------------------------------
function JobCard({ j, accent, soft, isReady, isService, delayIndex }) {
    const inMs = new Date() - new Date(j.ReceiptDate || Date.now());
    const inMin = Math.max(0, Math.floor(inMs / 60000));
    const inLabel = inMin < 60 ? `${inMin}m` : `${Math.floor(inMin/60)}h ${inMin%60}m`;
    const overdue = inMin > 180;   // > 3 hours on floor → subtle amber cue

    const total = Number(j.LabourTotal) || 0;
    const done  = Number(j.LabourDone)  || 0;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

    const activeBay  = j.ActiveBay;
    const activeTech = j.ActiveTechnician;
    const hasActive  = !!(activeBay || activeTech);

    // Staggered fade-in so a fresh page load doesn't blast everything at once.
    const cardStyle = {
        ...S.card,
        background: isReady ? '#ecfdf5' : 'white',
        borderLeftColor: accent,
        animation: `bayFadeIn 0.35s ease-out both${isReady ? ', bayReadyGlow 2.4s ease-in-out infinite' : ''}`,
        animationDelay: `${Math.min(delayIndex * 40, 400)}ms`,
    };

    return (
        <div style={cardStyle}>
            {/* Shimmer overlay while being serviced */}
            {isService && (
                <div style={{
                    position: 'absolute', inset: 0, borderRadius: 10,
                    pointerEvents: 'none', overflow: 'hidden',
                }}>
                    <div style={{
                        position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
                        background: 'linear-gradient(120deg, transparent 40%, rgba(37,99,235,0.08) 50%, transparent 60%)',
                        backgroundSize: '200% 100%',
                        animation: 'bayShimmer 2.5s linear infinite',
                    }} />
                </div>
            )}
            <div style={{ position: 'relative' }}>
                <div style={S.cardTop}>
                    <div style={{ ...S.plate, color: accent }}>{j.VehicleRegNo || '—'}</div>
                    <div style={S.jcNo}>{j.JobCardNo}</div>
                </div>
                <div style={S.cardMid}>
                    <div style={S.customer}>{j.CustomerFirstName || '—'}</div>
                    <div style={S.advisor}>{j.ServiceAdvisor || ''}</div>
                </div>

                {/* Progress bar — labour lines with JobEndTime filled */}
                <ProgressRow total={total} done={done} pct={pct} accent={accent} soft={soft} />

                {/* Active bay + tech chip — only when something is actively running */}
                {hasActive && (
                    <div style={S.chipRow}>
                        {activeBay && (
                            <span style={{ ...S.chip, borderColor: accent, color: accent }}>
                                <MapPin size={10} /> Bay {activeBay}
                            </span>
                        )}
                        {activeTech && (
                            <span style={{ ...S.chip, borderColor: '#cbd5e1', color: '#334155' }}>
                                <User size={10} /> {activeTech}
                            </span>
                        )}
                    </div>
                )}

                <div style={S.cardBottom}>
                    <span>In · {fmtTime(j.ReceiptDate)}</span>
                    <span style={{ color: overdue ? '#b45309' : '#94a3b8', fontWeight: overdue ? 700 : 500 }}>
                        {inLabel} on floor
                    </span>
                </div>
            </div>
        </div>
    );
}

// Progress bar row. When LabourTotal=0 (fresh JC, no labour lines yet) shows
// a subdued "warming up" hint instead of a false 100%.
function ProgressRow({ total, done, pct, accent, soft }) {
    if (total === 0) {
        return (
            <div style={S.progressWrap}>
                <div style={{ ...S.progressTrack, background: soft }}>
                    <div style={{
                        ...S.progressFill,
                        width: '15%', background: `linear-gradient(90deg, ${accent}66, transparent)`,
                        animation: 'bayShimmer 3s linear infinite',
                    }} />
                </div>
                <div style={S.progressLine}>
                    <span style={S.progressLabel}>Awaiting job details</span>
                    <span style={S.progressPct}>—</span>
                </div>
            </div>
        );
    }
    return (
        <div style={S.progressWrap}>
            <div style={{ ...S.progressTrack, background: soft }}>
                <div style={{
                    ...S.progressFill,
                    width: `${pct}%`,
                    background: accent,
                    // CSS var used by the grow keyframe so cards refresh a
                    // smooth animation to their new width each poll.
                    '--pct': `${pct}%`,
                    animation: 'bayProgressGrow 0.6s ease-out',
                }} />
            </div>
            <div style={S.progressLine}>
                <span style={S.progressLabel}>{done}/{total} jobs done</span>
                <span style={{ ...S.progressPct, color: accent }}>{pct}%</span>
            </div>
        </div>
    );
}

// ----- Floor plan mini-map --------------------------------------------
// Single-line horizontal strip. One square per bay code appearing on
// today's jobs (natural sort). Each square shows bay code + plate of the
// car currently in it. Bays with no active JC render dimmed. Deliberately
// compact — 1080p TV fits ~12 bays before scrolling starts.
function FloorPlan({ jobs }) {
    const bays = useMemo(() => {
        // Collect every bay that has an active labour line (ActiveBay set).
        // We only care about bays currently in use; empty bays we haven't
        // heard of at all stay off the map to avoid guessing capacity.
        const map = new Map(); // bayCode → { code, jc }
        for (const j of jobs) {
            const bay = (j.ActiveBay || '').toString().trim();
            if (!bay) continue;
            if (!map.has(bay)) map.set(bay, { code: bay, jc: j });
        }
        // Natural sort: pure-numeric bays first (numerically), then the rest alpha.
        return [...map.values()].sort((a, b) => {
            const na = Number(a.code), nb = Number(b.code);
            const aNum = Number.isFinite(na), bNum = Number.isFinite(nb);
            if (aNum && bNum) return na - nb;
            if (aNum) return -1;
            if (bNum) return 1;
            return a.code.localeCompare(b.code);
        });
    }, [jobs]);

    if (bays.length === 0) return null;

    return (
        <div style={S.floorWrap}>
            <div style={S.floorTitle}>
                <MapPin size={14} /> Workshop Floor
            </div>
            <div style={S.floorRow}>
                {bays.map(b => (
                    <div key={b.code} style={S.floorBay}>
                        <div style={S.floorBayCode}>Bay {b.code}</div>
                        <div style={S.floorBayPlate}>{b.jc.VehicleRegNo || '—'}</div>
                        {b.jc.ActiveTechnician && (
                            <div style={S.floorBayTech}>{b.jc.ActiveTechnician}</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ----- Small components -----------------------------------------------
function Counter({ label, value, accent }) {
    return (
        <div style={S.counter}>
            <div style={{ ...S.counterValue, color: accent }}>{value}</div>
            <div style={S.counterLabel}>{label}</div>
        </div>
    );
}

// "Last update HH:MM" chip — appears when the poll is failing but we still
// have cached data less than the TTL old. Subtle amber so a customer can
// still read the board while staff sees that the data isn't live.
function StaleChip({ at }) {
    const label = new Date(at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
    return (
        <div style={S.staleChip} title="Live feed unavailable — showing last known state">
            <Clock size={12} /> Last update {label}
        </div>
    );
}

// ----- Styles ---------------------------------------------------------
const S = {
    page: {
        position: 'fixed', inset: 0,
        background: 'radial-gradient(circle at 20% 0%, #eff6ff 0%, #f8fafc 45%, #f1f5f9 100%)',
        color: '#0f172a',
        display: 'flex', flexDirection: 'column',
        fontFamily: '"Segoe UI", Inter, Roboto, Arial, sans-serif',
    },
    header: {
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'center', gap: 32,
        padding: '14px 28px',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72))',
        borderBottom: '1px solid #e2e8f0',
        backdropFilter: 'blur(6px)',
    },
    brandRow: { display: 'flex', alignItems: 'center', gap: 14 },
    brandChangan: {
        background: '#e11d48', color: 'white',
        padding: '6px 10px', borderRadius: 6,
        fontSize: '0.7rem', fontWeight: 800, lineHeight: 1.1,
        letterSpacing: '0.06em', textAlign: 'center',
        boxShadow: '0 3px 8px rgba(225,29,72,0.28)',
    },
    brandBadge: {
        width: 46, height: 46, borderRadius: 12,
        background: 'linear-gradient(135deg, #4f46e5, #2563eb)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', boxShadow: '0 6px 14px rgba(37,99,235,0.35)',
    },
    brandLabel: {
        fontSize: '0.72rem', color: '#64748b', letterSpacing: '0.25em',
        textTransform: 'uppercase', fontWeight: 700,
    },
    brandTitle: {
        fontSize: '1.55rem', fontWeight: 800, color: '#0f172a',
        lineHeight: 1.15, marginTop: 2,
    },
    staleChip: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: '#fef3c7', color: '#92400e',
        border: '1px solid #fde68a',
        padding: '3px 10px', borderRadius: 999,
        fontSize: '0.72rem', fontWeight: 700, marginLeft: 12,
    },
    headerCounters: { display: 'flex', gap: 18 },
    counter: {
        background: 'white', padding: '8px 18px', borderRadius: 12,
        border: '1px solid #e2e8f0', minWidth: 120, textAlign: 'center',
        boxShadow: '0 2px 6px rgba(15,23,42,0.05)',
    },
    counterValue: { fontSize: '1.9rem', fontWeight: 800, lineHeight: 1 },
    counterLabel: {
        fontSize: '0.66rem', color: '#64748b', textTransform: 'uppercase',
        letterSpacing: '0.14em', fontWeight: 700, marginTop: 4,
    },
    clockBlock: { textAlign: 'right' },
    clock: {
        fontSize: '2.4rem', fontWeight: 800, letterSpacing: '0.04em',
        color: '#0f172a', display: 'inline-flex', alignItems: 'baseline', gap: 6,
    },
    clockSecs: {
        fontSize: '0.95rem', color: '#94a3b8', fontWeight: 600,
        letterSpacing: 0, marginLeft: 4,
    },
    date: {
        fontSize: '0.85rem', color: '#64748b', marginTop: 2, fontWeight: 500,
    },

    body: {
        flex: 1,
        display: 'grid',
        gridTemplateColumns: `repeat(${STATUSES.length}, minmax(0,1fr))`,
        gap: 14, padding: '14px 20px 6px',
        overflow: 'hidden',
    },
    bayCol: {
        display: 'flex', flexDirection: 'column',
        background: 'rgba(255,255,255,0.85)',
        borderRadius: 14, border: '1.5px solid',
        overflow: 'hidden',
        boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
    },
    bayHeader: {
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', fontSize: '0.95rem',
        borderBottom: '1.5px solid',
    },
    bayHeaderLeft: {
        display: 'flex', alignItems: 'center', gap: 8, flex: 1,
    },
    bayTitle: { fontWeight: 800, letterSpacing: '0.04em', fontSize: '1.05rem' },
    bayCount: {
        marginLeft: 'auto', color: 'white', fontWeight: 800,
        padding: '2px 12px', borderRadius: 999, fontSize: '0.85rem',
        minWidth: 30, textAlign: 'center',
    },
    pulseDot: {
        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
    },
    bayList: { flex: 1, overflowY: 'auto', padding: 12 },
    emptyBay: {
        margin: 'auto 0', textAlign: 'center', padding: '30px 8px',
        color: '#94a3b8', fontSize: '0.9rem',
    },

    card: {
        position: 'relative',
        background: 'white', borderRadius: 10,
        padding: '10px 12px 8px', marginBottom: 10,
        borderLeft: '5px solid', color: '#0f172a',
        boxShadow: '0 2px 6px rgba(15,23,42,0.08)',
        transition: 'transform 0.2s ease',
    },
    cardTop: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    },
    plate: {
        fontFamily: 'monospace',
        fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.06em',
    },
    jcNo: {
        fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b', fontWeight: 600,
    },
    cardMid: {
        display: 'flex', justifyContent: 'space-between',
        marginTop: 3, alignItems: 'baseline',
    },
    customer: { fontSize: '0.95rem', color: '#334155', fontWeight: 600 },
    advisor:  { fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' },

    progressWrap: { marginTop: 6 },
    progressTrack: {
        position: 'relative', height: 6, borderRadius: 999,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%', borderRadius: 999,
    },
    progressLine: {
        display: 'flex', justifyContent: 'space-between', marginTop: 3,
        fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600,
    },
    progressLabel: {},
    progressPct: { fontWeight: 800 },

    chipRow: { display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' },
    chip: {
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'white', border: '1px solid',
        padding: '2px 7px', borderRadius: 999,
        fontSize: '0.7rem', fontWeight: 700,
    },

    cardBottom: {
        display: 'flex', justifyContent: 'space-between',
        fontSize: '0.72rem', color: '#94a3b8', marginTop: 6,
    },

    // Floor plan mini-map
    floorWrap: {
        background: 'rgba(255,255,255,0.85)',
        borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0',
        padding: '8px 20px 10px',
    },
    floorTitle: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: '0.7rem', color: '#64748b', fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: '0.14em',
        marginBottom: 6,
    },
    floorRow: {
        display: 'flex', gap: 8, overflowX: 'auto',
    },
    floorBay: {
        minWidth: 90, padding: '6px 10px',
        borderRadius: 8, background: '#f1f5f9',
        border: '1px solid #cbd5e1', flexShrink: 0,
    },
    floorBayCode: {
        fontSize: '0.65rem', color: '#64748b', fontWeight: 800,
        letterSpacing: '0.1em', textTransform: 'uppercase',
    },
    floorBayPlate: {
        fontFamily: 'monospace', fontSize: '1rem', fontWeight: 800,
        color: '#0f172a', letterSpacing: '0.05em',
    },
    floorBayTech: {
        fontSize: '0.65rem', color: '#64748b',
    },

    footer: {
        background: 'linear-gradient(180deg, #0f172a, #1e293b)',
        color: 'white',
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: 16,
    },
    tickerWrap: {
        display: 'flex', alignItems: 'center', gap: 18, flex: 1, overflow: 'hidden',
    },
    tickerLabel: {
        background: '#16a34a', color: 'white', padding: '4px 12px',
        borderRadius: 6, fontSize: '0.75rem', fontWeight: 800,
        letterSpacing: '0.18em', flexShrink: 0,
    },
    tickerText: {
        fontSize: '1.05rem', fontWeight: 600, opacity: 0.9,
        letterSpacing: '0.02em', whiteSpace: 'nowrap',
        textOverflow: 'ellipsis', overflow: 'hidden',
    },
    errStrip: {
        color: '#fecaca', fontSize: '0.85rem', textAlign: 'center', width: '100%',
    },
};
