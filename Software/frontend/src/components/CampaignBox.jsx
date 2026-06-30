/**
 * CampaignBox — drop-in widget for Job Card / Store Sale screens.
 *
 * Usage:
 *   <CampaignBox type="jobcard" id={jobCardId} grossAmount={total} onChange={refetch} />
 *   <CampaignBox type="sale"    id={saleId}    grossAmount={total} onChange={refetch} />
 *
 *  - If the JC/sale doesn't exist yet (no id), shows "Save first to attach a campaign".
 *  - If an application already exists, shows it with a Reverse button.
 *  - Otherwise loads applicable campaigns, lets the user pick one, calculates
 *    the benefit from BenefitType (% / fixed / free), and applies via API.
 *
 *  GL impact happens at JC/sale finalization (the application row carries the
 *  BenefitAmount the finalize flow uses to split the receivable).
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Megaphone, Loader2, RefreshCw, X, AlertCircle, Sparkles, Undo2 } from 'lucide-react';

const API = '/api';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Props:
 *   labourGross — pre-tax labour line subtotal (for JC). Defaults to 0 for Store Sale.
 *   partsGross  — pre-tax parts line subtotal. For JC, the parts portion. For Store Sale, everything.
 *   taxAmount   — total tax (PST + GST) on the invoice.
 *   grossAmount — convenience: labourGross + partsGross (used for fallback display).
 */
export default function CampaignBox({ type, id, grossAmount, labourGross = 0, partsGross = 0, taxAmount = 0, onChange }) {
    const isJC = type === 'jobcard';
    const [application, setApplication] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        if (!id) { setApplication(null); return; }
        setLoading(true);
        try {
            const ep = isJC ? `applications/by-jobcard/${id}` : `applications/by-sale/${id}`;
            const r = await axios.get(`${API}/service-campaigns/${ep}`);
            setApplication(r.data);
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setLoading(false);
    }, [id, isJC]);
    useEffect(() => { load(); }, [load]);

    const reverse = async () => {
        if (!application) return;
        const reason = window.prompt('Reverse the campaign? Enter a reason:');
        if (!reason?.trim()) return;
        try {
            await axios.post(`${API}/service-campaigns/applications/${application.ApplicationID}/reverse`,
                             { Reason: reason.trim() });
            await load();
            onChange?.();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
    };

    // --- Render states ---
    if (!id) {
        return (
            <div style={boxStyle('#f8fafc', '#cbd5e1', '#64748b')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Megaphone size={16} />
                    <span style={{ fontWeight: 600 }}>Campaign</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>
                    Save the {isJC ? 'job card' : 'sale'} first to attach a campaign.
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={boxStyle('#f8fafc', '#cbd5e1', '#64748b')}>
                <Loader2 size={14} className="animate-spin" /> Loading campaign...
            </div>
        );
    }

    if (application) {
        const isMCML = application.BorneBy === 'MCML';
        return (
            <div style={boxStyle(
                isMCML ? '#f0fdf4' : '#fef2f2',
                isMCML ? '#86efac' : '#fecaca',
                isMCML ? '#15803d' : '#b91c1c')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Sparkles size={16} />
                        <strong>Campaign applied: {application.CampaignName}</strong>
                        <span style={{ background: 'white', padding: '1px 8px', borderRadius: 99,
                                       fontSize: '0.7rem', fontWeight: 700 }}>
                            {isMCML ? 'MCML claim' : 'Our expense'}
                        </span>
                    </div>
                    <button type="button" onClick={reverse} className="btn-sm" title="Reverse application">
                        <Undo2 size={12} /> Reverse
                    </button>
                </div>
                <div style={{ fontSize: '0.82rem', marginTop: 6, color: '#475569' }}>
                    Benefit: <strong>PKR {fmt(application.BenefitAmount)}</strong>
                    {application.BenefitDescription && <span> — {application.BenefitDescription}</span>}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
                    Posts to GL <code>{application.GLCode}</code> ({application.GLAccountTitle}) at finalization.
                </div>
                {err && <div style={errStyle}>{err}</div>}
            </div>
        );
    }

    return (
        <div style={boxStyle('#eff6ff', '#bfdbfe', '#1e40af')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Megaphone size={16} />
                    <span style={{ fontWeight: 700 }}>Campaigns</span>
                </div>
                <button type="button" onClick={() => setShowPicker(true)} className="btn-sm"
                        style={{ background: '#1e40af', color: 'white', border: 'none' }}>
                    Apply Campaign
                </button>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#1e40af', marginTop: 4 }}>
                Discounts, free service, free parts, or any MCML-borne promotion.
            </div>
            {err && <div style={errStyle}>{err}</div>}
            {showPicker && (
                <PickerModal
                    type={type} id={id}
                    grossAmount={grossAmount}
                    labourGross={labourGross}
                    partsGross={partsGross}
                    taxAmount={taxAmount}
                    onClose={() => setShowPicker(false)}
                    onApplied={async () => { setShowPicker(false); await load(); onChange?.(); }}
                />
            )}
        </div>
    );
}

// =====================================================================
// Picker modal — pick a campaign and confirm
// =====================================================================
function PickerModal({ type, id, grossAmount, labourGross = 0, partsGross = 0, taxAmount = 0, onClose, onApplied }) {
    const isJC = type === 'jobcard';
    const [campaigns, setCampaigns] = useState([]);
    const [selected, setSelected]   = useState(null);
    const [benefit, setBenefit]     = useState('');
    const [busy, setBusy]           = useState(false);
    const [err, setErr]             = useState(null);
    const [loading, setLoading]     = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const r = await axios.get(`${API}/service-campaigns/applicable`,
                    { params: isJC ? { jobCardId: id } : { saleId: id } });
                setCampaigns(r.data);
            } catch (e) { setErr(e.response?.data?.error || e.message); }
            setLoading(false);
        })();
    }, [id, isJC]);

    // Auto-compute benefit when campaign changes.
    //   - Each side (labour + parts) independently: None/Percent/Fixed/Free.
    //   - The server returned EligibleLabourGross / EligiblePartsGross on this
    //     campaign — those are sums of JC lines whose IDs are in the campaign's
    //     eligibility list. Other lines on the JC stay outside the discount.
    //   - If IncludesTax is set, tax is pro-rated to the eligible portion of
    //     the JC (eligibleGross / totalGross of the whole JC).
    const computedSplit = (() => {
        if (!selected) return { labour: 0, parts: 0, tax: 0, total: 0 };
        const totalLg = Number(labourGross || 0);
        const totalPg = Number(partsGross  || 0);
        const txTotal = Number(taxAmount || 0);

        // Eligible-only grosses (already filtered by the server)
        const eligLg = Number(selected.EligibleLabourGross ?? totalLg);
        const eligPg = Number(selected.EligiblePartsGross  ?? totalPg);

        const sideBenefit = (sideType, sidePct, sideAmt, gross) => {
            if (!sideType || sideType === 'None') return 0;
            if (sideType === 'Percent') return gross * Number(sidePct || 0) / 100;
            if (sideType === 'Fixed')   return Math.min(Number(sideAmt || 0), gross);
            if (sideType === 'Free')    return gross;
            return 0;
        };
        const labourB = sideBenefit(selected.LabourBenefitType, selected.LabourBenefitPercent, selected.LabourBenefitAmount, eligLg);
        const partsB  = sideBenefit(selected.PartsBenefitType,  selected.PartsBenefitPercent,  selected.PartsBenefitAmount,  eligPg);

        // Tax pro-rated to the eligible portion of the JC
        let taxB = 0;
        if (selected.IncludesTax && (totalLg + totalPg) > 0) {
            const benefitFraction = (labourB + partsB) / (totalLg + totalPg);
            taxB = txTotal * Math.min(1, benefitFraction);
        }
        const total = +(labourB + partsB + taxB).toFixed(2);
        return {
            labour: +labourB.toFixed(2),
            parts:  +partsB.toFixed(2),
            tax:    +taxB.toFixed(2),
            total,
            eligLg: +eligLg.toFixed(2),
            eligPg: +eligPg.toFixed(2),
        };
    })();

    useEffect(() => {
        setBenefit(computedSplit.total > 0 ? computedSplit.total.toFixed(2) : '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected, labourGross, partsGross, taxAmount]);

    const apply = async () => {
        if (!selected) return;
        const amt = Number(benefit);
        if (!(amt > 0)) { setErr('Benefit amount must be > 0.'); return; }
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/service-campaigns/${selected.CampaignID}/apply`, {
                ...(isJC ? { JobCardId: id } : { SaleID: id }),
                BenefitAmount: amt,
            });
            onApplied();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <div style={modalOverlay}>
            <div className="card" style={modalCard}>
                <div style={modalHeader}>
                    <h3 style={{ margin: 0 }}>Apply Campaign</h3>
                    <button type="button" className="btn-sm" onClick={onClose}><X size={14} /></button>
                </div>

                {loading && <div style={{ padding: 20, color: '#64748b' }}><Loader2 size={14} className="animate-spin" /> Loading applicable campaigns...</div>}

                {!loading && campaigns.length === 0 && (
                    <div style={{ padding: 20, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, color: '#78350f' }}>
                        <AlertCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                        No active campaigns match this {isJC ? 'job card' : 'sale'}. Check that the campaign's
                        business type / eligible items / job codes overlap with what's on this {isJC ? 'JC' : 'sale'}.
                    </div>
                )}

                {!loading && campaigns.length > 0 && (
                    <>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 10 }}>
                            {campaigns.length} campaign{campaigns.length === 1 ? '' : 's'} available. Pick one:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                            {campaigns.map(c => (
                                <label key={c.CampaignID}
                                    style={{
                                        display: 'flex', gap: 10, alignItems: 'flex-start',
                                        padding: 10, border: '1px solid ' + (selected?.CampaignID === c.CampaignID ? '#1e40af' : '#e2e8f0'),
                                        borderRadius: 6,
                                        background: selected?.CampaignID === c.CampaignID ? '#eff6ff' : 'white',
                                        cursor: 'pointer',
                                    }}>
                                    <input type="radio" name="camp"
                                        checked={selected?.CampaignID === c.CampaignID}
                                        onChange={() => setSelected(c)} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600 }}>{c.CampaignName} <code style={{ color: '#94a3b8' }}>· {c.CampaignCode}</code></div>
                                        <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2 }}>
                                            <BenefitText c={c} />
                                            <span style={{ marginLeft: 12,
                                                background: c.BorneBy === 'MCML' ? '#dcfce7' : '#fee2e2',
                                                color: c.BorneBy === 'MCML' ? '#15803d' : '#b91c1c',
                                                padding: '1px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 }}>
                                                {c.BorneBy === 'MCML' ? 'MCML claim' : 'Our expense'}
                                            </span>
                                            {c.IncludesTax && (
                                                <span style={{ marginLeft: 6, background: '#eff6ff', color: '#1e40af',
                                                    padding: '1px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 }}>
                                                    incl. tax
                                                </span>
                                            )}
                                        </div>
                                        {c.BenefitDescription && (
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>
                                                {c.BenefitDescription}
                                            </div>
                                        )}
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4 }}>
                                            Posts to <code>{c.GLCode}</code> · valid {c.ValidFrom?.slice(0,10)} → {c.ValidTo?.slice(0,10)}
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>

                        <div style={{ marginTop: 14 }}>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>
                                Benefit amount (PKR) — auto-computed from selected campaign, but you can override:
                            </label>
                            <input type="number" value={benefit} onChange={e => setBenefit(e.target.value)}
                                style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1',
                                         borderRadius: 6, fontSize: '0.9rem', marginTop: 4 }} />
                            {selected && (
                                <div style={{ marginTop: 6, padding: 8, background: '#f8fafc',
                                              border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.75rem',
                                              color: '#475569' }}>
                                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                        {computedSplit.labour > 0 && <span>Labour benefit: <strong>PKR {fmt(computedSplit.labour)}</strong></span>}
                                        {computedSplit.parts  > 0 && <span>Parts benefit: <strong>PKR {fmt(computedSplit.parts)}</strong></span>}
                                        {computedSplit.tax    > 0 && <span>Tax benefit: <strong>PKR {fmt(computedSplit.tax)}</strong></span>}
                                    </div>
                                    <div style={{ color: '#94a3b8', marginTop: 4 }}>
                                        Eligible labour PKR {fmt(computedSplit.eligLg)} of {fmt(labourGross)}
                                        {' '}· Eligible parts PKR {fmt(computedSplit.eligPg)} of {fmt(partsGross)}
                                        {taxAmount ? ` · Tax PKR ${fmt(taxAmount)} pro-rated` : ''}
                                    </div>
                                    {(computedSplit.eligLg < Number(labourGross || 0) || computedSplit.eligPg < Number(partsGross || 0)) && (
                                        <div style={{ color: '#a16207', marginTop: 4, fontStyle: 'italic' }}>
                                            Only the campaign's eligible lines are covered — non-eligible lines stay charged to the customer.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {err && <div style={{ ...errStyle, marginTop: 10 }}>{err}</div>}

                <div style={modalFooter}>
                    <button type="button" className="btn-sm" onClick={onClose}>Cancel</button>
                    <button type="button" className="btn" onClick={apply}
                            disabled={busy || !selected || !(Number(benefit) > 0)}>
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
}

function BenefitText({ c }) {
    const parts = [];
    if (c.LabourBenefitType && c.LabourBenefitType !== 'None') {
        if (c.LabourBenefitType === 'Percent') parts.push(`Labour ${c.LabourBenefitPercent}% off`);
        else if (c.LabourBenefitType === 'Fixed') parts.push(`Labour PKR ${fmt(c.LabourBenefitAmount)} off`);
        else if (c.LabourBenefitType === 'Free')  parts.push('Free labour');
    }
    if (c.PartsBenefitType && c.PartsBenefitType !== 'None') {
        if (c.PartsBenefitType === 'Percent') parts.push(`Parts ${c.PartsBenefitPercent}% off`);
        else if (c.PartsBenefitType === 'Fixed') parts.push(`Parts PKR ${fmt(c.PartsBenefitAmount)} off`);
        else if (c.PartsBenefitType === 'Free')  parts.push('Free parts');
    }
    if (parts.length === 0) {
        // Fall back to legacy single field
        if (c.BenefitType === 'PercentDiscount') return <>Discount: <strong>{c.BenefitPercent}%</strong></>;
        if (c.BenefitType === 'FixedDiscount')   return <>Discount: <strong>PKR {fmt(c.BenefitAmount)}</strong></>;
        if (c.BenefitType === 'FreeService')     return <>Free service</>;
        if (c.BenefitType === 'FreeParts')       return <>Free parts</>;
    }
    return <><strong>{parts.join(' + ')}</strong></>;
}

// =====================================================================
// Inline styles
// =====================================================================
const boxStyle = (bg, border, fg) => ({
    background: bg, border: `1px solid ${border}`, color: fg,
    borderRadius: 8, padding: 12, marginBottom: 14, fontSize: '0.88rem',
});
const errStyle = {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
    padding: 8, borderRadius: 6, marginTop: 8, fontSize: '0.8rem',
};
const modalOverlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const modalCard   = { width: '100%', maxWidth: 640 };
const modalHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 };
const modalFooter = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' };
