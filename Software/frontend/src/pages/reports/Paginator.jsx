import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

// Client-side pagination hook + control.
// Owner ask 2026-07-18: reports were rendering entire recordsets at once, so
// pages of 5,000+ rows crawled and printed as a mile of table. This gives us a
// consistent "showing N of M" affordance without any backend change.
//
// Usage:
//   const { page, pageSize, setPage, setPageSize, pagedRows, totalRows } =
//       usePagination(rows, 50);
//   ...
//   <table>… {pagedRows.map(...)} …</table>
//   <Paginator page={page} pageSize={pageSize} totalRows={totalRows}
//              onPageChange={setPage} onPageSizeChange={setPageSize} />
//
// The hook resets to page 1 whenever the underlying rows reference changes
// (new filter, new period, etc.) so a stale page number doesn't leave the
// user staring at an empty slice.
const DEFAULT_SIZES = [25, 50, 100, 250, 500];

// Print-all support (owner report 2026-08-21, General Ledger Detail): every
// page built on this hook only ever rendered the current 50-row slice, so
// window.print() only ever captured whatever page happened to be open.
// printAll() switches displayRows to the FULL row set for one print pass,
// using a double-RAF so the browser paints the full table before the print
// dialog fires — same mechanism ReportShell.jsx uses for its own pagination.
export function usePagination(rows, initialSize = 50) {
    const [page, setPage]         = useState(1);
    const [pageSize, setPageSize] = useState(initialSize);
    const [printingAll, setPrintingAll] = useState(false);
    useEffect(() => { setPage(1); }, [rows]);
    const totalRows = Array.isArray(rows) ? rows.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const pagedRows = useMemo(() => {
        if (!Array.isArray(rows)) return [];
        const start = (safePage - 1) * pageSize;
        return rows.slice(start, start + pageSize);
    }, [rows, safePage, pageSize]);

    const printAll = useCallback(() => {
        if (totalRows > pageSize) setPrintingAll(true);
        else window.print();
    }, [totalRows, pageSize]);

    useEffect(() => {
        if (!printingAll) return;
        let raf2;
        const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => window.print()); });
        return () => { cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2); };
    }, [printingAll]);
    useEffect(() => {
        const onAfterPrint = () => setPrintingAll(false);
        window.addEventListener('afterprint', onAfterPrint);
        return () => window.removeEventListener('afterprint', onAfterPrint);
    }, []);

    const displayRows = printingAll ? (Array.isArray(rows) ? rows : []) : pagedRows;

    return {
        page: safePage,
        pageSize,
        setPage,
        setPageSize: (n) => { setPageSize(n); setPage(1); },
        pagedRows,
        totalRows,
        totalPages,
        printingAll,
        printAll,
        displayRows,
    };
}

export function Paginator({
    page, pageSize, totalRows, totalPages,
    onPageChange, onPageSizeChange, sizes = DEFAULT_SIZES,
}) {
    if (!totalRows) return null;
    const from = (page - 1) * pageSize + 1;
    const to   = Math.min(page * pageSize, totalRows);
    const btn  = { padding: '4px 8px', border: '1px solid #cbd5e1', background: 'white',
                    borderRadius: 4, cursor: 'pointer', display: 'inline-flex',
                    alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#334155' };
    const btnDisabled = { ...btn, opacity: 0.4, cursor: 'not-allowed' };
    return (
        <div className="no-print" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
            fontSize: '0.8rem', color: '#475569', flexWrap: 'wrap', gap: 8,
        }}>
            <div>
                Showing <strong>{from.toLocaleString()}–{to.toLocaleString()}</strong> of{' '}
                <strong>{totalRows.toLocaleString()}</strong> rows
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Rows per page:
                    <select value={pageSize}
                            onChange={e => onPageSizeChange(parseInt(e.target.value))}
                            style={{ padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.8rem' }}>
                        {sizes.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
                <button style={page <= 1 ? btnDisabled : btn}
                        onClick={() => onPageChange(1)} disabled={page <= 1} title="First page">
                    <ChevronsLeft size={12} />
                </button>
                <button style={page <= 1 ? btnDisabled : btn}
                        onClick={() => onPageChange(page - 1)} disabled={page <= 1} title="Previous">
                    <ChevronLeft size={12} />
                </button>
                <span style={{ padding: '4px 8px' }}>
                    Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                </span>
                <button style={page >= totalPages ? btnDisabled : btn}
                        onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} title="Next">
                    <ChevronRight size={12} />
                </button>
                <button style={page >= totalPages ? btnDisabled : btn}
                        onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} title="Last page">
                    <ChevronsRight size={12} />
                </button>
            </div>
        </div>
    );
}
