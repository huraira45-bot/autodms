import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Plus, Trash2, Save, FileText, Calculator, Lock, Unlock, RefreshCw, Loader2, AlertTriangle, Edit3, Printer } from 'lucide-react';
import { useAuth, useCan } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import SearchableSelect from '../components/SearchableSelect';
import { fmtDTLong } from '../utils/datetime';
import {
    ErpControlPanel, ErpStatusBar, ErpSmartButton, ErpStatusPill, ErpEmptyState,
} from '../components/erp';

const API_BASE = '/api';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_BADGE = {
    Draft:    { bg: '#f1f5f9', col: '#475569', label: 'Draft' },
    Posted:   { bg: '#dcfce7', col: '#15803d', label: 'Posted' },
    Reversed: { bg: '#fee2e2', col: '#b91c1c', label: 'Reversed' }
};

function Badge({ status }) {
    const s = STATUS_BADGE[status] || STATUS_BADGE.Draft;
    return (
        <span style={{
            background: s.bg, color: s.col, padding: '4px 10px',
            borderRadius: 99, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase'
        }}>
            {s.label}
        </span>
    );
}

// Owner ask 2026-07-18: users with `finance_voucher_backdate` can edit
// posted CPV/CRV/BPV/BRV within the last 30 days. Mirrors the backend
// helper in accountController.js — keep both in sync if the window changes.
const BACKDATE_WINDOW_DAYS = 30;
function isWithinBackdateWindow(dt) {
    if (!dt) return false;
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return false;
    const today  = new Date(); today.setHours(23, 59, 59, 999);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - BACKDATE_WINDOW_DAYS); cutoff.setHours(0, 0, 0, 0);
    return d >= cutoff && d <= today;
}

export default function VoucherEntry({ forceTypeCode, title }) {
    const { hasModule } = useAuth();
    const { canInsert, canEdit, canDelete } = useCan('finance_vouchers');
    const { notify, confirm } = useFeedback();
    const [params, setParams] = useSearchParams();
    const initialId = params.get('id');

    const [types, setTypes] = useState([]);
    const [coa, setCoa] = useState([]);
    const [drafts, setDrafts] = useState([]);
    const [showDrafts, setShowDrafts] = useState(false);

    // Voucher-type behavior flags. Cash vouchers lock row 0 to the Cash Book
    // account; bank vouchers lock row 0 to an active bank GL. The locked side
    // (Dr vs Cr) is determined by the voucher direction.
    //   CPV: cash leaves → row 0 is Cash Book on Credit
    //   CRV: cash arrives → row 0 is Cash Book on Debit
    //   BPV: bank leaves → row 0 is a bank, on Credit
    //   BRV: bank arrives → row 0 is a bank, on Debit
    const isCPV = forceTypeCode === 'CPV';
    const isCRV = forceTypeCode === 'CRV';
    const isBPV = forceTypeCode === 'BPV';
    const isBRV = forceTypeCode === 'BRV';
    const isFixedCash = isCPV || isCRV;
    const isFixedBank = isBPV || isBRV;
    const fixedLockedSide = (isCPV || isBPV) ? 'Debit' : (isCRV || isBRV) ? 'Credit' : null;

    const [banks, setBanks] = useState([]);
    const [cashBookGLCAID, setCashBookGLCAID] = useState('');

    const [mode, setMode] = useState(initialId ? 'view' : 'new'); // 'new' | 'view'
    const [active, setActive] = useState(null); // loaded voucher when mode === 'view'

    // Policy: vouchers are always posted with today's date — no backdate, no future date.
    // (Enforced server-side too in accountController.checkVoucherDateIsToday.)
    const todayStr = new Date().toISOString().split('T')[0];
    const [header, setHeader] = useState({
        VoucherDate: todayStr,
        VoucherTypeID: '',
        Remarks: '',
        IsCharitable: false,
    });
    const [items, setItems] = useState([
        { GLCAID: '', Narration: '', Debit: 0, Credit: 0 },
        { GLCAID: '', Narration: '', Debit: 0, Credit: 0 }
    ]);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);

    // ---------- Loaders ----------
    const fetchInitial = useCallback(async () => {
        try {
            const [tRes, cRes] = await Promise.all([
                axios.get(`${API_BASE}/accounts/voucher-types`),
                axios.get(`${API_BASE}/accounts/coa`)
            ]);
            setTypes(tRes.data);
            setCoa(cRes.data.filter(a => !a.isParent && a.GLLevel >= 3));
            if (forceTypeCode) {
                const t = tRes.data.find(t => t.VoucherTypeCode === forceTypeCode);
                if (t) setHeader(h => ({ ...h, VoucherTypeID: t.VoucherTypeID }));
            } else if (tRes.data.length > 0) {
                setHeader(h => ({ ...h, VoucherTypeID: tRes.data[0].VoucherTypeID }));
            }
        } catch (err) { console.error(err); }
    }, [forceTypeCode]);

    const fetchDrafts = useCallback(async () => {
        try {
            const r = await axios.get(`${API_BASE}/accounts/vouchers/drafts`);
            // Filter to current forceTypeCode if set
            const filtered = forceTypeCode
                ? r.data.filter(d => d.VoucherTypeCode === forceTypeCode)
                : r.data;
            setDrafts(filtered);
        } catch (err) { console.error(err); }
    }, [forceTypeCode]);

    const loadVoucher = useCallback(async (id) => {
        setBusy(true); setMsg(null);
        try {
            const r = await axios.get(`${API_BASE}/accounts/vouchers/${id}`);
            setActive(r.data);
            setMode('view');
        } catch (err) {
            setMsg({ kind: 'err', text: err.response?.data?.error || err.message });
        }
        setBusy(false);
    }, []);

    useEffect(() => { fetchInitial(); fetchDrafts(); }, [fetchInitial, fetchDrafts]);
    useEffect(() => {
        if (initialId) loadVoucher(initialId);
    }, [initialId, loadVoucher]);

    // Load supporting data for fixed-side vouchers
    useEffect(() => {
        if (isFixedBank) {
            axios.get(`${API_BASE}/accounts/banks`).then(r => setBanks(r.data || [])).catch(() => {});
        }
        if (isFixedCash) {
            axios.get(`${API_BASE}/system-accounts`).then(r => {
                const cb = (r.data || []).find(x => x.key === 'CASH_BOOK');
                if (cb?.assigned?.GLCAID) setCashBookGLCAID(cb.assigned.GLCAID);
            }).catch(() => {});
        }
    }, [isFixedBank, isFixedCash]);

    // Pre-seed row 0 with the locked cash account when it loads (new voucher only).
    useEffect(() => {
        if (mode !== 'new' || !isFixedCash || !cashBookGLCAID) return;
        setItems(prev => {
            if (prev[0]?.GLCAID) return prev;
            const next = [...prev];
            next[0] = { ...next[0], GLCAID: cashBookGLCAID };
            return next;
        });
    }, [mode, isFixedCash, cashBookGLCAID]);

    // Auto-print when navigated with ?print=1 (e.g. from ReceivePayment / MakePayment).
    // Opens the bare /vouchers/:id/print page so the print layout is half-A4 with
    // business header + signatories — see VoucherPrint.jsx.
    useEffect(() => {
        if (mode === 'view' && active && params.get('print') === '1') {
            const t = setTimeout(() => window.open(`/vouchers/${active.VoucherID}/print`, '_blank'), 200);
            return () => clearTimeout(t);
        }
    }, [mode, active, params]);

    // ---------- New-voucher state mgmt ----------
    const addItem = () => setItems([...items, { GLCAID: '', Narration: '', Debit: 0, Credit: 0 }]);
    const removeItem = (i) => setItems(items.filter((_, j) => j !== i));
    const updateItem = (i, k, v) => {
        // Row 0 is locked for CPV/CRV/BPV/BRV: the wrong-side Dr/Cr input and
        // the account dropdown are read-only. Silently ignore any attempt to
        // mutate those fields so a stale value can't sneak through.
        if (i === 0 && (isFixedCash || isFixedBank)) {
            if (k === 'GLCAID' && isFixedCash) return;          // Cash Book locked
            if (k === fixedLockedSide)        return;            // wrong-side input locked
        }
        const next = [...items]; next[i][k] = v; setItems(next);
    };
    const totals = {
        debit:  items.reduce((s, i) => s + parseFloat(i.Debit  || 0), 0),
        credit: items.reduce((s, i) => s + parseFloat(i.Credit || 0), 0)
    };
    const balanced = Math.abs(totals.debit - totals.credit) < 0.01;

    const handleSave = async () => {
        if (!balanced) {
            notify({ type: 'warning', title: 'Voucher is not balanced', message: 'Debit must equal Credit before saving.' });
            return;
        }
        if (totals.debit === 0) {
            notify({ type: 'warning', title: 'Voucher cannot be empty', message: 'Add at least one debit and credit line.' });
            return;
        }
        // Every line needs an account. For CPV/CRV row 0 is the Cash Book and for
        // BPV/BRV row 0 is a bank — if those didn't load (e.g. user role can't read
        // /system-accounts), row 0's GLCAID stays empty and cash silently never
        // posts. Catch that here with a clear message.
        const missingIdx = items.findIndex(it => !it.GLCAID);
        if (missingIdx >= 0) {
            const isCashOrBankRow0 = missingIdx === 0 && (isFixedCash || isFixedBank);
            notify({
                type: 'warning',
                title: 'Account missing',
                message: isCashOrBankRow0
                    ? (isFixedCash
                        ? 'Cash Book account is not configured. Ask admin to assign CASH_BOOK in Accounting Setup.'
                        : 'Bank account not selected on line 1. Pick a bank to continue.')
                    : `Line ${missingIdx + 1} has no account selected.`,
            });
            return;
        }
        setBusy(true); setMsg(null);
        try {
            let resultId, resultNo;
            if (editingId) {
                await axios.put(`${API_BASE}/accounts/vouchers/${editingId}`, { ...header, Items: items });
                resultId = editingId;
                setEditingId(null);
                setMsg({ kind: 'ok', text: `Draft updated.` });
                notify({ type: 'success', title: 'Draft updated', message: 'Voucher changes were saved.' });
            } else {
                const res = await axios.post(`${API_BASE}/accounts/vouchers`, { ...header, Items: items });
                resultId = res.data.VoucherID;
                resultNo = res.data.VoucherNo;
                setMsg({ kind: 'ok', text: `Voucher ${resultNo} saved as Draft.` });
                notify({ type: 'success', title: 'Voucher saved as draft', message: resultNo });
            }
            await loadVoucher(resultId);
            setParams({ id: String(resultId) });
            fetchDrafts();
        } catch (err) {
            const text = err.response?.data?.details || err.response?.data?.error || err.message;
            setMsg({ kind: 'err', text });
            notify({ type: 'error', title: 'Voucher save failed', message: text });
        }
        setBusy(false);
    };

    const startNew = () => {
        setMode('new');
        setActive(null);
        const row0 = isFixedCash
            ? { GLCAID: cashBookGLCAID, Narration: '', Debit: 0, Credit: 0 }
            : { GLCAID: '', Narration: '', Debit: 0, Credit: 0 };
        setItems([row0, { GLCAID: '', Narration: '', Debit: 0, Credit: 0 }]);
        setHeader(h => ({ ...h, Remarks: '' }));
        setMsg(null);
        params.delete('id'); setParams(params);
    };

    // ---------- Edit Draft ----------
    // Switches back into 'new' mode but pre-populated from the loaded Draft;
    // handleSave detects the editingId and PUTs instead of POSTing.
    const [editingId, setEditingId] = useState(null);

    const startEditDraft = () => {
        if (!active) return;
        // Draft vouchers of any type are editable. Posted JVs are also
        // editable (opening balances / prior-period reclassifications /
        // corrections) — backend enforces the same rule. Reversed or
        // reversing vouchers are always locked.
        // Owner ask 2026-07-18: users with `finance_voucher_backdate` may
        // also edit Posted CPV/CRV/BPV/BRV within a 5-day window; keep
        // their original date so backend can validate it.
        const isJV = active.VoucherTypeCode === 'JV';
        const canBackdateReceiptsPayments = hasModule('finance_voucher_backdate');
        const isBackdateEligible = canBackdateReceiptsPayments
            && !isJV
            && active.Status === 'Posted'
            && !active.ReversesVoucherID
            && isWithinBackdateWindow(active.VoucherDate);
        const allowed = active.Status === 'Draft'
            || (isJV && active.Status === 'Posted' && !active.ReversesVoucherID)
            || isBackdateEligible;
        if (!allowed) return;
        setHeader({
            // JV keeps its existing date. Backdate-eligible CPV/CRV/BPV/BRV
            // keep their original date so the user can shift it inside the
            // window. Everything else defaults to today.
            VoucherDate: (isJV || isBackdateEligible)
                ? new Date(active.VoucherDate).toISOString().split('T')[0]
                : todayStr,
            VoucherTypeID: active.VoucherTypeID,
            Remarks: active.Remarks || '',
            IsCharitable: !!active.IsCharitable,
        });
        setItems(active.lines.map(l => ({
            GLCAID: l.GLCAID,
            Narration: l.Narration || '',
            Debit: Number(l.Debit) || 0,
            Credit: Number(l.Credit) || 0
        })));
        setEditingId(active.VoucherID);
        setMode('new');
        setMsg(null);
    };

    // ---------- Change Date (JV only) ----------
    // Opening balances / prior-period adjustments / accruals are always JVs
    // and legitimately need a non-today date. Backend endpoint enforces
    // JV-only + non-reversing + finance_vouchers:edit permission.
    const [dateEditOpen, setDateEditOpen] = useState(false);
    const [dateEditVal,  setDateEditVal]  = useState('');

    const openDateEdit = () => {
        if (!active) return;
        setDateEditVal(new Date(active.VoucherDate).toISOString().split('T')[0]);
        setDateEditOpen(true);
    };
    const submitDateChange = async () => {
        if (!active || !dateEditVal) return;
        setBusy(true);
        try {
            await axios.patch(`${API_BASE}/accounts/vouchers/${active.VoucherID}/date`, { VoucherDate: dateEditVal });
            setDateEditOpen(false);
            await loadVoucher(active.VoucherID);
            setMsg({ kind: 'ok', text: 'Voucher date updated.' });
        } catch (err) {
            setMsg({ kind: 'err', text: err.response?.data?.error || err.message });
        } finally {
            setBusy(false);
        }
    };

    // ---------- Delete Draft ----------
    const handleDeleteDraft = async () => {
        if (!active || active.Status !== 'Draft') return;
        const ok = await confirm({
            title: `Delete draft ${active.VoucherNo}?`,
            message: 'This removes the draft voucher from the system.',
            details: 'Draft vouchers have no GL impact, but this deletion cannot be undone.',
            confirmLabel: 'Delete draft',
            tone: 'danger',
        });
        if (!ok) return;
        setBusy(true); setMsg(null);
        try {
            await axios.delete(`${API_BASE}/accounts/vouchers/${active.VoucherID}`);
            setMsg({ kind: 'ok', text: `Draft ${active.VoucherNo} deleted.` });
            notify({ type: 'success', title: 'Draft deleted', message: active.VoucherNo });
            await fetchDrafts();
            setTimeout(() => startNew(), 800);
        } catch (err) {
            const text = err.response?.data?.error || err.message;
            setMsg({ kind: 'err', text });
            notify({ type: 'error', title: 'Delete failed', message: text });
        }
        setBusy(false);
    };

    // ---------- Finalize ----------
    const handleFinalize = async () => {
        if (!active) return;
        const ok = await confirm({
            title: `Post voucher ${active.VoucherNo}?`,
            message: 'This commits the voucher to the general ledger.',
            details: 'After posting, changes require the unfinalize approval chain and a reversal voucher.',
            confirmLabel: 'Post to GL',
            tone: 'warning',
        });
        if (!ok) return;
        setBusy(true); setMsg(null);
        try {
            await axios.post(`${API_BASE}/finalize/VOUCHER/${active.VoucherID}`);
            setMsg({ kind: 'ok', text: `Voucher ${active.VoucherNo} posted to GL.` });
            notify({ type: 'success', title: 'Voucher posted', message: `${active.VoucherNo} was posted to GL.` });
            await loadVoucher(active.VoucherID);
            fetchDrafts();
        } catch (err) {
            const text = err.response?.data?.error || err.message;
            setMsg({ kind: 'err', text });
            notify({ type: 'error', title: 'Posting failed', message: text });
        }
        setBusy(false);
    };

    // ---------- Request Unfinalize ----------
    const [showUnfinalize, setShowUnfinalize] = useState(false);
    const [unfinalizeReason, setUnfinalizeReason] = useState('');
    const [blockers, setBlockers] = useState(null); // null = not checked, [] = ok, [..] = blocked

    const openUnfinalize = async () => {
        setShowUnfinalize(true);
        setBlockers(null);
        try {
            const r = await axios.get(`${API_BASE}/finalize/VOUCHER/${active.VoucherID}/downstream-refs`);
            setBlockers(r.data.blockers || []);
        } catch (err) {
            setBlockers([]);  // fail-open on the precheck; admin step will still block
        }
    };

    const handleRequestUnfinalize = async () => {
        if (!unfinalizeReason.trim()) {
            notify({ type: 'warning', title: 'Reason required', message: 'Explain why this voucher needs to be reversed.' });
            return;
        }
        setBusy(true); setMsg(null);
        try {
            await axios.post(`${API_BASE}/finalize/VOUCHER/${active.VoucherID}/request-unfinalize`, {
                reason: unfinalizeReason.trim()
            });
            setMsg({ kind: 'ok', text: `Unfinalize request submitted for ${active.VoucherNo}. Awaits Account Manager approval.` });
            setShowUnfinalize(false);
            setUnfinalizeReason('');
            setBlockers(null);
            notify({ type: 'success', title: 'Request submitted', message: `Unfinalize request sent for ${active.VoucherNo}.` });
        } catch (err) {
            const e = err.response?.data;
            if (e?.blockers?.length) {
                setBlockers(e.blockers);
                setMsg({ kind: 'err', text: 'Cannot request: downstream references exist (refresh below).' });
                notify({ type: 'error', title: 'Request blocked', message: 'Downstream references exist.' });
            } else {
                setMsg({ kind: 'err', text: e?.error || err.message });
                notify({ type: 'error', title: 'Request failed', message: e?.error || err.message });
            }
        }
        setBusy(false);
    };

    // ---------- View mode UI ----------
    if (mode === 'view' && active) {
        const status = active.Status || 'Draft';
        const canFinalize  = status === 'Draft'  && hasModule('finalize');
        const canUnfReq    = status === 'Posted' && hasModule('finalize');
        const isReversed   = status === 'Reversed';
        // JV vouchers can always change date. CPV/CRV/BPV/BRV can change
        // date if the user holds finance_voucher_backdate AND the voucher
        // is dated within the last 5 days (owner ask 2026-07-18).
        const isJV         = active.VoucherTypeCode === 'JV';
        const canBackdateRP = hasModule('finance_voucher_backdate');
        const rpBackdateOk  = canBackdateRP && !isJV
            && status === 'Posted'
            && !active.ReversesVoucherID
            && isWithinBackdateWindow(active.VoucherDate);
        const canChangeDate = canEdit && !isReversed && !active.ReversesVoucherID
            && (isJV || rpBackdateOk);
        // Full-value edit: Draft (any type), Posted JVs, or Posted CPV/CRV/
        // BPV/BRV within the backdate window when the user has permission.
        const canEditValues = canEdit && !isReversed && !active.ReversesVoucherID &&
            (status === 'Draft' || (isJV && status === 'Posted') || rpBackdateOk);

        // Line count / total for the smart-button row.
        const linesCount = (active.lines || []).length;
        const totalAmt   = (active.lines || []).reduce((s, l) => s + (Number(l.Debit) || 0), 0);
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <ErpControlPanel
                    title={`${active.VoucherNo || 'Voucher'} · ${active.VoucherTypeName || title || 'Finance Voucher'}`}
                    subtitle={active.Remarks || (mode === 'edit-draft' ? 'Editing draft' : 'Viewing existing voucher')}
                    actions={
                        <>
                            <button type="button" className="erp-btn erp-btn-sm" onClick={() => loadVoucher(active.VoucherID)} disabled={busy}>
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                Refresh
                            </button>
                            <button type="button" className="erp-btn erp-btn-sm" onClick={() => window.open(`/vouchers/${active.VoucherID}/print`, '_blank')}>
                                <Printer size={14} /> Print
                            </button>
                            {canInsert && (
                                <button type="button" className="erp-btn erp-btn-sm erp-btn-primary" onClick={startNew}>
                                    <Plus size={14} /> New
                                </button>
                            )}
                        </>
                    }
                />

                {/* Odoo-style status-bar (Draft → Posted → Reversed) */}
                <div style={{ background: 'var(--erp-surface)', border: '1px solid var(--erp-border)', borderRadius: 'var(--erp-radius)', overflow: 'hidden' }}>
                    <ErpStatusBar
                        current={status === 'Reversed' ? 'reversed' : status === 'Posted' ? 'posted' : 'draft'}
                        steps={[
                            { id: 'draft',    label: 'Draft' },
                            { id: 'posted',   label: 'Posted' },
                            { id: 'reversed', label: 'Reversed' },
                        ]}
                    />

                    {/* Smart buttons row */}
                    <div className="erp-smart-buttons">
                        <ErpSmartButton icon={Calculator} value={linesCount} label="Lines" />
                        <ErpSmartButton icon={FileText} value={fmt(totalAmt)} label="PKR" />
                        {active.ReversesVoucherID && (
                            <ErpSmartButton icon={AlertTriangle} value={`#${active.ReversesVoucherID}`} label="Reverses" />
                        )}
                    </div>

                    <div style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--erp-border)' }}>
                        {canEditValues && (
                            <button type="button" className="erp-btn erp-btn-primary" onClick={startEditDraft} disabled={busy}
                                title={status === 'Draft'
                                    ? 'Edit this Draft voucher before posting.'
                                    : 'Edit values on a posted JV (opening balances / prior-period adjustments).'}>
                                <Edit3 size={14} /> {status === 'Draft' ? 'Edit Draft' : 'Edit Values'}
                            </button>
                        )}
                        {status === 'Draft' && canDelete && (
                            <button type="button" className="erp-btn erp-btn-danger" onClick={handleDeleteDraft} disabled={busy}>
                                <Trash2 size={14} /> Delete
                            </button>
                        )}
                        {canFinalize && (
                            <button type="button" className="erp-btn erp-btn-primary" onClick={handleFinalize} disabled={busy}>
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                                Finalize (Post to GL)
                            </button>
                        )}
                        {canUnfReq && (
                            <button type="button" className="erp-btn" onClick={openUnfinalize} disabled={busy}>
                                <Unlock size={14} /> Request Unfinalize
                            </button>
                        )}
                        {canChangeDate && (
                            <button type="button" className="erp-btn" onClick={openDateEdit} disabled={busy}
                                title="Journal Vouchers can be back-dated (openings, prior-period adjustments).">
                                <Edit3 size={14} /> Change Date
                            </button>
                        )}
                        {dateEditOpen && (() => {
                            // JV allows any date; CPV/CRV/BPV/BRV is capped to the 5-day window.
                            const isJVRow = active.VoucherTypeCode === 'JV';
                            const cutoffDate = new Date(); cutoffDate.setDate(cutoffDate.getDate() - BACKDATE_WINDOW_DAYS);
                            const minStr = isJVRow ? undefined : cutoffDate.toISOString().split('T')[0];
                            const maxStr = isJVRow ? undefined : todayStr;
                            return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8, padding: '4px 8px', border: '1px solid var(--erp-border)', borderRadius: 4, background: 'var(--erp-surface-alt)' }}>
                                <span style={{ fontSize: 12, color: 'var(--erp-text-muted)' }}>New date:</span>
                                <input type="date" value={dateEditVal}
                                       min={minStr} max={maxStr}
                                       onChange={e => setDateEditVal(e.target.value)}
                                       style={{ padding: '2px 6px', fontSize: 12 }} />
                                <button type="button" className="erp-btn erp-btn-sm erp-btn-primary" onClick={submitDateChange} disabled={busy || !dateEditVal}>
                                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                                </button>
                                <button type="button" className="erp-btn erp-btn-sm" onClick={() => setDateEditOpen(false)} disabled={busy}>
                                    Cancel
                                </button>
                            </div>
                            );
                        })()}
                        {isReversed && (
                            <div className="erp-alert danger" style={{ margin: 0 }}>
                                <AlertTriangle size={14} />
                                Reversed by {active.ReversedByName} on {active.ReversedAt ? new Date(active.ReversedAt).toLocaleDateString() : ''}
                            </div>
                        )}
                    </div>
                </div>

                {/* Print-only header strip */}
                <div className="print-only print-header">
                    <h1>{active.VoucherTypeName || 'Voucher'} — {active.VoucherNo}</h1>
                    <div className="meta">
                        <span>Status: {status}  •  Date: {new Date(active.VoucherDate).toLocaleDateString()}</span>
                        <span>Printed: {new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    </div>
                </div>

                {msg && (
                    <div className={msg.kind === 'ok' ? 'alert-success' : 'alert-error'} style={{
                        padding: 12, borderRadius: 8,
                        background: msg.kind === 'ok' ? '#f0fdf4' : '#fef2f2',
                        color: msg.kind === 'ok' ? '#15803d' : '#b91c1c',
                        border: '1px solid ' + (msg.kind === 'ok' ? '#bbf7d0' : '#fecaca')
                    }}>
                        {msg.text}
                    </div>
                )}

                {/* Audit row (compact) */}
                <div className="erp-panel" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--erp-text-muted)' }}>
                    <span>Created by <strong style={{ color: 'var(--erp-text)' }}>{active.CreatedByName || '—'}</strong> on {fmtDTLong(active.EntryUserDateTime)}</span>
                    {active.PostedAt && <span>· Posted by <strong style={{ color: 'var(--erp-text)' }}>{active.PostedBy ? `#${active.PostedBy}` : '—'}</strong> at {fmtDTLong(active.PostedAt)}</span>}
                    {active.ReversesVoucherID && <span>· Reverses voucher #{active.ReversesVoucherID}</span>}
                </div>

                {/* Lines */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--primary)' }}>
                        <Calculator size={18} /> <strong>Voucher Lines</strong>
                    </div>
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr><th>Account</th><th>Narration</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th></tr>
                            </thead>
                            <tbody>
                                {active.lines.map((l, i) => (
                                    <tr key={i}>
                                        <td><span style={{ fontFamily: 'monospace', color: '#64748b' }}>{l.GLCode}</span> {l.GLTitle}</td>
                                        <td>{l.Narration}</td>
                                        <td style={{ textAlign: 'right' }}>{Number(l.Debit) ? fmt(l.Debit) : '—'}</td>
                                        <td style={{ textAlign: 'right' }}>{Number(l.Credit) ? fmt(l.Credit) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                {(() => {
                                    // Owner report 2026-07-02: the Total row was
                                    // echoing header.TotalAmount for both columns
                                    // (customer-facing invoice net of COGS), so
                                    // vouchers with COGS lines (SI, GRN) appeared
                                    // to under-total on both sides. Sum the actual
                                    // detail lines so the number matches the
                                    // ledger truth. Header TotalAmount is left as
                                    // is because the Sales Register etc. rely on
                                    // it representing the revenue slice only.
                                    const dr = (active.lines || []).reduce((s, l) => s + (Number(l.Debit)  || 0), 0);
                                    const cr = (active.lines || []).reduce((s, l) => s + (Number(l.Credit) || 0), 0);
                                    const unbalanced = Math.abs(dr - cr) > 0.01;
                                    return (
                                        <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                                            <td colSpan={2}>Total{unbalanced && <span style={{ color: '#dc2626', marginLeft: 6 }}>UNBALANCED</span>}</td>
                                            <td style={{ textAlign: 'right', color: unbalanced ? '#dc2626' : undefined }}>{fmt(dr)}</td>
                                            <td style={{ textAlign: 'right', color: unbalanced ? '#dc2626' : undefined }}>{fmt(cr)}</td>
                                        </tr>
                                    );
                                })()}
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Unfinalize modal */}
                {showUnfinalize && (
                    <div className="modal-overlay" onClick={() => setShowUnfinalize(false)}>
                        <div className="modal-card" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>Request Unfinalize — {active.VoucherNo}</h3>
                                <button onClick={() => setShowUnfinalize(false)}>×</button>
                            </div>
                            <div style={{ padding: 20 }}>
                                <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: 12 }}>
                                    Unfinalizing posts a mirror reversal voucher (Dr ↔ Cr swapped). The original stays visible but is marked <strong>Reversed</strong>. Requires Account Manager approval, then Admin action.
                                </p>

                                {blockers === null && (
                                    <div style={{ padding: 8, color: '#64748b', fontSize: '0.85rem' }}>
                                        <Loader2 size={12} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} />
                                        Checking downstream references...
                                    </div>
                                )}

                                {blockers && blockers.length > 0 && (
                                    <div style={{
                                        background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                                        padding: 12, marginBottom: 12
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b91c1c', fontWeight: 600, marginBottom: 8 }}>
                                            <AlertTriangle size={16} />
                                            Cannot unfinalize — {blockers.length} downstream reference{blockers.length === 1 ? '' : 's'}:
                                        </div>
                                        <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.85rem', color: '#7f1d1d' }}>
                                            {blockers.map((b, i) => (
                                                <li key={i} style={{ marginBottom: 4 }}>{b.description}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {blockers && blockers.length === 0 && (
                                    <>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Reason</label>
                                        <textarea
                                            value={unfinalizeReason}
                                            onChange={e => setUnfinalizeReason(e.target.value)}
                                            rows={4}
                                            placeholder="Explain why this voucher needs to be reversed..."
                                            style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}
                                        />
                                    </>
                                )}

                                <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                    <button className="btn-sm" onClick={() => { setShowUnfinalize(false); setBlockers(null); }}>Cancel</button>
                                    {blockers && blockers.length === 0 && (
                                        <button className="btn" onClick={handleRequestUnfinalize} disabled={busy} style={{ background: '#b45309' }}>
                                            Submit Request
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ---------- New-voucher UI ----------
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel
                title={`${title || 'Finance Voucher'}${editingId ? ` — Editing Draft #${editingId}` : ''}`}
                subtitle={editingId
                    ? 'Editing existing Draft. Save replaces the current lines.'
                    : 'Save as Draft. Then Finalize to post to the General Ledger.'}
                actions={
                    <>
                        {editingId && (
                            <button type="button" className="erp-btn erp-btn-sm"
                                onClick={() => { setEditingId(null); loadVoucher(editingId); }}>
                                Cancel Edit
                            </button>
                        )}
                        {(editingId ? canEdit : canInsert) && (
                            <button type="button" className="erp-btn erp-btn-primary" onClick={handleSave} disabled={busy}>
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                {editingId ? 'Update Draft' : 'Save as Draft'}
                            </button>
                        )}
                    </>
                }
            />

            <div style={{ background: 'var(--erp-surface)', border: '1px solid var(--erp-border)', borderRadius: 'var(--erp-radius)', overflow: 'hidden' }}>
                <ErpStatusBar current="draft" steps={[
                    { id: 'draft',    label: editingId ? 'Editing Draft' : 'New Draft' },
                    { id: 'posted',   label: 'Posted' },
                    { id: 'reversed', label: 'Reversed' },
                ]} />
            </div>

            {msg && (
                <div style={{
                    padding: 12, borderRadius: 8,
                    background: msg.kind === 'ok' ? '#f0fdf4' : '#fef2f2',
                    color: msg.kind === 'ok' ? '#15803d' : '#b91c1c',
                    border: '1px solid ' + (msg.kind === 'ok' ? '#bbf7d0' : '#fecaca')
                }}>
                    {msg.text}
                </div>
            )}

            {/* Drafts panel */}
            {drafts.length > 0 && (
                <div className="card" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                    <button
                        onClick={() => setShowDrafts(s => !s)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                                 display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem',
                                 fontWeight: 600, color: '#92400e' }}
                    >
                        <Edit3 size={16} />
                        {drafts.length} draft voucher{drafts.length === 1 ? '' : 's'} — click to {showDrafts ? 'hide' : 'view'}
                    </button>
                    {showDrafts && (
                        <div style={{ marginTop: 12 }}>
                            {drafts.map(d => (
                                <div
                                    key={d.VoucherID}
                                    onClick={() => loadVoucher(d.VoucherID)}
                                    style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 12px', borderBottom: '1px solid #fde68a',
                                        cursor: 'pointer', fontSize: '0.85rem'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#fef3c7'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 600, marginRight: 12 }}>{d.VoucherNo}</span>
                                        <span style={{ color: '#475569' }}>{d.Remarks || '(no remarks)'}</span>
                                    </div>
                                    <div style={{ color: '#64748b' }}>
                                        PKR {fmt(d.TotalAmount)} · {new Date(d.VoucherDate).toLocaleDateString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', color: 'var(--primary)' }}>
                    <FileText size={20} /><strong>Voucher Header</strong>
                </div>
                <div className="grid-3">
                    {(() => {
                        // For a brand-new voucher: locked to today.
                        // For a Posted JV being edited: keep the existing date, no constraints.
                        // For a Posted CPV/CRV/BPV/BRV within the 5-day window: allow shifting
                        //   inside [today − 5, today]. Backend re-validates on save.
                        const editingActive = editingId && active;
                        const editingJV = editingActive && active.VoucherTypeCode === 'JV' && active.Status === 'Posted';
                        const editingBackdate = editingActive
                            && active.VoucherTypeCode !== 'JV'
                            && active.Status === 'Posted'
                            && hasModule('finance_voucher_backdate')
                            && isWithinBackdateWindow(active.VoucherDate);
                        if (editingJV) {
                            return (
                                <div className="form-group">
                                    <label>Date <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>(JV — any date)</span></label>
                                    <input type="date" value={header.VoucherDate}
                                           onChange={e => setHeader({ ...header, VoucherDate: e.target.value })} />
                                </div>
                            );
                        }
                        if (editingBackdate) {
                            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - BACKDATE_WINDOW_DAYS);
                            const minStr = cutoff.toISOString().split('T')[0];
                            return (
                                <div className="form-group">
                                    <label>Date <span style={{ fontSize: 11, color: '#059669', fontWeight: 400 }}>(within last {BACKDATE_WINDOW_DAYS} days)</span></label>
                                    <input type="date" value={header.VoucherDate}
                                           min={minStr} max={todayStr}
                                           onChange={e => setHeader({ ...header, VoucherDate: e.target.value })} />
                                </div>
                            );
                        }
                        return (
                            <div className="form-group">
                                <label>Date <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>(today only)</span></label>
                                <input type="date" value={todayStr} min={todayStr} max={todayStr} readOnly disabled
                                       title="Policy: vouchers are always posted with today's date — backdate / future-date are blocked." />
                            </div>
                        );
                    })()}
                    <div className="form-group">
                        <label>Voucher Type</label>
                        <select value={header.VoucherTypeID} onChange={e => setHeader({...header, VoucherTypeID: e.target.value})} disabled={!!forceTypeCode}>
                            {types.map(t => <option key={t.VoucherTypeID} value={t.VoucherTypeID}>{t.VoucherTypeName} ({t.VoucherTypeCode})</option>)}
                        </select>
                    </div>
                    <div className="form-group"><label>Reference / Remarks</label><input type="text" value={header.Remarks} onChange={e => setHeader({...header, Remarks: e.target.value})} placeholder="Overall voucher description..." /></div>
                </div>
                {/* Charity flag — owner ask 2026-07-18. Ticked = 1% of the
                    voucher total is recorded in dms_CharityTracking as a side
                    ledger. Has no GL impact. */}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#78350f' }}>
                        <input type="checkbox" checked={!!header.IsCharitable}
                               onChange={e => setHeader({ ...header, IsCharitable: e.target.checked })} />
                        Mark as charitable — 1% tracked (no GL impact)
                    </label>
                </div>
            </div>

            <div className="card">
                <div className="card-header" style={{ border: 'none', padding: 0, marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}><Calculator size={20} /><strong>Transaction Details</strong></div>
                    <button className="btn-sm" onClick={addItem}><Plus size={16} /> Add Line</button>
                </div>

                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr><th style={{ width: '30%' }}>Account</th><th>Narration</th><th style={{ width: '15%' }}>Debit</th><th style={{ width: '15%' }}>Credit</th><th></th></tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => {
                                const isLockedRow0 = idx === 0 && (isFixedCash || isFixedBank);
                                const drLocked = isLockedRow0 && fixedLockedSide === 'Debit';
                                const crLocked = isLockedRow0 && fixedLockedSide === 'Credit';
                                return (
                                <tr key={idx}>
                                    <td>
                                        {isLockedRow0 && isFixedCash ? (
                                            <select value={item.GLCAID} disabled style={{ background: '#f1f5f9' }}>
                                                <option value={cashBookGLCAID}>Cash Book {coa.find(a => a.GLCAID == cashBookGLCAID) ? `(${coa.find(a => a.GLCAID == cashBookGLCAID).GLCode})` : ''}</option>
                                            </select>
                                        ) : isLockedRow0 && isFixedBank ? (
                                            <SearchableSelect
                                                value={item.GLCAID}
                                                onChange={(id) => updateItem(idx, 'GLCAID', id)}
                                                placeholder="Search bank by code or name…"
                                                options={banks.map(b => ({ id: b.GLCAID, label: b.GLTitle, sub: b.GLCode }))}
                                            />
                                        ) : (
                                            <SearchableSelect
                                                value={item.GLCAID}
                                                onChange={(id) => updateItem(idx, 'GLCAID', id)}
                                                placeholder="Search account by code or name…"
                                                options={coa.map(a => ({ id: a.GLCAID, label: a.GLTitle, sub: a.GLCode }))}
                                            />
                                        )}
                                    </td>
                                    <td><input type="text" value={item.Narration} onChange={e => updateItem(idx, 'Narration', e.target.value)} placeholder="Line narration..." /></td>
                                    <td><input type="number" value={item.Debit}  onChange={e => updateItem(idx, 'Debit',  e.target.value)} disabled={drLocked} style={{ textAlign: 'right', background: drLocked ? '#f1f5f9' : 'white' }} /></td>
                                    <td><input type="number" value={item.Credit} onChange={e => updateItem(idx, 'Credit', e.target.value)} disabled={crLocked} style={{ textAlign: 'right', background: crLocked ? '#f1f5f9' : 'white' }} /></td>
                                    <td>{isLockedRow0 ? <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span> : <button onClick={() => removeItem(idx)} style={{ color: '#ef4444' }}><Trash2 size={18} /></button>}</td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="voucher-footer">
                    <div className="totals-box">
                        <div className="total-row"><span>Total Debit:</span><span>PKR {fmt(totals.debit)}</span></div>
                        <div className="total-row"><span>Total Credit:</span><span>PKR {fmt(totals.credit)}</span></div>
                        <div className={`total-row status ${balanced ? 'balanced' : 'unbalanced'}`}>
                            <span>Difference:</span><span>PKR {fmt(totals.debit - totals.credit)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .voucher-footer { display: flex; justify-content: flex-end; margin-top: 20px; padding-top: 20px; border-top: 2px solid #e2e8f0; }
                .totals-box { width: 300px; display: flex; flex-direction: column; gap: 10px; }
                .total-row { display: flex; justify-content: space-between; font-weight: 600; color: #475569; }
                .total-row.status { padding: 8px; border-radius: 6px; margin-top: 5px; }
                .total-row.status.balanced { background: #dcfce7; color: #166534; }
                .total-row.status.unbalanced { background: #fee2e2; color: #991b1b; }
                .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
                .modal-card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
                .modal-header { padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
                .modal-header button { background: transparent; border: none; cursor: pointer; font-size: 1.2rem; }
            `}</style>
        </div>
    );
}
