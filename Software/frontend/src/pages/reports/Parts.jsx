import React from 'react';
import { Package, ArrowDownUp, AlertTriangle, ShoppingCart, FileInput } from 'lucide-react';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO, PeriodControls } from './ReportShell';

const firstOfMonthISO = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

// =====================================================================
// Stock Movement Register
// =====================================================================
export function StockMovement() {
    return (
        <ReportShell
            title="Stock Movement Register"
            subtitle="Per-item inflow (GRN) and outflow (issues + sales) in the period."
            icon={ArrowDownUp}
            endpoint="parts/stock-movement"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Items moved',  value: fmtInt(data.totals.items) },
                        { label: 'Qty In',       value: fmt(data.totals.qtyIn) },
                        { label: 'Qty Out',      value: fmt(data.totals.qtyOut) },
                        { label: 'Value In',     value: 'PKR ' + fmt(data.totals.valIn) },
                        { label: 'Value Out',    value: 'PKR ' + fmt(data.totals.valOut), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Item Code</TH><TH>Item Name</TH><TH>Part No</TH>
                                    <TH>Category</TH><TH>Warehouse</TH>
                                    <TH align="right">Qty In</TH><TH align="right">Qty Out</TH>
                                    <TH align="right">Net</TH><TH align="right">Rate</TH>
                                    <TH align="right">Value In</TH><TH align="right">Value Out</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={11}>No movement in this period.</Empty>}
                                {data.rows.map(r => (
                                    <tr key={r.ItemId} style={trBody}>
                                        <TD mono>{r.ItemCode}</TD>
                                        <TD>{r.ItemName}</TD>
                                        <TD mono color="#64748b">{r.PartNumber}</TD>
                                        <TD>{r.Category}</TD>
                                        <TD>{r.Warehouse}</TD>
                                        <TD align="right" mono>{fmt(r.QtyIn)}</TD>
                                        <TD align="right" mono>{fmt(r.QtyOut)}</TD>
                                        <TD align="right" mono color={r.NetChange >= 0 ? '#15803d' : '#b91c1c'} bold>
                                            {fmt(r.NetChange)}
                                        </TD>
                                        <TD align="right" mono>{fmt(r.Rate)}</TD>
                                        <TD align="right" mono>{fmt(r.ValIn)}</TD>
                                        <TD align="right" mono>{fmt(r.ValOut)}</TD>
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
    return (
        <ReportShell
            title="Reorder Alert"
            subtitle="Items at or below their reorder level — sorted by suggested order value."
            icon={AlertTriangle}
            endpoint="parts/reorder-alert"
            defaultParams={{}}
            controls={() => null}
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
    return (
        <ReportShell
            title="Parts Sales Register"
            subtitle="Line-by-line store-sale invoices in the period."
            icon={ShoppingCart}
            endpoint="parts/sales-register"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO() }}
            controls={PeriodControls}
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
    return (
        <ReportShell
            title="Parts Purchase Summary"
            subtitle="Line-by-line GRN entries (parts received) in the period."
            icon={FileInput}
            endpoint="parts/purchase-summary"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO() }}
            controls={PeriodControls}
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
// Shared bits
// =====================================================================
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' };
const trHeader   = { background: '#f8fafc', borderBottom: '2px solid #e2e8f0' };
const trBody     = { borderBottom: '1px solid #f1f5f9' };

function SummaryBar({ items }) {
    return (
        <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: 14 }}>
            {items.map(it => (
                <div key={it.label}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>{it.label}</div>
                    <div style={{ fontWeight: it.strong ? 700 : 600, fontSize: it.strong ? '1.1rem' : '0.95rem',
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
