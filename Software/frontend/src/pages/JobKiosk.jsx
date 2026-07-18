// Public "Job Performance" big-screen — designed for a lobby TV.
// No login required. Auto-refreshes every 15s. Shows every draft JC opened
// today except warranty (WR) and B&P types, grouped by status in a
// bay-style layout with light colours, gentle animations, and a live
// clock so customers waiting in the lounge can spot their vehicle.
//
// Route:  /kiosk/jobs   (renders full-viewport, no sidebar / header)
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    Clock, Wrench, ShieldCheck, Droplets, CheckCircle,
    Car, Sparkles,
} from 'lucide-react';

const REFRESH_MS = 15_000;

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
`;

const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : '';

export default function JobKiosk() {
    const [jobs, setJobs]     = useState([]);
    const [now, setNow]       = useState(new Date());
    const [error, setError]   = useState(null);

    // Poll every 15s
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const r = await axios.get('/api/kiosk/jobs-live');
                if (!cancelled) { setJobs(r.data || []); setError(null); }
            } catch (e) {
                if (!cancelled) setError(e.message);
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

    return (
        <div style={S.page}>
            <style>{KEYFRAMES}</style>

            {/* HEADER */}
            <div style={S.header}>
                <div style={S.brandRow}>
                    <div style={S.brandBadge}>
                        <Car size={26} strokeWidth={2.4} />
                    </div>
                    <div>
                        <div style={S.brandLabel}>Service Performance Board</div>
                        <div style={S.brandTitle}>Live Workshop Status</div>
                    </div>
                </div>
                <div style={S.headerCounters}>
                    <Counter label="On the floor" value={totalOnFloor} accent="#0f172a" />
                    <Counter label="Ready for pickup" value={groups[groups.length - 1].jobs.length} accent="#16a34a" />
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

            {/* TICKER + STATUS STRIP */}
            <div style={S.footer}>
                {error ? (
                    <div style={S.errStrip}>Reconnecting… ({error})</div>
                ) : (
                    <div style={S.tickerWrap}>
                        <span style={S.tickerLabel}>READY FOR PICKUP</span>
                        <span style={S.tickerText}>
                            {groups[groups.length - 1].jobs.length === 0
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

// ----- Small components -----------------------------------------------
function Counter({ label, value, accent }) {
    return (
        <div style={S.counter}>
            <div style={{ ...S.counterValue, color: accent }}>{value}</div>
            <div style={S.counterLabel}>{label}</div>
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
        padding: '18px 30px',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72))',
        borderBottom: '1px solid #e2e8f0',
        backdropFilter: 'blur(6px)',
    },
    brandRow: { display: 'flex', alignItems: 'center', gap: 16 },
    brandBadge: {
        width: 52, height: 52, borderRadius: 14,
        background: 'linear-gradient(135deg, #4f46e5, #2563eb)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', boxShadow: '0 6px 14px rgba(37,99,235,0.35)',
    },
    brandLabel: {
        fontSize: '0.75rem', color: '#64748b', letterSpacing: '0.25em',
        textTransform: 'uppercase', fontWeight: 700,
    },
    brandTitle: {
        fontSize: '1.7rem', fontWeight: 800, color: '#0f172a',
        lineHeight: 1.15, marginTop: 2,
    },
    headerCounters: { display: 'flex', gap: 20 },
    counter: {
        background: 'white', padding: '10px 20px', borderRadius: 12,
        border: '1px solid #e2e8f0', minWidth: 130, textAlign: 'center',
        boxShadow: '0 2px 6px rgba(15,23,42,0.05)',
    },
    counterValue: { fontSize: '2rem', fontWeight: 800, lineHeight: 1 },
    counterLabel: {
        fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase',
        letterSpacing: '0.14em', fontWeight: 700, marginTop: 4,
    },
    clockBlock: { textAlign: 'right' },
    clock: {
        fontSize: '2.6rem', fontWeight: 800, letterSpacing: '0.04em',
        color: '#0f172a', display: 'inline-flex', alignItems: 'baseline', gap: 6,
    },
    clockSecs: {
        fontSize: '1rem', color: '#94a3b8', fontWeight: 600,
        letterSpacing: 0, marginLeft: 4,
    },
    date: {
        fontSize: '0.9rem', color: '#64748b', marginTop: 2, fontWeight: 500,
    },

    body: {
        flex: 1,
        display: 'grid',
        gridTemplateColumns: `repeat(${STATUSES.length}, minmax(0,1fr))`,
        gap: 14, padding: '16px 20px',
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
    cardBottom: {
        display: 'flex', justifyContent: 'space-between',
        fontSize: '0.72rem', color: '#94a3b8', marginTop: 6,
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
