/**
 * KYC banner shown on JobCardForm when the entered chassis number has any
 * open KYC flag. Forces an acknowledge click before the parent will allow
 * saving (parent listens to onAcknowledged).
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ShieldAlert, Check, Loader2 } from 'lucide-react';

const API = '/api';

const TYPE_COLOR = {
    Chronic:     '#b91c1c',
    PaymentRisk: '#92400e',
    Aggressive:  '#9a3412',
    VIP:         '#1e40af',
    Other:       '#475569',
};

export default function KYCBanner({ chasisNo, jobCardId, onAcknowledgedChange }) {
    const [flags, setFlags] = useState([]);
    const [loading, setLoading] = useState(false);
    const [acked, setAcked]     = useState(new Set());
    const [busy, setBusy]       = useState(false);

    useEffect(() => {
        if (!chasisNo) { setFlags([]); onAcknowledgedChange?.(true); return; }
        setLoading(true);
        axios.get(`${API}/cro/kyc-flags/active-for-chassis/${encodeURIComponent(chasisNo.trim())}`)
            .then(r => {
                setFlags(r.data.flags || []);
                onAcknowledgedChange?.((r.data.flags || []).length === 0);
            })
            .catch(() => { setFlags([]); onAcknowledgedChange?.(true); })
            .finally(() => setLoading(false));
        setAcked(new Set());
    }, [chasisNo]);

    useEffect(() => {
        onAcknowledgedChange?.(flags.length === 0 || flags.every(f => acked.has(f.FlagID)));
    }, [acked, flags]);

    if (!chasisNo || loading) return null;
    if (flags.length === 0) return null;

    const acknowledgeOne = async (flag) => {
        setBusy(true);
        try {
            await axios.post(`${API}/cro/kyc-flags/${flag.FlagID}/acknowledge`, jobCardId ? { JobCardID: jobCardId } : {});
            setAcked(prev => new Set([...prev, flag.FlagID]));
        } catch (e) {
            console.error(e);
        }
        setBusy(false);
    };

    return (
        <div style={{ padding: 12, marginBottom: 12, background: '#fef2f2', border: '2px solid #fecaca', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <ShieldAlert size={20} color="#b91c1c" />
                <div style={{ fontWeight: 700, color: '#b91c1c' }}>
                    {flags.length} KYC flag{flags.length === 1 ? '' : 's'} on chassis {chasisNo}
                </div>
            </div>
            {flags.map(f => {
                const isAcked = acked.has(f.FlagID);
                return (
                    <div key={f.FlagID} style={{ padding: 8, background: isAcked ? '#f0fdf4' : 'white', borderRadius: 6, marginBottom: 6, border: '1px solid ' + (isAcked ? '#bbf7d0' : '#fecaca') }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ background: TYPE_COLOR[f.FlagType] + '22', color: TYPE_COLOR[f.FlagType], padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                                {f.FlagType}
                            </span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.85rem', color: '#0f172a' }}>{f.Notes}</div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>
                                    Raised by {f.FlaggedByName} on {new Date(f.FlaggedAt).toLocaleDateString()}
                                </div>
                            </div>
                            {!isAcked ? (
                                <button onClick={() => acknowledgeOne(f)} disabled={busy}
                                    style={{ padding: '4px 10px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Acknowledge
                                </button>
                            ) : (
                                <span style={{ color: '#15803d', fontSize: '0.78rem', fontWeight: 600, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Check size={14} /> Acknowledged
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
