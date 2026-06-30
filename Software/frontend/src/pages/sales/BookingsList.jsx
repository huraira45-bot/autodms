/**
 * Sales — Bookings list.
 * Filters by status, search, "assigned to me" (executive view).
 * Click a row → /sales/bookings/:id for the detail view.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ClipboardList, Plus, RefreshCw, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FlashMsg, Th, Td } from './VehicleModelsAdmin';
import { DataCard, EmptyState, FilterBar, PageHeader, SearchField, StatusPill } from '../../components/UXPrimitives';

const API = '/api';
const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');

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

export default function BookingsList() {
    const { hasModule } = useAuth();
    const canCreate = hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm');
    const navigate = useNavigate();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('');
    const [assignedToMe, setAssignedToMe] = useState(false);
    const [search, setSearch] = useState('');
    const [msg, setMsg] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter) params.status = statusFilter;
            if (assignedToMe) params.assignedToMe = 1;
            if (search) params.search = search;
            const r = await axios.get(`${API}/sales/bookings`, { params });
            setRows(r.data);
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setLoading(false);
    }, [statusFilter, assignedToMe, search]);
    useEffect(() => { load(); }, [load]);

    return (
        <div className="ux-page-stack">
            <PageHeader
                icon={ClipboardList}
                eyebrow="Vehicle sales"
                title="Vehicle Bookings"
                subtitle="Track customer bookings, payments, allocation, approvals, and delivery readiness."
                meta={
                    <>
                        <StatusPill tone="amber">Approvals</StatusPill>
                        <StatusPill tone="blue">Payment</StatusPill>
                        <StatusPill tone="green">Delivery</StatusPill>
                    </>
                }
                actions={
                    <>
                    {canCreate && (
                        <button className="btn" onClick={() => navigate('/sales/bookings/new')}>
                            <Plus size={16} /> New Booking
                        </button>
                    )}
                    <button className="btn-sm" onClick={load} disabled={loading}>
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
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ minWidth: 190 }}>
                    <option value="">All statuses</option>
                    {Object.keys(STATUS_STYLE).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={assignedToMe} onChange={e => setAssignedToMe(e.target.checked)} /> My bookings only
                </label>
            </FilterBar>

            <DataCard>
                {rows.length === 0 ? (
                    <EmptyState
                        icon={ClipboardList}
                        title={loading ? 'Loading bookings' : 'No bookings found'}
                        message={loading ? 'Fetching the latest booking list.' : 'Try a different status, search term, or assignment filter.'}
                    />
                ) : (
                    <div className="table-wrapper">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>#</Th><Th>Customer</Th><Th>Vehicle</Th>
                                <Th align="right">Standard</Th><Th align="right">Negotiated</Th>
                                <Th align="right">Disc</Th><Th align="right">Paid</Th>
                                <Th>Status</Th><Th>Allocated</Th><Th>Executive</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(b => {
                                return (
                                    <tr key={b.BookingID}
                                        onClick={() => navigate(`/sales/bookings/${b.BookingID}`)}
                                        className="row-clickable"
                                        style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <Td mono color="#475569">{b.BookingNo}</Td>
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
