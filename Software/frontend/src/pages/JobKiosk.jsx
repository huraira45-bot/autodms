// Public "Job Performance" big-screen — designed for a lobby TV.
// No login required. Auto-refreshes every 15s. Shows every draft JC opened
// today except warranty (WR) and B&P types, grouped by status with big
// fonts and colour-coded chips so a customer sitting across the room can
// spot their vehicle.
//
// Route:  /kiosk/jobs   (renders full-viewport, no sidebar / header)
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Clock, Wrench, ShieldCheck, Droplets, CheckCircle } from 'lucide-react';

const REFRESH_MS = 15_000;

const STATUSES = [
    { key: 'Waiting For Service',   short: 'Waiting',       icon: Clock,       colour: '#f59e0b', bg: '#fef3c7' },
    { key: 'Being Serviced',        short: 'In Progress',   icon: Wrench,      colour: '#2563eb', bg: '#dbeafe' },
    { key: 'Final Inspection',      short: 'QA',            icon: ShieldCheck, colour: '#7c3aed', bg: '#ede9fe' },
    { key: 'Car Wash',              short: 'Wash',          icon: Droplets,    colour: '#0284c7', bg: '#e0f2fe' },
    { key: 'Waiting For Delivery',  short: 'Ready',         icon: CheckCircle, colour: '#16a34a', bg: '#dcfce7' },
];
const statusMeta = (s) => STATUSES.find(x => x.key === s) || STATUSES[0];

const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : '';

export default function JobKiosk() {
    const [jobs, setJobs]     = useState([]);
    const [now, setNow]       = useState(new Date());
    const [error, setError]   = useState(null);
    const [businessName, setBusinessName] = useState('Job Performance');

    // Refresh jobs
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

    // Tick the clock every second
    useEffect(() => {
        const iv = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(iv);
    }, []);

    // (Business name previously fetched from a hypothetical
    // /api/settings/business-profile/public endpoint. That path sits behind
    // the auth middleware, so anonymous kiosk visitors got 401 → the global
    // axios interceptor kicked them to /login. Fixed value only.)

    // Group by status; keep the STATUSES order.
    const groups = STATUSES.map(s => ({
        ...s,
        jobs: jobs.filter(j => (j.WorkshopStatus || 'Waiting For Service') === s.key),
    }));

    return (
        <div style={S.page}>
            <div style={S.header}>
                <div>
                    <div style={{ fontSize: '1rem', letterSpacing: '0.2em', opacity: 0.7 }}>SERVICE STATUS</div>
                    <div style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '0.02em' }}>{businessName}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '3rem', fontWeight: 800 }}>
                        {now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: '1rem', opacity: 0.75 }}>
                        {now.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                </div>
            </div>

            <div style={S.body}>
                {groups.map(g => (
                    <div key={g.key} style={S.column(g)}>
                        <div style={S.colHeader(g)}>
                            <g.icon size={22} />
                            <span style={{ fontSize: '1.35rem', fontWeight: 700 }}>{g.short}</span>
                            <span style={S.badge(g)}>{g.jobs.length}</span>
                        </div>
                        <div style={S.list}>
                            {g.jobs.length === 0 && (
                                <div style={S.empty}>—</div>
                            )}
                            {g.jobs.map(j => (
                                <JobCard key={j.JobCardId} j={j} colour={g.colour} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {error && (
                <div style={S.footerErr}>Connection issue — retrying every {REFRESH_MS/1000}s. ({error})</div>
            )}
        </div>
    );
}

function JobCard({ j, colour }) {
    const inMs = new Date() - new Date(j.ReceiptDate || Date.now());
    const inMin = Math.floor(inMs / 60000);
    const inLabel = inMin < 60 ? `${inMin}m` : `${Math.floor(inMin/60)}h ${inMin%60}m`;
    return (
        <div style={{
            background: 'white',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 10,
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            borderLeft: `6px solid ${colour}`,
            color: '#0f172a',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 800, letterSpacing: '0.06em' }}>
                    {j.VehicleRegNo || '—'}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#64748b' }}>
                    {j.JobCardNo}
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <div style={{ fontSize: '0.95rem', color: '#334155' }}>
                    {j.CustomerFirstName || '—'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                    {j.ServiceAdvisor || ''}
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.75rem', color: '#94a3b8' }}>
                <span>In · {fmtTime(j.ReceiptDate)}</span>
                <span>{inLabel} on floor</span>
            </div>
        </div>
    );
}

// ---- inline styles ----
const S = {
    page: {
        position: 'fixed', inset: 0, background: '#0f172a', color: 'white',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Inter, Segoe UI, Roboto, Arial, sans-serif',
    },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 28px', borderBottom: '1px solid #1e293b',
        background: 'linear-gradient(90deg, #0f172a, #1e293b)',
    },
    body: {
        flex: 1, display: 'grid', gridTemplateColumns: `repeat(${STATUSES.length}, minmax(0,1fr))`,
        gap: 12, padding: 12, overflow: 'hidden',
    },
    column: (g) => ({
        display: 'flex', flexDirection: 'column',
        background: '#111c30', borderRadius: 10, overflow: 'hidden',
        border: `1px solid ${g.colour}66`,
    }),
    colHeader: (g) => ({
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', background: g.colour, color: 'white',
    }),
    badge: (g) => ({
        marginLeft: 'auto', background: 'rgba(255,255,255,0.25)',
        padding: '2px 10px', borderRadius: 12, fontSize: '0.95rem', fontWeight: 700,
    }),
    list: {
        flex: 1, overflowY: 'auto', padding: 12,
    },
    empty: { textAlign: 'center', color: '#475569', padding: '30px 0', fontSize: '1.4rem' },
    footerErr: {
        background: '#7f1d1d', color: 'white', padding: '6px 20px',
        fontSize: '0.85rem', textAlign: 'center',
    },
};
