import React from 'react';
import { CreditCard, FileText, Landmark, Percent } from 'lucide-react';
import ReportShell, { TH, TD, fmt, todayISO, AsOfControl } from './ReportShell';

// ---- POS Settlement Pending ----
export function POSPending() {
    return (
        <ReportShell
            title="POS Settlement Pending"
            subtitle="POS Clearing receipts not yet settled to a bank."
            icon={CreditCard}
            endpoint="pos-pending"
            defaultParams={{ asOf: todayISO() }}
            controls={AsOfControl}
        >
            {(data) => (
                <>
                    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>As of {data.asOf}</div>
                            <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>Pending: PKR {fmt(data.total)}</div>
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{data.rows.length} pending receipts</div>
                    </div>
                    <div className="card">
                        {data.rows.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>All POS receipts have been settled.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Date</TH><TH>Voucher</TH><TH>Party / JC</TH><TH>Narration</TH><TH align="right">Amount</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((r, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD>{new Date(r.VoucherDate).toLocaleDateString()}</TD>
                                            <TD mono color="#475569">{r.VoucherNo}</TD>
                                            <TD>{r.PartyName}{r.JobCardNo ? ` · JC ${r.JobCardNo}` : ''}</TD>
                                            <TD color="#64748b">{r.Narration}</TD>
                                            <TD align="right" bold>{fmt(r.Debit)}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={4} style={{ padding: 12, fontWeight: 700 }}>Total Pending</td>
                                        <TD align="right" bold>{fmt(data.total)}</TD>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// ---- Cheques on Hand ----
export function ChequesOnHand() {
    return (
        <ReportShell
            title="Cheques on Hand"
            subtitle="Cheques received but not yet cleared to bank."
            icon={FileText}
            endpoint="cheques-on-hand"
            defaultParams={{ asOf: todayISO() }}
            controls={AsOfControl}
        >
            {(data) => (
                <>
                    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>As of {data.asOf}</div>
                            <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>On Hand: PKR {fmt(data.total)}</div>
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{data.rows.length} cheques</div>
                    </div>
                    <div className="card">
                        {data.rows.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No cheques pending clearance.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Received</TH><TH>Voucher</TH><TH>From Party</TH><TH>Narration</TH><TH align="right">Amount</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((r, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD>{new Date(r.VoucherDate).toLocaleDateString()}</TD>
                                            <TD mono color="#475569">{r.VoucherNo}</TD>
                                            <TD>{r.PartyName || '—'}</TD>
                                            <TD color="#64748b">{r.Narration}</TD>
                                            <TD align="right" bold>{fmt(r.Debit)}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={4} style={{ padding: 12, fontWeight: 700 }}>Total</td>
                                        <TD align="right" bold>{fmt(data.total)}</TD>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// ---- Bank Balance Summary ----
export function BankBalances() {
    return (
        <ReportShell
            title="Bank Balance Summary"
            subtitle="Balance per configured bank account as of date."
            icon={Landmark}
            endpoint="bank-balances"
            defaultParams={{ asOf: todayISO() }}
            controls={AsOfControl}
        >
            {(data) => (
                <>
                    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>As of {data.asOf}</div>
                            <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>Total Bank Cash: PKR {fmt(data.total)}</div>
                        </div>
                    </div>
                    <div className="card">
                        {data.rows.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No banks configured. Mark a leaf account as bank from Chart of Accounts.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Code</TH><TH>Bank Account</TH><TH>Status</TH>
                                        <TH align="right">Total In</TH><TH align="right">Total Out</TH><TH align="right">Balance</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(r => (
                                        <tr key={r.GLCAID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD mono color="#64748b">{r.GLCode}</TD>
                                            <TD>{r.GLTitle}</TD>
                                            <TD color={r.IsActive ? '#15803d' : '#94a3b8'}>{r.IsActive ? 'Active' : 'Inactive'}</TD>
                                            <TD align="right" color="#15803d">{fmt(r.TotalIn)}</TD>
                                            <TD align="right" color="#b91c1c">{fmt(r.TotalOut)}</TD>
                                            <TD align="right" bold>{fmt(r.Balance)}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={5} style={{ padding: 12, fontWeight: 700 }}>Total</td>
                                        <TD align="right" bold>{fmt(data.total)}</TD>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// ---- Tax Rate History ----
export function TaxRateHistory() {
    return (
        <ReportShell
            title="Tax Rate Change History"
            subtitle="Full record of tax rate changes — who changed what, when."
            icon={Percent}
            endpoint="tax-rate-history"
            defaultParams={{}}
            controls={() => null}
        >
            {(data) => (
                <div className="card">
                    {data.rows.length === 0 ? (
                        <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No tax rate records.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <TH>Tax Type</TH><TH align="right">Rate %</TH>
                                    <TH>Effective From</TH><TH>Effective To</TH>
                                    <TH>Changed By</TH><TH>Changed At</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.map(r => (
                                    <tr key={r.TaxRateID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <TD bold>{r.TaxType}</TD>
                                        <TD align="right" bold>{Number(r.Rate).toFixed(2)}%</TD>
                                        <TD>{new Date(r.EffectiveFrom).toLocaleDateString()}</TD>
                                        <TD color={r.EffectiveTo ? '#dc2626' : '#15803d'}>
                                            {r.EffectiveTo ? new Date(r.EffectiveTo).toLocaleDateString() : 'Active'}
                                        </TD>
                                        <TD>{r.ChangedByName}</TD>
                                        <TD>{new Date(r.ChangedAt).toLocaleString()}</TD>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </ReportShell>
    );
}
