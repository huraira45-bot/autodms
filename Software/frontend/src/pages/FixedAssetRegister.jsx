/**
 * Fixed Asset Register + IAS 16 SLM depreciation runs.
 * Owner ask 2026-08-20: register non-current assets with a straight-line
 * depreciation %, then post a period's charge as one JV per click.
 * Backend: controllers/fixedAssetController.js, services/fixedAssetDepreciationService.js.
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Landmark, Calculator, Pencil, X } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { Link } from 'react-router-dom';
import SearchableSelect from '../components/SearchableSelect';
import { ErpControlPanel } from '../components/erp';

const API = '/api/fixed-assets';
const money = n => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_TONE = {
    ACTIVE: { bg: '#dcfce7', fg: '#16a34a' },
    FULLY_DEPRECIATED: { bg: '#e0e7ff', fg: '#4338ca' },
    DISPOSED: { bg: '#f1f5f9', fg: '#64748b' },
};
const StatusPill = ({ status }) => {
    const t = STATUS_TONE[status] || STATUS_TONE.ACTIVE;
    return <span style={{ background: t.bg, color: t.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{status.replace('_', ' ')}</span>;
};

export default function FixedAssetRegister() {
    const { notify, confirm } = useFeedback();
    const [tab, setTab] = useState('register');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel title="Fixed Assets" subtitle="Non-current asset register and IAS 16 straight-line depreciation.">
                <div style={{ display: 'flex', gap: 4 }}>
                    <TabBtn active={tab === 'register'} onClick={() => setTab('register')} icon={Landmark} label="Register" />
                    <TabBtn active={tab === 'runs'} onClick={() => setTab('runs')} icon={Calculator} label="Depreciation Runs" />
                </div>
            </ErpControlPanel>
            {tab === 'register' ? <RegisterTab notify={notify} confirm={confirm} /> : <RunsTab notify={notify} confirm={confirm} />}
        </div>
    );
}

const TabBtn = ({ active, onClick, icon: Icon, label }) => (
    <button onClick={onClick} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 6,
        border: '1px solid ' + (active ? 'var(--erp-brand)' : 'var(--erp-border)'),
        background: active ? 'var(--erp-brand)' : 'var(--erp-surface)',
        color: active ? '#fff' : 'var(--erp-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    }}><Icon size={14} /> {label}</button>
);

/* ───────────────────────── Register tab ───────────────────────── */

function RegisterTab({ notify, confirm }) {
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalAsset, setModalAsset] = useState(null); // null=closed, {}=new, {...}=edit

    const load = useCallback(() => {
        setLoading(true);
        axios.get(API).then(r => setAssets(r.data || [])).catch(err => {
            notify({ type: 'error', title: 'Could not load assets', message: err.response?.data?.error || err.message });
        }).finally(() => setLoading(false));
    }, [notify]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="erp-list">
            <div style={{ overflowX: 'auto' }}>
                <table>
                    <thead>
                        <tr>
                            <th>Asset</th><th>Category</th><th>Rate</th><th>Start Date</th>
                            <th className="num">Cost</th><th className="num">Accum. Dep</th><th className="num">NBV</th>
                            <th>Status</th><th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {!loading && assets.length === 0 && (
                            <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--erp-text-muted)' }}>No assets registered yet.</td></tr>
                        )}
                        {assets.map(a => (
                            <tr key={a.FixedAssetID}>
                                <td>
                                    <div style={{ fontWeight: 600 }}>{a.AssetName}</div>
                                    <div className="erp-mono" style={{ fontSize: 11, color: 'var(--erp-text-muted)' }}>{a.AssetCode}</div>
                                </td>
                                <td>{a.CategoryName}</td>
                                <td>{Number(a.DepreciationRatePct)}%</td>
                                <td>{a.DepreciationStartDate ? new Date(a.DepreciationStartDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                                <td className="num">{money(a.Cost)}</td>
                                <td className="num">{money(a.AccumulatedDepreciation)}</td>
                                <td className="num" style={{ fontWeight: 700 }}>{money(a.NetBookValue)}</td>
                                <td><StatusPill status={a.Status} /></td>
                                <td>
                                    <button className="erp-btn" onClick={() => setModalAsset(a)} title="Edit policy">
                                        <Pencil size={13} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="erp-list-footer">
                <div>{assets.length} asset{assets.length === 1 ? '' : 's'}</div>
                <button className="erp-btn erp-btn-primary" onClick={() => setModalAsset({})}>
                    <Plus size={14} /> Add Asset
                </button>
            </div>
            {modalAsset && (
                <AssetModal asset={modalAsset} onClose={() => setModalAsset(null)}
                    onSaved={() => { setModalAsset(null); load(); }} notify={notify} />
            )}
        </div>
    );
}

function AssetModal({ asset, onClose, onSaved, notify }) {
    const isNew = !asset.FixedAssetID;
    const [candidates, setCandidates] = useState([]);
    const [glcaid, setGlcaid] = useState(asset.AssetGLCAID || '');
    const [residual, setResidual] = useState(asset.ResidualValue ?? 0);
    const [rate, setRate] = useState(asset.DepreciationRatePct ?? '');
    const [startDate, setStartDate] = useState(asset.DepreciationStartDate ? asset.DepreciationStartDate.slice(0, 10) : '');
    const [opening, setOpening] = useState(asset.OpeningAccumulatedDepreciation ?? 0);
    const [notes, setNotes] = useState(asset.Notes || '');
    const [status, setStatus] = useState(asset.Status || 'ACTIVE');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isNew) axios.get(`${API}/candidates`).then(r => setCandidates(r.data || [])).catch(() => {});
    }, [isNew]);

    const save = async () => {
        if (isNew && !glcaid) return notify({ type: 'error', title: 'Pick an asset account first' });
        if (!rate || Number(rate) <= 0) return notify({ type: 'error', title: 'Depreciation rate % is required' });
        if (!startDate) return notify({ type: 'error', title: 'Depreciation start date is required' });
        setSaving(true);
        try {
            if (isNew) {
                await axios.post(API, {
                    AssetGLCAID: glcaid, ResidualValue: residual, DepreciationRatePct: rate,
                    DepreciationStartDate: startDate, OpeningAccumulatedDepreciation: opening, Notes: notes,
                });
                notify({ type: 'success', title: 'Asset registered' });
            } else {
                await axios.patch(`${API}/${asset.FixedAssetID}`, {
                    ResidualValue: residual, DepreciationRatePct: rate, DepreciationStartDate: startDate,
                    Notes: notes, Status: status,
                });
                notify({ type: 'success', title: 'Asset updated' });
            }
            onSaved();
        } catch (err) {
            notify({ type: 'error', title: 'Save failed', message: err.response?.data?.error || err.message });
        }
        setSaving(false);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
            <div style={{ background: 'var(--erp-surface)', borderRadius: 8, padding: 20, width: 460, maxWidth: '92vw' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{isNew ? 'Add Asset' : asset.AssetName}</div>
                    <X size={16} style={{ cursor: 'pointer' }} onClick={onClose} />
                </div>

                {isNew ? (
                    <Field label="Asset (Cost account)">
                        <SearchableSelect
                            value={glcaid} onChange={setGlcaid}
                            options={candidates.map(c => ({ id: c.GLCAID, label: c.GLTitle, group: c.CategoryName, sub: c.GLCode }))}
                            placeholder="— Pick a Non-Current Asset account —" title="Pick an asset" />
                    </Field>
                ) : (
                    <div style={{ fontSize: 11, color: 'var(--erp-text-muted)', marginBottom: 10 }}>
                        Cost account: <span className="erp-mono">{asset.AssetCode}</span> (linked account can't be changed after setup)
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Depreciation Rate % (SLM, annual)">
                        <input type="number" step="0.01" min="0" max="100" value={rate} onChange={e => setRate(e.target.value)}
                            placeholder="e.g. 20 for 5-year life" />
                    </Field>
                    <Field label="Residual Value">
                        <input type="number" step="0.01" min="0" value={residual} onChange={e => setResidual(e.target.value)} />
                    </Field>
                    <Field label="Depreciation Start Date">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </Field>
                    <Field label="Opening Accum. Depreciation">
                        <input type="number" step="0.01" min="0" value={opening} onChange={e => setOpening(e.target.value)} disabled={!isNew} />
                    </Field>
                </div>
                {isNew && (
                    <div style={{ fontSize: 10, color: 'var(--erp-text-muted)', marginTop: -6, marginBottom: 10 }}>
                        Leave 0 for a new asset. Enter a brought-forward figure only if this asset already had some useful life consumed before today.
                    </div>
                )}
                {!isNew && (
                    <Field label="Status">
                        <select value={status} onChange={e => setStatus(e.target.value)}>
                            <option value="ACTIVE">Active</option>
                            <option value="DISPOSED">Disposed</option>
                            {asset.Status === 'FULLY_DEPRECIATED' && <option value="FULLY_DEPRECIATED">Fully Depreciated</option>}
                        </select>
                    </Field>
                )}
                <Field label="Notes">
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
                </Field>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                    <button className="erp-btn" onClick={onClose}>Cancel</button>
                    <button className="erp-btn erp-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
            </div>
        </div>
    );
}

const Field = ({ label, children }) => (
    <div className="form-group" style={{ marginBottom: 10 }}>
        <label>{label}</label>
        {children}
    </div>
);

/* ───────────────────────── Depreciation Runs tab ───────────────────────── */

function RunsTab({ notify, confirm }) {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [posting, setPosting] = useState(false);
    const [runs, setRuns] = useState([]);

    const loadRuns = useCallback(() => {
        axios.get(`${API}/runs`).then(r => setRuns(r.data || [])).catch(() => {});
    }, []);
    useEffect(() => { loadRuns(); }, [loadRuns]);

    const runPreview = useCallback(() => {
        setLoading(true);
        setPreview(null);
        axios.get(`${API}/runs/preview`, { params: { year, month } })
            .then(r => setPreview(r.data))
            .catch(err => notify({ type: 'error', title: 'Preview failed', message: err.response?.data?.error || err.message }))
            .finally(() => setLoading(false));
    }, [year, month, notify]);

    const postRun = async () => {
        const ok = await confirm({
            title: `Post depreciation for ${MONTHS[month - 1]} ${year}?`,
            message: `This posts a Draft Journal Voucher for ${preview.candidates.length} asset(s), total PKR ${money(preview.totalCharge)}. It will not hit the ledger until someone finalizes it from Vouchers.`,
            confirmLabel: 'Create Draft JV',
            tone: 'warning',
        });
        if (!ok) return;
        setPosting(true);
        try {
            const r = await axios.post(`${API}/runs`, { year, month });
            notify({ type: 'success', title: 'Draft JV created', message: r.data.message });
            setPreview(null);
            loadRuns();
        } catch (err) {
            notify({ type: 'error', title: 'Could not create run', message: err.response?.data?.error || err.message });
        }
        setPosting(false);
    };

    const cancelRun = async (run) => {
        const ok = await confirm({
            title: `Cancel draft run — ${MONTHS[run.PeriodMonth - 1]} ${run.PeriodYear}?`,
            message: `This deletes the Draft voucher ${run.VoucherNo} and its entries. The period can then be re-run.`,
            confirmLabel: 'Cancel Run', tone: 'danger',
        });
        if (!ok) return;
        try {
            await axios.post(`${API}/runs/${run.RunID}/cancel`);
            notify({ type: 'success', title: 'Draft run cancelled' });
            loadRuns();
        } catch (err) {
            notify({ type: 'error', title: 'Could not cancel', message: err.response?.data?.error || err.message });
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="erp-list" style={{ padding: 14 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <Field label="Year"><input type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 100 }} /></Field>
                    <Field label="Month">
                        <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ width: 120 }}>
                            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                    </Field>
                    <button className="erp-btn erp-btn-primary" onClick={runPreview} disabled={loading} style={{ marginBottom: 10 }}>
                        {loading ? 'Computing…' : 'Preview'}
                    </button>
                </div>

                {preview && (
                    <>
                        {preview.existingRun && (
                            <div style={{ background: '#fef3c7', color: '#92400e', padding: 8, borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
                                A run already exists for this period — voucher {preview.existingRun.VoucherNo} ({preview.existingRun.VoucherStatus}).
                            </div>
                        )}
                        {preview.candidates.length === 0 ? (
                            <div style={{ color: 'var(--erp-text-muted)', fontSize: 12, padding: 12 }}>No assets are due for depreciation this period.</div>
                        ) : (
                            <>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
                                    <thead>
                                        <tr style={{ background: 'var(--erp-surface-alt)' }}>
                                            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Asset</th>
                                            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Category</th>
                                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Cost</th>
                                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Rate</th>
                                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Charge</th>
                                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Closing NBV</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.candidates.map(c => (
                                            <tr key={c.fixedAssetId} style={{ borderTop: '1px solid var(--erp-border)' }}>
                                                <td style={{ padding: '4px 8px' }}>{c.assetName}{c.willBeFullyDepreciated && <span style={{ marginLeft: 6, fontSize: 10, color: '#4338ca' }}>final charge</span>}</td>
                                                <td style={{ padding: '4px 8px' }}>{c.categoryName}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{money(c.cost)}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{c.ratePct}%</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>{money(c.charge)}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{money(c.closingNBV)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid var(--erp-border)', fontWeight: 700 }}>
                                            <td colSpan={4} style={{ padding: '6px 8px', textAlign: 'right' }}>Total</td>
                                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{money(preview.totalCharge)}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                                    <button className="erp-btn erp-btn-primary" onClick={postRun} disabled={posting || !!preview.existingRun}>
                                        {posting ? 'Posting…' : 'Post Depreciation JV'}
                                    </button>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>

            <div className="erp-list">
                <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12 }}>Run History</div>
                <div style={{ overflowX: 'auto' }}>
                    <table>
                        <thead><tr><th>Period</th><th>Voucher</th><th>Status</th><th className="num">Assets</th><th className="num">Amount</th><th>Created</th><th></th></tr></thead>
                        <tbody>
                            {runs.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--erp-text-muted)' }}>No depreciation runs yet.</td></tr>}
                            {runs.map(r => (
                                <tr key={r.RunID}>
                                    <td>{MONTHS[r.PeriodMonth - 1]} {r.PeriodYear}</td>
                                    <td className="erp-mono">{r.VoucherNo || '—'}</td>
                                    <td>{r.VoucherStatus}</td>
                                    <td className="num">{r.AssetCount}</td>
                                    <td className="num">{money(r.TotalAmount)}</td>
                                    <td>{r.CreatedByName}</td>
                                    <td>
                                        {r.VoucherStatus === 'Draft' && (
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <Link to="/vouchers/browse" className="erp-btn" style={{ textDecoration: 'none' }}>Review & Finalize</Link>
                                                <button className="erp-btn" onClick={() => cancelRun(r)}>Cancel</button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
