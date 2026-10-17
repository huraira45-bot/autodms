/**
 * Sales — Bookings list.
 * Filters by booking date, status, search, "assigned to me" (executive view).
 * Click a row → /sales/bookings/:id for the detail view.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ClipboardList, Plus, RefreshCw, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ErpControlPanel } from '../../components/erp';
import { FlashMsg, Th, Td } from './VehicleModelsAdmin';
import { DataCard, EmptyState, FilterBar, PageHeader, SearchField, StatusPill } from '../../components/UXPrimitives';

const API = '/api';
const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');
const fmtDate = (value) => value
    ? new Date(String(value).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

const STATUS_STYLE = {
    Draft:                { bg: '#e2e8f0', col: '#475569' },
    PendingApproval:      { bg: '#fef3c7', col: '#92400e' },
    PendingPayment:       { bg: '#dbeafe', col: '#1e40af' },
    Allocated:            { bg: '#fed7aa', col: '#9a3412' },
    MasterInvoicePending: { bg: '#fef3c7', col: '#b45309' },
    MasterInvoicePosted:  { bg: '#e0e7ff', col: '#3730a3' },
    ReadyForDelivery:     { bg: '#dbeafe', col: '#1e40af' },
    DeliveryApproved:     { bg: '#dcfce7', col: '#15803d' },
    GatePassIssued:       { bg: '#dcfce7', col: '#15803d' },
    Closed:               { bg: '#dcfce7', col: '#15803d' },
    Cancelled:            { bg: '#fee2e2', col: '#b91c1c' },
};

const STATUS_TONE = {
    Draft: 'slate',
    PendingApproval: 'amber',
    PendingPayment: 'blue',
    Allocated: 'orange',
    MasterInvoicePending: 'amber',
    MasterInvoicePosted: 'indigo',
    ReadyForDelivery: 'blue',
    DeliveryApproved: 'green',
    GatePassIssued: 'green',
    Closed: 'green',
    Cancelled: 'red',
};

export default function BookingsList({ cancelled = false }) {
    const { hasModule } = useAuth();
    const canCreate = hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm');
    const navigate = useNavigate();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('');
    const [assignedToMe, setAssignedToMe] = useState(false);
    const [search, setSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [msg, setMsg] = useState(null);
    const requestId = useRef(0);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        const currentRequest = ++requestId.current;
        if (dateFrom && dateTo && dateFrom > dateTo) {
            setRows([]);
            setLoading(false);
            flash('err', 'From date must be on or before To date.');
            return;
        }
        setMsg(null);
        setLoading(true);
        try {
            const params = {};
            if (!cancelled && statusFilter) params.status = statusFilter;
            if (assignedToMe) params.assignedToMe = 1;
            if (search) params.search = search;
            if (dateFrom) params.dateFrom = dateFrom;
            if (dateTo) params.dateTo = dateTo;
            const r = await axios.get(`${API}/sales/bookings${cancelled ? '/cancelled' : ''}`, { params });
            if (currentRequest === requestId.current) setRows(r.data);
        } catch (e) {
            if (currentRequest === requestId.current) {
                setRows([]);
                flash('err', e.response?.data?.error || e.message);
            }
        }
        if (currentRequest === requestId.current) setLoading(false);
    }, [cancelled, statusFilter, assignedToMe, search, dateFrom, dateTo]);
    useEffect(() => { load(); }, [load]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel
                title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ClipboardList size={16} /> {cancelled ? 'Cancelled Vehicle Bookings' : 'Vehicle Bookings'}</span>}
                subtitle={cancelled ? 'Completed booking cancellations, with cancellation date and reason.' : 'Track customer bookings, payments, allocation, approvals, and delivery readiness. Cancelled bookings are listed separately.'}
                actions={
                    <>
                        <button type="button" className="erp-btn" onClick={() => navigate(cancelled ? '/sales/bookings' : '/sales/cancelled-bookings')}>
                            {cancelled ? 'Vehicle Bookings' : 'Cancelled Bookings'}
                        </button>
                        {canCreate && !cancelled && (
                            <button type="button" className="erp-btn erp-btn-primary" onClick={() => navigate('/sales/bookings/new')}>
                                <Plus size={14} /> New Booking
                            </button>
                        )}
                        <button type="button" className="erp-btn erp-btn-sm" onClick={load} disabled={loading}>
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        </button>
                    </>
                }
            />

            {msg && <FlashMsg msg={msg} />}

            <FilterBar resultLabel={`${rows.length} bookings`}>
                <SearchField
                    value={search}
                    onChange={setSearch}
                    placeholder="Booking #, customer, corporate PO..."
                    width={320}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                    Booking from
                    <input type="date" aria-label="Booking from date" value={dateFrom}
                        max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                    To
                    <input type="date" aria-label="Booking to date" value={dateTo}
                        min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} />
                </label>
                {(dateFrom || dateTo) && (
                    <button type="button" className="erp-btn erp-btn-sm"
                        onClick={() => { setDateFrom(''); setDateTo(''); }}>
                        Clear dates
                    </button>
                )}
                {cancelled ? <StatusPill tone="red">Cancelled</StatusPill> : <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ minWidth: 190 }}>
                    <option value="">All statuses</option>
                    {Object.keys(STATUS_STYLE).filter(s => s !== 'Cancelled').map(s => <option key={s} value={s}>{s}</option>)}
                </select>}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={assignedToMe} onChange={e => setAssignedToMe(e.target.checked)} /> My bookings only
                </label>
            </FilterBar>

            <DataCard>
                {rows.length === 0 ? (
                    <EmptyState
                        icon={ClipboardList}
                        title={loading ? 'Loading bookings' : 'No bookings found'}
                        message={loading ? 'Fetching the latest booking list.' : 'Try a different booking date, status, search term, or assignment filter.'}
                    />
                ) : (
                    <div className="table-wrapper">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>#</Th><Th>Booking Date</Th><Th>Promised month</Th><Th>Customer</Th><Th>Vehicle</Th>
                                <Th align="right">Standard</Th><Th align="right">Negotiated</Th>
                                <Th align="right">Disc</Th><Th align="right">Paid</Th>
                                <Th>Status</Th><Th>Allocated</Th><Th>Executive</Th>
                                {cancelled && <><Th>Cancelled on</Th><Th>Cancellation reason</Th></>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(b => {
                                return (
                                    <tr key={b.BookingID}
                                        onClick={() => navigate(`/sales/bookings/${b.BookingID}`)}
                                        className="row-clickable"
                                        style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <Td mono color="#475569">
                                            {b.BookingNo}
                                            {b.IsHistorical && (
                                                <span title="Entered afterwards as a past record; its payments link to vouchers already in the ledger"
                                                      style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px',
                                                               borderRadius: 20, background: '#f1f5f9', color: '#475569', whiteSpace: 'nowrap' }}>
                                                    HISTORICAL
                                                </span>
                                            )}
                                        </Td>
                                        <Td style={{ whiteSpace: 'nowrap' }}>{fmtDate(b.BookingDate || b.CreatedAt)}</Td>
                                        <Td style={{ whiteSpace: 'nowrap' }}>{b.PromisedDeliveryMonth ? new Date(b.PromisedDeliveryMonth).toLocaleDateString('en-PK', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Not set'}</Td>
                                        <Td>
                                            <div style={{ fontWeight: 500 }}>{b.PartyName}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{b.PartyType} {b.CorporatePONumber ? `· PO ${b.CorporatePONumber}` : ''}</div>
                                        </Td>
                                        <Td>
                                            <strong>{b.VariantCode}</strong>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{b.VariantName}</div>
                                        </Td>
                                        <Td align="right">{fmtN(b.StandardPrice)}</Td>
                                        <Td align="right" style={{ fontWeight: 600 }}>{fmtN(b.NegotiatedPrice)}</Td>
                                        <Td align="right" style={{ color: b.DiscountAmount > 0 ? '#b91c1c' : '#94a3b8' }}>{fmtN(b.DiscountAmount)}</Td>
                                        <Td align="right" style={{ color: b.AmountPaidToDate >= b.NegotiatedPrice ? '#15803d' : '#b45309', fontWeight: 600 }}>{fmtN(b.AmountPaidToDate)}</Td>
                                        <Td><StatusPill tone={STATUS_TONE[b.Status] || 'slate'}>{b.Status}</StatusPill></Td>
                                        <Td mono style={{ color: '#475569', fontSize: '0.78rem' }}>{b.AllocatedChasisNo || '—'}</Td>
                                        <Td style={{ fontSize: '0.78rem' }}>{b.SalesExecutiveName?.trim() || '—'}</Td>
                                        {cancelled && <><Td>{fmtDate(b.CancelledAt) || '—'}</Td><Td>{b.CancellationReason || '—'}</Td></>}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    </div>
                )}
            </DataCard>
        </div>
    );
}
