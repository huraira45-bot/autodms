const { sql } = require('../config/db');
const { GENERATED_SALES_SOURCES } = require('./historicalMasterAllocationService');

const fail = (message, statusCode = 409) => {
    throw Object.assign(new Error(message), { statusCode });
};

// Shared by the picker and locked link validation; all expressions use v/@gl.
// A voucher's header total includes other accounts, so it is not this account's cap.
const CUSTOMER_AMOUNT_SQL = `(SELECT ISNULL(ABS(SUM(ISNULL(d.Debit, 0) - ISNULL(d.Credit, 0))), 0)
    FROM data_FinanceVoucherDetail d
    WHERE d.VoucherID = v.VoucherID AND d.GLCAID = @gl)`;
const LINKED_AMOUNT_SQL = `(SELECT ISNULL(SUM(ISNULL(p.Amount, 0) + ISNULL(p.PremiumPortion, 0)), 0)
    FROM dms_SalesPayments p
    WHERE p.VoucherID = v.VoucherID AND p.IsLinkedVoucher = 1 AND p.Status = 'Posted'
      AND p.LinkedVoucherGLCAID = @gl)`;
const NONLINKED_PAYMENT_SQL = `(SELECT TOP 1 ownedPayment.PaymentID
    FROM dms_SalesPayments ownedPayment
    WHERE ownedPayment.VoucherID = v.VoucherID AND ISNULL(ownedPayment.IsLinkedVoucher, 0) = 0)`;
const LOCK_VOUCHER_SQL = `SELECT VoucherID, VoucherNo, Status, ReversesVoucherID, SourceDocType
    FROM data_FinanceVoucherInfo WITH (UPDLOCK, HOLDLOCK)
    WHERE VoucherID = @vid`;
const LINKABLE_VOUCHER_SQL = `SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, v.TotalAmount,
    v.Status, v.ReversesVoucherID, v.SourceDocType,
    ${CUSTOMER_AMOUNT_SQL} AS CustomerAmount,
    ${LINKED_AMOUNT_SQL} AS LinkedAmount,
    ${NONLINKED_PAYMENT_SQL} AS UsedByPaymentID
    FROM data_FinanceVoucherInfo v
    WHERE v.VoucherID = @vid`;

function cents(value, statusCode = 409) {
    const amount = Number(value);
    const result = Math.round(amount * 100);
    if (!Number.isFinite(amount) || !Number.isSafeInteger(result)) {
        fail('The payment amount must be a finite amount that can be represented in cents.', statusCode);
    }
    return result;
}
const money = value => Number(value).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Validate inside the transaction that will insert/update the historical link.
 * Lock the common voucher header before any capacity read. Keeping this lock
 * separate prevents SQL query-plan ordering from reading stale allocations.
 * Account snapshots avoid reading other bookings while this booking is locked.
 * This helper never writes to the ledger or booking.
 */
async function assertVoucherLinkable(tx, booking, voucherId, total) {
    const requested = cents(total, 400);
    if (requested <= 0) fail('The payment amount must be greater than zero.', 400);
    if (!Number.isSafeInteger(voucherId) || voucherId <= 0) fail('A valid voucher is required.', 400);
    if (!Number.isSafeInteger(booking.PartyGLID) || booking.PartyGLID <= 0) {
        fail(`${booking.PartyName || 'This customer'} has no mapped ledger account. Map the customer's account under Credit Parties first.`);
    }
    const locked = await new sql.Request(tx).input('vid', sql.Int, voucherId).query(LOCK_VOUCHER_SQL);
    const header = locked.recordset[0];
    if (!header) fail('That voucher does not exist.', 404);
    if (header.Status !== 'Posted') {
        fail(`${header.VoucherNo} is ${header.Status}. Only a posted ledger voucher can be linked.`);
    }
    if (header.ReversesVoucherID) fail(`${header.VoucherNo} is a reversal voucher and cannot back a historical payment.`);
    if (GENERATED_SALES_SOURCES.includes(header.SourceDocType)) {
        fail(`${header.VoucherNo} belongs to a normal sales payment and cannot also back a historical payment.`);
    }
    const result = await new sql.Request(tx)
        .input('vid', sql.Int, voucherId)
        .input('gl', sql.Int, booking.PartyGLID)
        .query(LINKABLE_VOUCHER_SQL);
    const voucher = result.recordset[0];
    if (voucher.UsedByPaymentID) {
        fail(`${voucher.VoucherNo} belongs to a normal sales payment and cannot also back a historical payment.`);
    }
    const customerCents = cents(voucher.CustomerAmount);
    const linkedCents = cents(voucher.LinkedAmount);
    if (customerCents <= 0) {
        fail(`${voucher.VoucherNo} has no nonzero net amount on ${booking.PartyName || 'the customer'}'s account.`);
    }
    const availableCents = Math.max(0, customerCents - linkedCents);
    if (requested > availableCents) {
        fail(`${voucher.VoucherNo} has PKR ${money(availableCents / 100)} remaining on ${booking.PartyName || 'the customer'}'s account, but this payment is PKR ${money(requested / 100)}.`);
    }
    return {
        ...voucher,
        CustomerAmount: customerCents / 100,
        LinkedAmount: linkedCents / 100,
        AvailableAmount: availableCents / 100,
    };
}

module.exports = {
    assertVoucherLinkable, CUSTOMER_AMOUNT_SQL, LINKED_AMOUNT_SQL,
    NONLINKED_PAYMENT_SQL, LOCK_VOUCHER_SQL, LINKABLE_VOUCHER_SQL,
};
