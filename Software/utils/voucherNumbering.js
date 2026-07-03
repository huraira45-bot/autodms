/**
 * Per-voucher-type numbering. Owner ask 2026-07-02: each voucher type
 * should draw from its own sequence so CPV / BPV / CRV etc. stay strictly
 * sequential — instead of the previous shared `seq_FinanceVoucherNo` that
 * made numbers "jump" whenever any other type posted in between.
 *
 * Sequences seeded by migration 062. Each type has one sequence; reversals
 * ({TYPE}-REV-NNNN) and opening-balance vouchers ({TYPE}-OB-YYYY-MM-NNNN)
 * draw from the same origin-type sequence so the type's number space stays
 * strictly monotonic.
 */
const { sql } = require('../config/db');

// Type codes match GLVoucherType.Title exactly. Note the purchase types are
// 'PV' (Purchase Voucher — posted by GRN finalize) and 'PRV' (Purchase Return
// Voucher — posted by GRTN finalize). The GRN- / GRTN- prefixes used
// elsewhere in the app are source-document numbers, not finance vouchers.
const SEQ_BY_TYPE = {
    SI:   'seq_Voucher_SI',
    SS:   'seq_Voucher_SS',
    SSR:  'seq_Voucher_SSR',
    PV:   'seq_Voucher_PV',
    PRV:  'seq_Voucher_PRV',
    CRV:  'seq_Voucher_CRV',
    BRV:  'seq_Voucher_BRV',
    CPV:  'seq_Voucher_CPV',
    BPV:  'seq_Voucher_BPV',
    JV:   'seq_Voucher_JV',
};

/**
 * Draws the next value from the type-specific sequence. Pass a transaction
 * or pool; both are supported. Falls back to seq_FinanceVoucherNo if the
 * type isn't recognised (defensive — shouldn't happen once migration 062
 * is applied everywhere).
 */
async function nextVoucherSeq(txOrPool, voucherType) {
    const seqName = SEQ_BY_TYPE[voucherType] || 'seq_FinanceVoucherNo';
    const r = await new sql.Request(txOrPool)
        .query(`SELECT NEXT VALUE FOR dbo.${seqName} AS n`);
    return Number(r.recordset[0].n);
}

/**
 * Builds a formatted voucher number. Padding is 4 digits — increase if any
 * type is expected to cross 9999 in a single fiscal year.
 *   formatVoucherNo('CPV', 42)                          → 'CPV-0042'
 *   formatVoucherNo('SI', 12, { reversal: true })       → 'SI-REV-0012'
 *   formatVoucherNo('JV', 7,  { opening: '2026-06' })   → 'JV-OB-2026-06-0007'
 */
function formatVoucherNo(voucherType, n, opts = {}) {
    const pad = String(n).padStart(4, '0');
    if (opts.reversal)   return `${voucherType}-REV-${pad}`;
    if (opts.opening)    return `${voucherType}-OB-${opts.opening}-${pad}`;
    return `${voucherType}-${pad}`;
}

/**
 * Convenience — draws next value AND formats it. Most postings want this.
 */
async function nextVoucherNo(txOrPool, voucherType, opts = {}) {
    const n = await nextVoucherSeq(txOrPool, voucherType);
    return formatVoucherNo(voucherType, n, opts);
}

module.exports = { nextVoucherSeq, formatVoucherNo, nextVoucherNo, SEQ_BY_TYPE };
