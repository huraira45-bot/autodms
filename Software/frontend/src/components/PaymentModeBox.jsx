/**
 * How the job card is being paid for, changeable while it is still open.
 *
 * Owner ask 2026-09-26: the mode is often not settled at the vehicle — the
 * customer decides when they come back for the car — so the tablet must be
 * able to change it for as long as the job card is not finalized.
 *
 * Once finalized it is read-only, and says why: the mode decided which ledger
 * the work posted to, so changing it afterwards would put the job card and its
 * voucher out of step. That needs an unfinalize, which is its own audited road.
 *
 * Party and bank are searchable rather than dropdowns — there are hundreds of
 * parties, and this is used standing at a car.
 */
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Wallet, Check, Loader2, AlertTriangle, Lock } from 'lucide-react';
import SearchableSelect from './SearchableSelect';

const PAYMENT_TYPES = ['Cash', 'Credit', 'POS', 'Bank Transfer'];
const label = t => (t === 'POS' ? 'POS CLEAR' : t);

export default function PaymentModeBox({
    jobCardId,
    apiBase = '/api/service-intake',
    jobCard,
    size = 'tablet',
    onChanged,
}) {
    const big = size === 'tablet';
    const f = n => (big ? Math.round(n * 1.3) : n);
    const locked = !!jobCard?.IsFinalized;

    const [form, setForm] = useState({
        PaymentType: jobCard?.PaymentType || 'Cash',
        PartyID: jobCard?.PartyID ? String(jobCard.PartyID) : '',
        PaymentCO: jobCard?.PaymentCO || '',
        PaymentBankID: jobCard?.PaymentBankID ? String(jobCard.PaymentBankID) : '',
    });
    const [parties, setParties] = useState([]);
    const [banks, setBanks] = useState([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setForm({
            PaymentType: jobCard?.PaymentType || 'Cash',
            PartyID: jobCard?.PartyID ? String(jobCard.PartyID) : '',
            PaymentCO: jobCard?.PaymentCO || '',
            PaymentBankID: jobCard?.PaymentBankID ? String(jobCard.PaymentBankID) : '',
        });
    }, [jobCard?.PaymentType, jobCard?.PartyID, jobCard?.PaymentCO, jobCard?.PaymentBankID]);

    useEffect(() => {
        if (locked) return;   // nothing to pick from on a closed job card
        axios.get(`${apiBase}/lookups/parties`).then(r => setParties(r.data || [])).catch(() => setParties([]));
        axios.get(`${apiBase}/lookups/banks`).then(r => setBanks(r.data || [])).catch(() => setBanks([]));
    }, [apiBase, locked]);

    const dirty = String(form.PaymentType) !== String(jobCard?.PaymentType || 'Cash')
        || String(form.PartyID || '') !== String(jobCard?.PartyID || '')
        || String(form.PaymentCO || '') !== String(jobCard?.PaymentCO || '')
        || String(form.PaymentBankID || '') !== String(jobCard?.PaymentBankID || '');

    const pick = (pt) => {
        // Drop what no longer applies, so a party chosen while the mode was
        // Credit cannot ride along on a Cash job card.
        setSaved(false);
        setForm(p => ({
            PaymentType: pt,
            PartyID: pt === 'Credit' ? p.PartyID : '',
            PaymentCO: pt === 'Credit' ? p.PaymentCO : '',
            PaymentBankID: pt === 'Bank Transfer' ? p.PaymentBankID : '',
        }));
    };

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            await axios.put(`${apiBase}/job-cards/${jobCardId}/payment`, {
                PaymentType: form.PaymentType,
                PartyID: form.PartyID || null,
                PaymentCO: form.PaymentCO || null,
                PaymentBankID: form.PaymentBankID || null,
            });
            setSaved(true);
            onChanged?.();
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
        } finally { setBusy(false); }
    };

    const chip = (pt) => {
        const on = form.PaymentType === pt;
        return (
            <button key={pt} type="button" disabled={locked || busy} onClick={() => pick(pt)}
                    style={{
                        minHeight: big ? 56 : 34, padding: big ? '0 18px' : '0 12px',
                        fontSize: f(13), fontWeight: on ? 700 : 400,
                        border: `1px solid ${on ? '#1a3a6a' : '#cbd5e1'}`, borderRadius: 6,
                        background: on ? '#eff6ff' : '#fff', color: on ? '#1a3a6a' : '#475569',
                        cursor: locked ? 'default' : 'pointer',
                    }}>
                {label(pt)}
            </button>
        );
    };

    return (
        <div style={{ border: '1px solid #c8d4e4', borderRadius: 6, background: '#f7fafc',
                      padding: big ? 16 : 12, marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <Wallet size={f(16)} color="#1a3a6a" />
                <span style={{ fontSize: f(13), fontWeight: 700, color: '#1a3a6a' }}>Payment mode</span>
                {locked && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: f(11),
                                   color: '#64748b' }}>
                        <Lock size={f(12)} /> finalized — it decided where the work posted, so it is fixed
                    </span>
                )}
                {saved && !dirty && !locked && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: f(11),
                                   color: '#16a34a' }}>
                        <Check size={f(13)} /> saved
                    </span>
                )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {PAYMENT_TYPES.map(chip)}
            </div>

            {form.PaymentType === 'Credit' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                              gap: 10, marginBottom: 10 }}>
                    <div>
                        <div style={{ fontSize: f(11), color: '#64748b', marginBottom: 3 }}>Party charged *</div>
                        {locked
                            ? <div style={{ fontSize: f(13), fontWeight: 600 }}>{jobCard?.PaymentPartyName || '—'}</div>
                            : <SearchableSelect touch={big}
                                value={form.PartyID}
                                onChange={v => { setSaved(false); setForm(p => ({ ...p, PartyID: v ? String(v) : '' })); }}
                                placeholder="Search parties…"
                                title="Pick the party charged"
                                options={parties.map(p => ({ id: p.PartyID, label: p.PartyName,
                                                             sub: p.PhoneOne || undefined }))} />}
                    </div>
                    <div>
                        <div style={{ fontSize: f(11), color: '#64748b', marginBottom: 3 }}>C/O</div>
                        {locked
                            ? <div style={{ fontSize: f(13) }}>{jobCard?.PaymentCO || '—'}</div>
                            : <input value={form.PaymentCO}
                                     onChange={e => { const v = e.target.value; setSaved(false); setForm(p => ({ ...p, PaymentCO: v })); }}
                                     style={{ width: '100%', minHeight: big ? 56 : 34, fontSize: f(13),
                                              padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: 6 }} />}
                    </div>
                </div>
            )}

            {form.PaymentType === 'Bank Transfer' && (
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: f(11), color: '#64748b', marginBottom: 3 }}>Bank account *</div>
                    {locked
                        ? <div style={{ fontSize: f(13), fontWeight: 600 }}>{jobCard?.PaymentBankName || '—'}</div>
                        : <SearchableSelect touch={big}
                            value={form.PaymentBankID}
                            onChange={v => { setSaved(false); setForm(p => ({ ...p, PaymentBankID: v ? String(v) : '' })); }}
                            placeholder="Search bank accounts…"
                            title="Pick the bank account"
                            options={banks.map(b => ({ id: b.GLCAID, label: b.GLTitle, sub: b.GLCode }))} />}
                </div>
            )}

            {err && (
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: f(12), color: '#92400e',
                              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4,
                              padding: '7px 10px', marginBottom: 8 }}>
                    <AlertTriangle size={f(15)} /> {err}
                </div>
            )}

            {!locked && (
                <button type="button" onClick={save} disabled={busy || !dirty}
                        style={{ minHeight: big ? 56 : 34, padding: big ? '0 22px' : '0 14px',
                                 fontSize: f(13), fontWeight: 600, color: '#fff',
                                 background: dirty ? '#1a3a6a' : '#94a3b8', border: 'none',
                                 borderRadius: 6, cursor: dirty ? 'pointer' : 'default' }}>
                    {busy ? <Loader2 size={f(15)} className="animate-spin" /> : dirty ? 'Save payment mode' : 'No change'}
                </button>
            )}
        </div>
    );
}
