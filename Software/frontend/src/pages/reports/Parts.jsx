import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Package, ArrowDownUp, AlertTriangle, ShoppingCart, FileInput, Wrench, BookOpen, Search, Coins } from 'lucide-react';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO, PeriodControls, DateInput } from './ReportShell';

const firstOfMonthISO = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

// =====================================================================
// Stock Movement Register
// =====================================================================
const StockMovementControls = ({ params, updateParam }) => (
    <>
        <DateInput label="From" value={params.from} onChange={v => updateParam('from', v)} />
        <DateInput label="To"   value={params.to}   onChange={v => updateParam('to', v)} />
        <input
            type="search"
            placeholder="Search by part # or name…"
            value={params.search || ''}
            onChange={e => updateParam('search', e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', minWidth: 220 }}
        />
    </>
);

export function StockMovement() {
    const excelExport = (data, params) => ({
        filename: `stock-movement-${params.from || 'from'}_to_${params.to || 'to'}.csv`,
        headers: ['Item Code', 'Item Name', 'Part No', 'Category', 'Location', 'Warehouse',
                  'Qty In', 'Qty Out', 'Balance Qty', 'Rate', 'Value In', 'Value Out', 'Total Value'],
        rows: (data.rows || []).map(r => [
            r.ItemCode, r.ItemName, r.PartNumber, r.Category, r.BinLocation, r.Warehouse,
            Number(r.QtyIn), Number(r.QtyOut), Number(r.BalanceQty), Number(r.Rate),
            Number(r.ValIn), Number(r.ValOut), Number(r.TotalValue),
        ]),
    });
    return (
        <ReportShell
            title="Stock Movement Register"
            subtitle="Per-item inflow (GRN) and outflow (issues + sales) in the period."
            icon={ArrowDownUp}
            endpoint="parts/stock-movement"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO(), search: '' }}
            controls={StockMovementControls}
            excelExport={excelExport}
            superWide
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Items moved',  value: fmtInt(data.totals.items) },
                        { label: 'Qty In',       value: fmt(data.totals.qtyIn) },
                        { label: 'Qty Out',      value: fmt(data.totals.qtyOut) },
                        { label: 'Balance Qty',  value: fmt(data.totals.balQty) },
                        { label: 'Value In',     value: 'PKR ' + fmt(data.totals.valIn) },
                        { label: 'Value Out',    value: 'PKR ' + fmt(data.totals.valOut) },
                        { label: 'Total Value',  value: 'PKR ' + fmt(data.totals.totalValue), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH align="right">#</TH>
                                    <TH>Item Code</TH><TH>Item Name</TH><TH>Part No</TH>
                                    <TH>Category</TH><TH>Location</TH><TH>Warehouse</TH>
                                    <TH align="right">Qty In</TH><TH align="right">Qty Out</TH>
                                    <TH align="right">Balance Quantity</TH>
                                    <TH align="right">Rate</TH>
                                    <TH align="right">Value In</TH><TH align="right">Value Out</TH>
                                    <TH align="right">Total Value</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={14}>No movement in this period.</Empty>}
                                {data.rows.map((r, idx) => (
                                    <tr key={r.ItemId} style={trBody}>
                                        <TD align="right" color="#94a3b8">{idx + 1}</TD>
                                        <TD mono>{r.ItemCode}</TD>
                                        <TD>{r.ItemName}</TD>
                                        <TD mono color="#64748b">{r.PartNumber}</TD>
                                        <TD>{r.Category}</TD>
                                        <TD mono color="#64748b">{r.BinLocation}</TD>
                                        <TD>{r.Warehouse}</TD>
                                        <TD align="right" mono>{fmt(r.QtyIn)}</TD>
                                        <TD align="right" mono>{fmt(r.QtyOut)}</TD>
                                        <TD align="right" mono color={r.BalanceQty >= 0 ? '#15803d' : '#b91c1c'} bold>
                                            {fmt(r.BalanceQty)}
                                        </TD>
                                        <TD align="right" mono>{fmt(r.Rate)}</TD>
                                        <TD align="right" mono>{fmt(r.ValIn)}</TD>
                                        <TD align="right" mono>{fmt(r.ValOut)}</TD>
                                        <TD align="right" mono bold color={r.TotalValue >= 0 ? '#15803d' : '#b91c1c'}>
                                            {fmt(r.TotalValue)}
                                        </TD>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Reorder Alert
// =====================================================================
export function ReorderAlert() {
    const excelExport = (data) => ({
        filename: `reorder-alert.csv`,
        headers: ['Item Code', 'Item Name', 'Part No', 'Location', 'Category',
                  'On Hand', 'Reorder Level', 'Shortfall', 'Rate', 'Suggested Order Value'],
        rows: (data.rows || []).map(r => [
            r.ItemCode, r.ItemName, r.PartNumber, r.BinLocation, r.Category,
            Number(r.OnHand), Number(r.ReOrderLevel), Number(r.Shortfall), Number(r.Rate), Number(r.SuggestedOrderValue),
        ]),
    });
    return (
        <ReportShell
            title="Reorder Alert"
            subtitle="Items at or below their reorder level — sorted by suggested order value."
            icon={AlertTriangle}
            endpoint="parts/reorder-alert"
            defaultParams={{}}
            controls={() => null}
            excelExport={excelExport}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Items below reorder', value: fmtInt(data.totals.items) },
                        { label: 'Total shortfall',     value: fmt(data.totals.shortfall) },
                        { label: 'Suggested order',     value: 'PKR ' + fmt(data.totals.suggestedOrderValue), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Item Code</TH><TH>Item Name</TH><TH>Part No</TH>
                                    <TH>Location</TH><TH>Category</TH>
                                    <TH align="right">On Hand</TH><TH align="right">Reorder Level</TH>
                                    <TH align="right">Shortfall</TH><TH align="right">Rate</TH>
                                    <TH align="right">Suggested Order Value</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={10}>All items above reorder level. 🎉</Empty>}
                                {data.rows.map(r => (
                                    <tr key={r.ItemId} style={trBody}>
                                        <TD mono>{r.ItemCode}</TD>
                                        <TD>{r.ItemName}</TD>
                                        <TD mono color="#64748b">{r.PartNumber}</TD>
                                        <TD mono color="#64748b">{r.BinLocation}</TD>
                                        <TD>{r.Category}</TD>
                                        <TD align="right" mono color={r.OnHand <= 0 ? '#b91c1c' : '#a16207'} bold>{fmt(r.OnHand)}</TD>
                                        <TD align="right" mono>{fmt(r.ReOrderLevel)}</TD>
                                        <TD align="right" mono color="#b91c1c" bold>{fmt(r.Shortfall)}</TD>
                                        <TD align="right" mono>{fmt(r.Rate)}</TD>
                                        <TD align="right" mono bold>{fmt(r.SuggestedOrderValue)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Parts Sales Register
// =====================================================================
export function PartsSalesRegister() {
    const excelExport = (data, params) => ({
        filename: `parts-sales-register-${params.from || 'from'}_to_${params.to || 'to'}.csv`,
        headers: ['Invoice #', 'Date', 'Customer', 'Item Code', 'Item Name', 'Qty', 'Rate', 'Discount', 'Tax', 'Net'],
        rows: (data.rows || []).map(r => [
            r.SaleVoucherNo, r.SaleDate, r.Customer, r.ItemCode, r.ItemName,
            Number(r.Quantity), Number(r.ItemRate), Number(r.Discount), Number(r.Tax), Number(r.LineNet),
        ]),
    });
    return (
        <ReportShell
            title="Parts Sales Register"
            subtitle="Line-by-line store-sale invoices in the period."
            icon={ShoppingCart}
            endpoint="parts/sales-register"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO(), search: '' }}
            controls={({ params, updateParam }) => (
                <>
                    <PeriodControls params={params} updateParam={updateParam} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        Search:
                        <input value={params.search || ''}
                            onChange={e => updateParam('search', e.target.value)}
                            placeholder="Part no, part name, customer, or invoice #"
                            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', minWidth: 260 }} />
                    </label>
                </>
            )}
            excelExport={excelExport}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Invoices', value: fmtInt(data.totals.invoices) },
                        { label: 'Lines',    value: fmtInt(data.totals.lines) },
                        { label: 'Quantity', value: fmt(data.totals.quantity) },
                        { label: 'Discount', value: fmt(data.totals.discount) },
                        { label: 'Tax',      value: fmt(data.totals.tax) },
                        { label: 'Net',      value: 'PKR ' + fmt(data.totals.net), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Invoice #</TH><TH>Date</TH><TH>Customer</TH>
                                    <TH>Item Code</TH><TH>Item Name</TH>
                                    <TH align="right">Qty</TH><TH align="right">Rate</TH>
                                    <TH align="right">Discount</TH><TH align="right">Tax</TH>
                                    <TH align="right">Net</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={10}>No store sales in this period.</Empty>}
                                {data.rows.map((r, i) => (
                                    <tr key={i} style={trBody}>
                                        <TD mono>{r.SaleVoucherNo}</TD>
                                        <TD>{r.SaleDate}</TD>
                                        <TD>{r.Customer}</TD>
                                        <TD mono>{r.ItemCode}</TD>
                                        <TD>{r.ItemName}</TD>
                                        <TD align="right" mono>{fmt(r.Quantity)}</TD>
                                        <TD align="right" mono>{fmt(r.ItemRate)}</TD>
                                        <TD align="right" mono>{fmt(r.Discount)}</TD>
                                        <TD align="right" mono>{fmt(r.Tax)}</TD>
                                        <TD align="right" mono bold>{fmt(r.LineNet)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Parts Purchase Summary (GRN)
// =====================================================================
export function PartsPurchaseSummary() {
    const excelExport = (data, params) => ({
        filename: `parts-purchase-summary-${params.from || 'from'}_to_${params.to || 'to'}.csv`,
        headers: ['GRN #', 'Date', 'Supplier', 'Item Code', 'Item Name', 'Qty', 'Rate', 'Discount', 'Tax', 'Net'],
        rows: (data.rows || []).map(r => [
            r.GRNNo, r.GRNDate, r.Supplier, r.ItemCode, r.ItemName,
            Number(r.Quantity), Number(r.ItemRate), Number(r.Discount), Number(r.Tax), Number(r.LineNet),
        ]),
    });
    return (
        <ReportShell
            title="Parts Purchase Summary"
            subtitle="Line-by-line GRN entries (parts received) in the period."
            icon={FileInput}
            endpoint="parts/purchase-summary"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO(), search: '' }}
            controls={({ params, updateParam }) => (
                <>
                    <PeriodControls params={params} updateParam={updateParam} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        Search:
                        <input value={params.search || ''}
                            onChange={e => updateParam('search', e.target.value)}
                            placeholder="Part no, part name, supplier, or GRN #"
                            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', minWidth: 260 }} />
                    </label>
                </>
            )}
            excelExport={excelExport}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'GRNs',     value: fmtInt(data.totals.grns) },
                        { label: 'Lines',    value: fmtInt(data.totals.lines) },
                        { label: 'Quantity', value: fmt(data.totals.quantity) },
                        { label: 'Discount', value: fmt(data.totals.discount) },
                        { label: 'Tax',      value: fmt(data.totals.tax) },
                        { label: 'Net',      value: 'PKR ' + fmt(data.totals.net), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>GRN #</TH><TH>Date</TH><TH>Supplier</TH>
                                    <TH>Item Code</TH><TH>Item Name</TH>
                                    <TH align="right">Qty</TH><TH align="right">Rate</TH>
                                    <TH align="right">Discount</TH><TH align="right">Tax</TH>
                                    <TH align="right">Net</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={10}>No GRNs in this period.</Empty>}
                                {data.rows.map((r, i) => (
                                    <tr key={i} style={trBody}>
                                        <TD mono>{r.GRNNo}</TD>
                                        <TD>{r.GRNDate}</TD>
                                        <TD>{r.Supplier}</TD>
                                        <TD mono>{r.ItemCode}</TD>
                                        <TD>{r.ItemName}</TD>
                                        <TD align="right" mono>{fmt(r.Quantity)}</TD>
                                        <TD align="right" mono>{fmt(r.ItemRate)}</TD>
                                        <TD align="right" mono>{fmt(r.Discount)}</TD>
                                        <TD align="right" mono>{fmt(r.Tax)}</TD>
                                        <TD align="right" mono bold>{fmt(r.LineNet)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Parts Issued to Job Cards (owner ask 2026-07-03)
// =====================================================================
function BusinessUnitPicker({ params, updateParam }) {
    const [types, setTypes] = useState([]);
    useEffect(() => {
        axios.get('/api/workshop/job-types')
            .then(r => setTypes(r.data || []))
            .catch(() => setTypes([]));
    }, []);
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
            Business Unit:
            <select value={params.businessType || ''}
                    onChange={e => updateParam('businessType', e.target.value)}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                <option value="">All</option>
                {types.map(t => (
                    <option key={t.JobCardTypeId} value={t.JobCardTypeId}>
                        {t.CardCode} — {t.Title}
                    </option>
                ))}
            </select>
        </label>
    );
}

const ModePill = ({ mode }) => {
    const meta = mode === 'CREDIT'
        ? { label: 'Credit', bg: '#dbeafe', color: '#1e3a8a' }
        : { label: 'Cash',   bg: '#dcfce7', color: '#166534' };
    return (
        <span style={{ background: meta.bg, color: meta.color,
                        padding: '2px 8px', borderRadius: 12,
                        fontSize: '0.72rem', fontWeight: 700 }}>
            {meta.label}
        </span>
    );
};

export function PartsIssuedToJc() {
    const excelExport = (data, params) => ({
        filename: `parts-issued-to-jc-${params.from || 'from'}_to_${params.to || 'to'}.csv`,
        headers: ['Slip #', 'Date', 'Job Card', 'BU', 'Mode', 'Customer / Party', 'Vehicle',
                  'Part #', 'Item', 'Qty', 'Rate', 'Discount', 'GST', 'Net'],
        rows: (data.rows || []).map(r => [
            r.SlipNo, r.IssueDate, `JC-${r.JobCardNo}`, r.BusinessUnitCode, r.Mode, r.Customer, r.VehicleRegNo,
            r.ItemCode, r.ItemName, Number(r.Quantity), Number(r.Rate), Number(r.Discount), Number(r.Tax), Number(r.LineNet),
        ]),
    });
    return (
        <ReportShell
            title="Parts Issued to Job Cards"
            subtitle="Line-by-line record of every spare part issued to a workshop job card, segregated by Business Unit and Cash / Credit."
            icon={Wrench}
            endpoint="parts/issued-to-jc"
            landscape
            defaultParams={{ from: firstOfMonthISO(), to: todayISO(), search: '', businessType: '', mode: '' }}
            excelExport={excelExport}
            controls={({ params, updateParam }) => (
                <>
                    <PeriodControls params={params} updateParam={updateParam} />
                    <BusinessUnitPicker params={params} updateParam={updateParam} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        Mode:
                        <select value={params.mode || ''}
                                onChange={e => updateParam('mode', e.target.value)}
                                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                            <option value="">All</option>
                            <option value="CASH">Cash only</option>
                            <option value="CREDIT">Credit only</option>
                        </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        Search:
                        <input value={params.search || ''}
                            onChange={e => updateParam('search', e.target.value)}
                            placeholder="Job No, Part No, Item Name, Customer / Party"
                            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', minWidth: 260 }} />
                    </label>
                </>
            )}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Slips',       value: fmtInt(data.totals.slips) },
                        { label: 'Lines',       value: fmtInt(data.totals.lines) },
                        { label: 'Cash Net',    value: 'PKR ' + fmt(data.totals.byMode?.cash?.net || 0) },
                        { label: 'Credit Net',  value: 'PKR ' + fmt(data.totals.byMode?.credit?.net || 0) },
                        { label: 'GST',         value: fmt(data.totals.tax) },
                        { label: 'Net',         value: 'PKR ' + fmt(data.totals.net), strong: true },
                    ]} />

                    {/* By-Business-Unit × Cash/Credit segregation */}
                    {data.totals.byBusinessUnit && data.totals.byBusinessUnit.length > 0 && (
                        <div className="card" style={{ overflowX: 'auto' }}>
                            <div style={{ padding: '10px 12px', fontWeight: 700, color: '#334155',
                                          borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
                                          fontSize: '0.85rem' }}>
                                By Business Unit — Cash vs Credit
                            </div>
                            <table style={tableStyle}>
                                <thead>
                                    <tr style={trHeader}>
                                        <TH>Code</TH>
                                        <TH>Business Unit</TH>
                                        <TH align="right" style={{ background: '#f0fdf4' }}>Cash Slips</TH>
                                        <TH align="right" style={{ background: '#f0fdf4' }}>Cash Net</TH>
                                        <TH align="right" style={{ background: '#eff6ff' }}>Credit Slips</TH>
                                        <TH align="right" style={{ background: '#eff6ff' }}>Credit Net</TH>
                                        <TH align="right">Total Slips</TH>
                                        <TH align="right">Total Net</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.totals.byBusinessUnit.map(b => (
                                        <tr key={b.Code} style={trBody}>
                                            <TD mono bold>{b.Code}</TD>
                                            <TD>{b.Name}</TD>
                                            <TD align="right" mono color="#166534">{fmtInt(b.Cash.Slips)}</TD>
                                            <TD align="right" mono color="#166534">{fmt(b.Cash.Net)}</TD>
                                            <TD align="right" mono color="#1e3a8a">{fmtInt(b.Credit.Slips)}</TD>
                                            <TD align="right" mono color="#1e3a8a">{fmt(b.Credit.Net)}</TD>
                                            <TD align="right" mono bold>{fmtInt(b.Total.Slips)}</TD>
                                            <TD align="right" mono bold>{fmt(b.Total.Net)}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={2} style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'right' }}>Total:</td>
                                        <TD align="right" mono bold color="#166534">{fmtInt(data.totals.byMode?.cash?.slips || 0)}</TD>
                                        <TD align="right" mono bold color="#166534">{fmt(data.totals.byMode?.cash?.net || 0)}</TD>
                                        <TD align="right" mono bold color="#1e3a8a">{fmtInt(data.totals.byMode?.credit?.slips || 0)}</TD>
                                        <TD align="right" mono bold color="#1e3a8a">{fmt(data.totals.byMode?.credit?.net || 0)}</TD>
                                        <TD align="right" mono bold>{fmtInt(data.totals.slips)}</TD>
                                        <TD align="right" mono bold>{fmt(data.totals.net)}</TD>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Slip #</TH><TH>Date</TH>
                                    <TH>Job Card</TH><TH>BU</TH><TH>Mode</TH>
                                    <TH>Customer / Party</TH><TH>Vehicle</TH>
                                    <TH>Part #</TH><TH>Item</TH>
                                    <TH align="right">Qty</TH><TH align="right">Rate</TH>
                                    <TH align="right">Disc</TH><TH align="right">GST</TH>
                                    <TH align="right">Net</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={14}>No parts issued in this period.</Empty>}
                                {data.rows.map((r, i) => (
                                    <tr key={i} style={trBody}>
                                        <TD mono>{r.SlipNo}</TD>
                                        <TD>{r.IssueDate}</TD>
                                        <TD mono><strong>JC-{r.JobCardNo}</strong></TD>
                                        <TD mono title={r.BusinessUnitName}>{r.BusinessUnitCode}</TD>
                                        <TD><ModePill mode={r.Mode} /></TD>
                                        <TD>{r.Customer}</TD>
                                        <TD mono>{r.VehicleRegNo}</TD>
                                        <TD mono>{r.ItemCode}</TD>
                                        <TD>{r.ItemName}</TD>
                                        <TD align="right" mono>{fmt(r.Quantity)}</TD>
                                        <TD align="right" mono>{fmt(r.Rate)}</TD>
                                        <TD align="right" mono>{fmt(r.Discount)}</TD>
                                        <TD align="right" mono color="#1d4ed8">{fmt(r.Tax)}</TD>
                                        <TD align="right" mono bold>{fmt(r.LineNet)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Job Card Parts Cost & Margin (owner ask 2026-09-09)
// "part cost job cardwise for each business each item with there
//  purchase price and sale price"
//
// Purchase price is UnitLandedCost, snapshotted on the issue line — NOT
// StockRate, which the issue routine writes as a duplicate of the sale
// rate. Lines predating that snapshot fall back to the item's current
// cost and are marked "est."; the count is surfaced in a banner so the
// number is judged rather than trusted blindly.
// Margin is net of discount and excludes GST.
// =====================================================================
const FinPill = ({ finalized }) => (
    <span style={{ background: finalized ? '#dcfce7' : '#fef3c7',
                   color:      finalized ? '#166534' : '#92400e',
                   padding: '1px 7px', borderRadius: 12,
                   fontSize: '0.68rem', fontWeight: 700 }}>
        {finalized ? 'Finalized' : 'Draft'}
    </span>
);

const marginColor = (v) => (v < 0 ? '#b91c1c' : v > 0 ? '#166534' : '#64748b');

export function JcPartsCostMargin() {
    const excelExport = (data, params) => ({
        filename: `jc-parts-cost-margin-${params.from || 'from'}_to_${params.to || 'to'}.csv`,
        headers: ['BU Code', 'Business Unit', 'Job Card', 'JC Date', 'Vehicle', 'Customer',
                  'Slip #', 'Issue Date', 'Part #', 'Item', 'Qty',
                  'Purchase Price', 'Sale Price', 'Cost', 'Discount', 'GST',
                  'Sale (Net)', 'Margin', 'Margin %', 'Cost Basis'],
        rows: (data.rows || []).map(r => [
            r.BusinessUnitCode, r.BusinessUnitName, `JC-${r.JobCardNo}`, r.JobCardDate,
            r.VehicleRegNo, r.Customer, r.SlipNo, r.IssueDate, r.ItemCode, r.ItemName,
            Number(r.Quantity), Number(r.PurchasePrice), Number(r.SalePrice),
            Number(r.CostTotal), Number(r.Discount), Number(r.Tax),
            Number(r.SaleNet), Number(r.Margin), Number(r.MarginPct),
            r.CostEstimated ? 'Estimated (current cost)' : 'Actual (at issue)',
        ]),
    });

    return (
        <ReportShell
            title="Job Card Parts Cost & Margin"
            subtitle="Every part issued to a job card with its purchase price and sale price — grouped job-card-wise under each Business Unit."
            icon={Coins}
            endpoint="parts/jc-cost-margin"
            landscape
            defaultParams={{ from: firstOfMonthISO(), to: todayISO(), search: '', businessType: '', onlyFinalized: '' }}
            excelExport={excelExport}
            controls={({ params, updateParam }) => (
                <>
                    <PeriodControls params={params} updateParam={updateParam} />
                    <BusinessUnitPicker params={params} updateParam={updateParam} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        <input type="checkbox"
                               checked={params.onlyFinalized === '1'}
                               onChange={e => updateParam('onlyFinalized', e.target.checked ? '1' : '')} />
                        Finalized job cards only
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        Search:
                        <input value={params.search || ''}
                               onChange={e => updateParam('search', e.target.value)}
                               placeholder="Job No, Vehicle, Part No, Item, Customer"
                               style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', minWidth: 260 }} />
                    </label>
                </>
            )}
        >
            {(data) => {
                const t = data.totals || {};
                const units = t.byBusinessUnit || [];

                // Rows arrive ordered by BU code, job card, line — bucket them
                // so each job card renders under its own sub-header.
                const byJc = new Map();
                for (const r of (data.rows || [])) {
                    const k = JSON.stringify([r.BusinessUnitCode, r.JobCardNo]);
                    if (!byJc.has(k)) byJc.set(k, []);
                    byJc.get(k).push(r);
                }

                return (
                    <>
                        <SummaryBar items={[
                            { label: 'Job Cards',  value: fmtInt(t.jobCards || 0) },
                            { label: 'Lines',      value: fmtInt(t.lines || 0) },
                            { label: 'Qty',        value: fmt(t.quantity || 0) },
                            { label: 'Cost',       value: 'PKR ' + fmt(t.cost || 0) },
                            { label: 'Sale (Net)', value: 'PKR ' + fmt(t.saleNet || 0) },
                            { label: 'Margin',     value: 'PKR ' + fmt(t.margin || 0), strong: true },
                            { label: 'Margin %',   value: fmt(t.marginPct || 0) + ' %' },
                        ]} />

                        {t.estimatedCostLines > 0 && (
                            <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start',
                                                           padding: 12, background: '#fffbeb', border: '1px solid #fde68a' }}>
                                <AlertTriangle size={16} color="#b45309" style={{ marginTop: 2, flexShrink: 0 }} />
                                <div style={{ fontSize: '0.8rem', color: '#78350f' }}>
                                    <strong>{fmtInt(t.estimatedCostLines)}</strong> of {fmtInt(t.lines || 0)} lines
                                    {t.estimatedSaleValue > 0 && <> (PKR <strong>{fmt(t.estimatedSaleValue)}</strong> of sales)</>}
                                    {' '}carry no cost on the issue slip. Cost for these has been recovered from the item
                                    record or its last GRN and is marked <strong>est.</strong> — indicative, not the historic figure.
                                    {' '}<strong>These job cards posted no COGS to the GL and relieved no inventory</strong>,
                                    so profit on them is currently overstated.
                                    {t.missingCostLines > 0 && (
                                        <> {' '}<strong>{fmtInt(t.missingCostLines)}</strong> line(s) have no cost anywhere —
                                        never received on a GRN and no purchase price on the item — so their margin is meaningless
                                        until someone sets a cost.</>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Business Unit roll-up */}
                        {units.length > 0 && (
                            <div className="card" style={{ overflowX: 'auto' }}>
                                <div style={{ padding: '10px 12px', fontWeight: 700, color: '#334155',
                                              borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
                                              fontSize: '0.85rem' }}>
                                    By Business Unit
                                </div>
                                <table style={tableStyle}>
                                    <thead>
                                        <tr style={trHeader}>
                                            <TH>Code</TH><TH>Business Unit</TH>
                                            <TH align="right">Job Cards</TH><TH align="right">Lines</TH>
                                            <TH align="right">Qty</TH><TH align="right">Cost</TH>
                                            <TH align="right">Sale (Net)</TH><TH align="right">Margin</TH>
                                            <TH align="right">Margin %</TH>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {units.map(b => (
                                            <tr key={b.Code} style={trBody}>
                                                <TD mono bold>{b.Code}</TD>
                                                <TD>{b.Name}</TD>
                                                <TD align="right" mono>{fmtInt(b.JobCards)}</TD>
                                                <TD align="right" mono>{fmtInt(b.Lines)}</TD>
                                                <TD align="right" mono>{fmt(b.Quantity)}</TD>
                                                <TD align="right" mono color="#b45309">{fmt(b.Cost)}</TD>
                                                <TD align="right" mono>{fmt(b.SaleNet)}</TD>
                                                <TD align="right" mono bold color={marginColor(b.Margin)}>{fmt(b.Margin)}</TD>
                                                <TD align="right" mono color={marginColor(b.Margin)}>{fmt(b.MarginPct)} %</TD>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                            <td colSpan={2} style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'right' }}>Total:</td>
                                            <TD align="right" mono bold>{fmtInt(t.jobCards || 0)}</TD>
                                            <TD align="right" mono bold>{fmtInt(t.lines || 0)}</TD>
                                            <TD align="right" mono bold>{fmt(t.quantity || 0)}</TD>
                                            <TD align="right" mono bold color="#b45309">{fmt(t.cost || 0)}</TD>
                                            <TD align="right" mono bold>{fmt(t.saleNet || 0)}</TD>
                                            <TD align="right" mono bold color={marginColor(t.margin || 0)}>{fmt(t.margin || 0)}</TD>
                                            <TD align="right" mono bold color={marginColor(t.margin || 0)}>{fmt(t.marginPct || 0)} %</TD>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}

                        {units.length === 0 && (
                            <div className="card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                No parts were issued to job cards in this period.
                            </div>
                        )}

                        {/* Job-card-wise detail, one card per Business Unit */}
                        {units.map(b => (
                            <div className="card" key={'d-' + b.Code} style={{ overflowX: 'auto', breakInside: 'avoid' }}>
                                <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0',
                                              background: '#eff6ff', display: 'flex', justifyContent: 'space-between',
                                              alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                    <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: '0.9rem' }}>
                                        {b.Code} — {b.Name}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                                        Cost <strong>{fmt(b.Cost)}</strong>
                                        {' · '}Sale <strong>{fmt(b.SaleNet)}</strong>
                                        {' · '}Margin <strong style={{ color: marginColor(b.Margin) }}>
                                            {fmt(b.Margin)} ({fmt(b.MarginPct)} %)
                                        </strong>
                                    </div>
                                </div>
                                <table style={tableStyle}>
                                    <thead>
                                        <tr style={trHeader}>
                                            <TH>Slip #</TH><TH>Issue Date</TH>
                                            <TH>Part #</TH><TH>Item</TH>
                                            <TH align="right">Qty</TH>
                                            <TH align="right">Purchase Price</TH>
                                            <TH align="right">Sale Price</TH>
                                            <TH align="right">Cost</TH>
                                            <TH align="right">Disc</TH>
                                            <TH align="right">Sale (Net)</TH>
                                            <TH align="right">Margin</TH>
                                            <TH align="right">Margin %</TH>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(b.jobCardRows || []).map(jc => (
                                            <React.Fragment key={b.Code + '-' + jc.JobCardNo}>
                                                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                                                    <td colSpan={12} style={{ padding: '7px 12px' }}>
                                                        <div style={{ display: 'flex', gap: 12, alignItems: 'center',
                                                                      flexWrap: 'wrap', fontSize: '0.8rem' }}>
                                                            <strong style={{ fontFamily: 'monospace' }}>JC-{jc.JobCardNo}</strong>
                                                            <FinPill finalized={jc.IsFinalized} />
                                                            <span style={{ color: '#475569' }}>{jc.JobCardDate}</span>
                                                            <span style={{ fontFamily: 'monospace', color: '#475569' }}>{jc.VehicleRegNo}</span>
                                                            <span style={{ color: '#475569' }}>{jc.Customer}</span>
                                                            <span style={{ marginLeft: 'auto', color: '#334155' }}>
                                                                Cost <strong>{fmt(jc.Cost)}</strong>
                                                                {' · '}Sale <strong>{fmt(jc.SaleNet)}</strong>
                                                                {' · '}Margin <strong style={{ color: marginColor(jc.Margin) }}>
                                                                    {fmt(jc.Margin)} ({fmt(jc.MarginPct)} %)
                                                                </strong>
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {(byJc.get(JSON.stringify([b.Code, jc.JobCardNo])) || []).map((r, ri) => (
                                                    <tr key={jc.JobCardNo + '-' + ri} style={trBody}>
                                                        <TD mono>{r.SlipNo}</TD>
                                                        <TD>{r.IssueDate}</TD>
                                                        <TD mono>{r.ItemCode}</TD>
                                                        <TD>{r.ItemName}</TD>
                                                        <TD align="right" mono>{fmt(r.Quantity)}</TD>
                                                        <TD align="right" mono color="#b45309">
                                                            {fmt(r.PurchasePrice)}
                                                            {r.CostEstimated && (
                                                                <span title="Landed cost was not recorded on this slip - item's current cost used"
                                                                      style={{ marginLeft: 4, fontSize: '0.65rem', color: '#b45309', fontWeight: 700 }}>est.</span>
                                                            )}
                                                        </TD>
                                                        <TD align="right" mono>{fmt(r.SalePrice)}</TD>
                                                        <TD align="right" mono color="#b45309">{fmt(r.CostTotal)}</TD>
                                                        <TD align="right" mono>{fmt(r.Discount)}</TD>
                                                        <TD align="right" mono>{fmt(r.SaleNet)}</TD>
                                                        <TD align="right" mono bold color={marginColor(r.Margin)}>{fmt(r.Margin)}</TD>
                                                        <TD align="right" mono color={marginColor(r.Margin)}>{fmt(r.MarginPct)} %</TD>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </>
                );
            }}
        </ReportShell>
    );
}

// =====================================================================
// Parts Sold (Finalized) — same BU × Cash/Credit segregation as
// PartsIssuedToJc but restricted to finalized JCs, plus a toggle to
// include finalized Store Sales. Owner ask 2026-07-22.
// =====================================================================
export function PartsSoldFinalized() {
    const excelExport = (data, params) => ({
        filename: `parts-sold-finalized-${params.from || 'from'}_to_${params.to || 'to'}.csv`,
        headers: ['Doc', 'Voucher Date', 'Reference', 'BU', 'Mode', 'Customer / Party', 'Vehicle',
                  'Part #', 'Item', 'Qty', 'Rate', 'Discount', 'Revenue', 'GST', 'Gross'],
        rows: (data.rows || []).map(r => [
            r.Channel, r.DocDate, r.Channel === 'JC' ? `JC-${r.RefNo}` : (r.RefNo || r.DocRef),
            r.BusinessUnitCode, r.Mode, r.Customer || '', r.VehicleRegNo || '',
            r.ItemCode, r.ItemName, Number(r.Quantity), Number(r.Rate), Number(r.Discount),
            Number(r.Revenue), Number(r.Tax), Number(r.LineNet),
        ]),
    });
    return (
        <ReportShell
            title="Parts Sold (Finalized)"
            subtitle="Parts sold via finalized JCs + (optional) finalized Store Sales — dated by voucher, so Revenue equals GL 401003001 (excl. GST)."
            icon={ShoppingCart}
            endpoint="parts/sold-finalized"
            landscape
            defaultParams={{
                from: firstOfMonthISO(), to: todayISO(),
                search: '', businessType: '', mode: '',
                includeStoreSale: '1', includeReturns: '1',
            }}
            excelExport={excelExport}
            controls={({ params, updateParam }) => (
                <>
                    <PeriodControls params={params} updateParam={updateParam} />
                    <BusinessUnitPicker params={params} updateParam={updateParam} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        Mode:
                        <select value={params.mode || ''}
                                onChange={e => updateParam('mode', e.target.value)}
                                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                            <option value="">All</option>
                            <option value="CASH">Cash only</option>
                            <option value="CREDIT">Credit only</option>
                        </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', cursor: 'pointer' }}
                           title="Include finalized Store Sale invoices in the report">
                        <input type="checkbox"
                               checked={String(params.includeStoreSale || '1') !== '0'}
                               onChange={e => updateParam('includeStoreSale', e.target.checked ? '1' : '0')} />
                        Include Store Sales
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', cursor: 'pointer' }}
                           title="Net-off finalized Store Sale Returns (SSR) — matches the ledger's Period Debits">
                        <input type="checkbox"
                               checked={String(params.includeReturns || '1') !== '0'}
                               onChange={e => updateParam('includeReturns', e.target.checked ? '1' : '0')} />
                        Net returns (SSR)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        Search:
                        <input value={params.search || ''}
                            onChange={e => updateParam('search', e.target.value)}
                            placeholder="Doc No, Part No, Item Name, Customer / Party"
                            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', minWidth: 260 }} />
                    </label>
                </>
            )}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Documents',           value: fmtInt(data.totals.docs) },
                        { label: 'Lines',               value: fmtInt(data.totals.lines) },
                        { label: 'Gross (incl. GST)',   value: 'PKR ' + fmt(data.totals.grossWithTax || 0) },
                        { label: '(−) GST',             value: 'PKR ' + fmt(data.totals.tax || 0) },
                        { label: '(−) Returns (SSR)',   value: 'PKR ' + fmt(data.totals.returns || 0) },
                        { label: 'Net Revenue (GL)',    value: 'PKR ' + fmt(data.totals.revenue), strong: true },
                    ]} />

                    {/* By-Business-Unit × Cash/Credit — Revenue (excl. GST) so it matches 401003001 */}
                    {data.totals.byBusinessUnit && data.totals.byBusinessUnit.length > 0 && (
                        <div className="card" style={{ overflowX: 'auto' }}>
                            <div style={{ padding: '10px 12px', fontWeight: 700, color: '#334155',
                                          borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
                                          fontSize: '0.85rem' }}>
                                By Business Unit — Cash vs Credit (Revenue excl. GST)
                            </div>
                            <table style={tableStyle}>
                                <thead>
                                    <tr style={trHeader}>
                                        <TH>Code</TH>
                                        <TH>Business Unit</TH>
                                        <TH align="right" style={{ background: '#f0fdf4' }}>Cash Docs</TH>
                                        <TH align="right" style={{ background: '#f0fdf4' }}>Cash Revenue</TH>
                                        <TH align="right" style={{ background: '#eff6ff' }}>Credit Docs</TH>
                                        <TH align="right" style={{ background: '#eff6ff' }}>Credit Revenue</TH>
                                        <TH align="right">Total Docs</TH>
                                        <TH align="right">Total Revenue</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.totals.byBusinessUnit.map(b => (
                                        <tr key={b.Code} style={trBody}>
                                            <TD mono bold>{b.Code}</TD>
                                            <TD>{b.Name}</TD>
                                            <TD align="right" mono color="#166534">{fmtInt(b.Cash.Docs)}</TD>
                                            <TD align="right" mono color="#166534">{fmt(b.Cash.Revenue)}</TD>
                                            <TD align="right" mono color="#1e3a8a">{fmtInt(b.Credit.Docs)}</TD>
                                            <TD align="right" mono color="#1e3a8a">{fmt(b.Credit.Revenue)}</TD>
                                            <TD align="right" mono bold>{fmtInt(b.Total.Docs)}</TD>
                                            <TD align="right" mono bold>{fmt(b.Total.Revenue)}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={2} style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'right' }}>Total:</td>
                                        <TD align="right" mono bold color="#166534">{fmtInt(data.totals.byMode?.cash?.docs || 0)}</TD>
                                        <TD align="right" mono bold color="#166534">{fmt(data.totals.byMode?.cash?.revenue || 0)}</TD>
                                        <TD align="right" mono bold color="#1e3a8a">{fmtInt(data.totals.byMode?.credit?.docs || 0)}</TD>
                                        <TD align="right" mono bold color="#1e3a8a">{fmt(data.totals.byMode?.credit?.revenue || 0)}</TD>
                                        <TD align="right" mono bold>{fmtInt(data.totals.docs)}</TD>
                                        <TD align="right" mono bold>{fmt(data.totals.revenue)}</TD>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Doc</TH><TH>Voucher Date</TH>
                                    <TH>Reference</TH><TH>BU</TH><TH>Mode</TH>
                                    <TH>Customer / Party</TH><TH>Vehicle</TH>
                                    <TH>Part #</TH><TH>Item</TH>
                                    <TH align="right">Qty</TH><TH align="right">Rate</TH>
                                    <TH align="right">Disc</TH><TH align="right">Revenue</TH>
                                    <TH align="right">GST</TH>
                                    <TH align="right">Gross</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={15}>No finalized parts sales in this period.</Empty>}
                                {data.rows.map((r, i) => {
                                    const channelColour = r.Channel === 'SR' ? '#b91c1c'
                                                        : r.Channel === 'SS' ? '#0f766e'
                                                        : '#7c3aed';
                                    const isReturn = r.Channel === 'SR';
                                    return (
                                    <tr key={i} style={{ ...trBody, background: isReturn ? '#fef2f2' : undefined }}>
                                        <TD mono><strong style={{ color: channelColour }}>{r.Channel}</strong></TD>
                                        <TD>{r.DocDate}</TD>
                                        <TD mono>{r.Channel === 'JC' ? `JC-${r.RefNo}` : (r.RefNo || r.DocRef)}</TD>
                                        <TD mono title={r.BusinessUnitName}>{r.BusinessUnitCode}</TD>
                                        <TD><ModePill mode={r.Mode} /></TD>
                                        <TD>{r.Customer || '—'}</TD>
                                        <TD mono>{r.VehicleRegNo || '—'}</TD>
                                        <TD mono>{r.ItemCode}</TD>
                                        <TD>{r.ItemName}</TD>
                                        <TD align="right" mono>{fmt(r.Quantity)}</TD>
                                        <TD align="right" mono>{fmt(r.Rate)}</TD>
                                        <TD align="right" mono>{fmt(r.Discount)}</TD>
                                        <TD align="right" mono bold>{fmt(r.Revenue)}</TD>
                                        <TD align="right" mono color="#1d4ed8">{fmt(r.Tax)}</TD>
                                        <TD align="right" mono>{fmt(r.LineNet)}</TD>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Item Ledger — chronological stock ledger for one item (owner ask 2026-07-17)
// =====================================================================
function ItemPicker({ params, updateParam }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [selectedName, setSelectedName] = useState('');
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!params.itemId || selectedName) return;
        axios.get('/api/reports/parts/item-search', { params: { q: '' } })
            .then(r => {
                const p = (r.data || []).find(x => String(x.ItemId) === String(params.itemId));
                if (p) setSelectedName(`${p.PartNumber || p.ItemNumber} — ${p.ItemName}`);
            })
            .catch(() => {});
    }, [params.itemId, selectedName]);

    const doSearch = useCallback(async (v) => {
        setQuery(v);
        try {
            const r = await axios.get('/api/reports/parts/item-search', { params: { q: v } });
            setResults(r.data || []);
        } catch { setResults([]); }
    }, []);

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
            <Search size={14} color="#64748b" />
            <input
                type="search"
                placeholder={selectedName || 'Search item name / code / part number…'}
                value={query}
                onFocus={() => { setOpen(true); if (!results.length) doSearch(''); }}
                onBlur={() => setTimeout(() => setOpen(false), 200)}
                onChange={e => doSearch(e.target.value)}
                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', minWidth: 320 }}
            />
            {params.itemId && (
                <button type="button"
                    onClick={() => { updateParam('itemId', ''); setSelectedName(''); setQuery(''); }}
                    title="Clear"
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}>
                    Clear
                </button>
            )}
            {open && results.length > 0 && (
                <div style={{
                    position: 'absolute', top: '100%', left: 20, right: 0,
                    background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 20,
                    maxHeight: 300, overflowY: 'auto', marginTop: 4, minWidth: 360,
                }}>
                    {results.map(p => (
                        <div key={p.ItemId}
                            onMouseDown={() => {
                                updateParam('itemId', String(p.ItemId));
                                setSelectedName(`${p.PartNumber || p.ItemNumber} — ${p.ItemName}`);
                                setQuery('');
                                setOpen(false);
                            }}
                            style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                            <div style={{ fontWeight: 600 }}>{p.ItemName}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                Code {p.ItemNumber}{p.PartNumber && ` · Part# ${p.PartNumber}`}
                                {p.Warehouse && ` · ${p.Warehouse}`}
                                {p.CategoryName && ` · ${p.CategoryName}`}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function ItemLedger() {
    const excelExport = (data, params) => ({
        filename: `item-ledger-${(data.item?.PartNumber || data.item?.ItemNumber || 'item')}-${params.from || 'from'}_to_${params.to || 'to'}.csv`,
        headers: ['Date', 'Type', 'Ref #', 'Party', 'Qty In', 'Qty Out', 'Rate', 'Value', 'Balance', 'Remarks'],
        rows: [
            ['', 'Opening', '', '', 0, 0, 0, 0, Number(data.totals.openingQty || 0), ''],
            ...(data.rows || []).map(r => [
                r.Date, r.MoveType, r.SourceRef, r.SourceParty || '',
                Number(r.QtyIn), Number(r.QtyOut), Number(r.Rate), Number(r.LineValue),
                Number(r.Balance), r.Remarks || '',
            ]),
            ['', 'Closing', '', '', 0, 0, 0, 0, Number(data.totals.closingQty || 0), ''],
        ],
    });
    return (
        <ReportShell
            title="Item Ledger"
            subtitle="Chronological stock movements for one item — opening + every in / out + running balance + closing."
            icon={BookOpen}
            endpoint="parts/item-ledger"
            defaultParams={{ itemId: '', from: firstOfMonthISO(), to: todayISO() }}
            excelExport={excelExport}
            landscape={false}   /* owner ask 2026-09-10: ledgers print portrait */
            controls={({ params, updateParam }) => (
                <>
                    <ItemPicker params={params} updateParam={updateParam} />
                    <PeriodControls params={params} updateParam={updateParam} />
                </>
            )}
        >
            {(data) => {
                if (!data.item) {
                    return <div className="card" style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Pick an item to see its stock ledger.</div>;
                }
                return (
                    <>
                        <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>
                                    {data.from} → {data.to}
                                </div>
                                <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{data.item.ItemName}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    Code {data.item.ItemNumber}
                                    {data.item.PartNumber && ` · Part# ${data.item.PartNumber}`}
                                    {data.item.UOMName && ` · ${data.item.UOMName}`}
                                    {data.item.Warehouse && ` · ${data.item.Warehouse}`}
                                    {data.item.CategoryName && ` · ${data.item.CategoryName}`}
                                    · Weighted rate PKR {fmt(data.item.WeightedRate)}
                                </div>
                            </div>
                            <SummaryBar items={[
                                { label: 'Opening Qty',   value: fmt(data.totals.openingQty) },
                                { label: 'In',            value: fmt(data.totals.qtyIn) },
                                { label: 'Out',           value: fmt(data.totals.qtyOut) },
                                { label: 'Closing Qty',   value: fmt(data.totals.closingQty) },
                                { label: 'Closing Value', value: 'PKR ' + fmt(data.totals.closingValue), strong: true },
                            ]} />
                        </div>
                        <div className="card" style={{ overflowX: 'auto' }}>
                            <table style={tableStyle}>
                                <thead>
                                    <tr style={trHeader}>
                                        <TH>Date</TH>
                                        <TH>Type</TH>
                                        <TH>JC / Ref #</TH>
                                        <TH>Vehicle / Party</TH>
                                        <TH align="right">Qty In</TH>
                                        <TH align="right">Qty Out</TH>
                                        <TH align="right">Rate</TH>
                                        <TH align="right">Value</TH>
                                        <TH align="right">Balance</TH>
                                        <TH>Remarks</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style={{ background: '#f0f9ff', borderBottom: '1px solid #cbd5e1' }}>
                                        <TD colSpan={4} style={{ fontStyle: 'italic', fontWeight: 600 }}>Opening balance</TD>
                                        <TD align="right" color="#94a3b8">—</TD>
                                        <TD align="right" color="#94a3b8">—</TD>
                                        <TD align="right" color="#94a3b8">—</TD>
                                        <TD align="right" color="#94a3b8">—</TD>
                                        <TD align="right" mono bold>{fmt(data.totals.openingQty)}</TD>
                                        <TD></TD>
                                    </tr>
                                    {data.rows.length === 0 && (
                                        <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                            No movements in this period.
                                        </td></tr>
                                    )}
                                    {data.rows.map((r, i) => (
                                        <tr key={i} style={trBody}>
                                            <TD>{r.Date}</TD>
                                            <TD mono color={r.QtyIn > 0 ? '#15803d' : '#b91c1c'}>{r.MoveType}</TD>
                                            <TD mono>{r.SourceRef}</TD>
                                            <TD color="#64748b">{r.SourceParty}</TD>
                                            <TD align="right" mono color={r.QtyIn > 0 ? '#15803d' : undefined}>
                                                {r.QtyIn > 0 ? fmt(r.QtyIn) : '—'}
                                            </TD>
                                            <TD align="right" mono color={r.QtyOut > 0 ? '#b91c1c' : undefined}>
                                                {r.QtyOut > 0 ? fmt(r.QtyOut) : '—'}
                                            </TD>
                                            <TD align="right" mono>{fmt(r.Rate)}</TD>
                                            <TD align="right" mono>{fmt(r.LineValue)}</TD>
                                            <TD align="right" mono bold color={r.Balance < 0 ? '#b91c1c' : undefined}>
                                                {fmt(r.Balance)}
                                            </TD>
                                            <TD color="#64748b" style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                title={r.Remarks}>
                                                {r.Remarks}
                                            </TD>
                                        </tr>
                                    ))}
                                    <tr style={{ background: '#eef2ff', borderTop: '2px solid #cbd5e1' }}>
                                        <TD colSpan={4} style={{ fontStyle: 'italic', fontWeight: 700 }}>Closing balance</TD>
                                        <TD align="right" mono bold color="#15803d">{fmt(data.totals.qtyIn)}</TD>
                                        <TD align="right" mono bold color="#b91c1c">{fmt(data.totals.qtyOut)}</TD>
                                        <TD align="right" color="#94a3b8">—</TD>
                                        <TD align="right" color="#94a3b8">—</TD>
                                        <TD align="right" mono bold color={data.totals.closingQty < 0 ? '#b91c1c' : undefined}>
                                            {fmt(data.totals.closingQty)}
                                        </TD>
                                        <TD></TD>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </>
                );
            }}
        </ReportShell>
    );
}

// =====================================================================
// Shared bits
// =====================================================================
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' };
const trHeader   = { background: '#f8fafc', borderBottom: '2px solid #e2e8f0' };
const trBody     = { borderBottom: '1px solid #f1f5f9' };

function SummaryBar({ items }) {
    return (
        <div className="card report-summary-strip" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: 14 }}>
            {items.map(it => (
                <div key={it.label} className="rss-item">
                    <div className="rss-label" style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>{it.label}</div>
                    <div className="rss-value" style={{ fontWeight: it.strong ? 700 : 600, fontSize: it.strong ? '1.1rem' : '0.95rem',
                                  color: it.strong ? '#1e40af' : '#0f172a' }}>{it.value}</div>
                </div>
            ))}
        </div>
    );
}

function Empty({ cols, children }) {
    return (
        <tr>
            <td colSpan={cols} style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                {children}
            </td>
        </tr>
    );
}
