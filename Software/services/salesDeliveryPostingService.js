/**
 * Gate Pass / Delivery → ledger posting service (agency model, migration 045 +
 * per-customer COA leaves + premium-separated treatment).
 *
 *   A. Settle the customer's vehicle account against Master fulfilment
 *        Dr Customer A/c             (= masterPaid)
 *        Cr original Master booking account(s) (masterPaid)
 *
 *   B. Recognize premium (kept strictly separate from the vehicle account)
 *        Dr PREMIUM_DEFERRED          (premium)
 *        Cr PREMIUM_INCOME            (premium)
 *
 * Customer A/c is the customer's own COA leaf (gen_PartiesInfo.PartyGLID).
 * Fallback to BOOKING_ADVANCE when accounts hasn't created the leaf yet.
 *
 * If the customer's vehicle payments don't cover masterPaid, the Customer A/c
 * ends up Dr-balanced (= receivable owed back to dealer). Sales Recovery picks
 * it up. Premium is recognized at the full booking amount regardless.
 *
 * Wholesale revenue, COGS, and vehicle inventory are NOT touched — Master's books.
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');
const { nextVoucherNo } = require('../utils/voucherNumbering');
const N = require('./salesNarration');
const { loadMasterPosition } = require('./masterPaymentPositionService');
const { masterAmountDue } = require('./salesMasterAmount');

async function resolveAccounts() {
    const need = ['BOOKING_ADVANCE', 'BOOKING_VARIANT_RECEIVABLE',
                  'PREMIUM_DEFERRED', 'PREMIUM_INCOME'];
    const out = {};
    for (const r of need) out[r] = { GLCAID: await resolveRole(r) };
    return out;
}

async function resolveCustomerGL(partyId, fallbackGL, transaction) {
    if (!partyId) return { GLCAID: fallbackGL, isPartyLeaf: false };
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, partyId)
        .query(`SELECT PartyGLID FROM gen_PartiesInfo WHERE PartyID=@id`);
    const gl = r.recordset[0]?.PartyGLID;
    return gl
        ? { GLCAID: gl, isPartyLeaf: true }
        : { GLCAID: fallbackGL, isPartyLeaf: false };
}

async function loadBooking(bookingId, transaction) {
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, bookingId)
        .query(`SELECT b.BookingID, b.BookingNo, b.PartyID, b.IsHistorical, b.HistoricalMasterApprovedAmount, b.NegotiatedPrice,
                       b.AmountPaidToDate, b.PremiumAmount, b.MasterPriceBeforeDiscount, b.MasterAgreedAmount,
                       v.WholesalePrice
                FROM dms_SalesBookings b WITH (UPDLOCK,HOLDLOCK)
                LEFT JOIN dms_VehicleVariant v ON b.VehicleVariantID = v.VariantID
                WHERE b.BookingID=@id`);
    if (!r.recordset.length) throw new Error(`Booking ${bookingId} not found.`);
    return r.recordset[0];
}

/**
 * Posts the delivery voucher (agency model). Caller must be inside an open transaction.
 * @returns {number} VoucherID
 */
async function postDeliveryVoucher(bookingId, userInfo, transaction) {
    const b = await loadBooking(bookingId, transaction);
    const acc = await resolveAccounts();
    const customerLeaf = await resolveCustomerGL(b.PartyID, acc.BOOKING_ADVANCE.GLCAID, transaction);

    const negotiated = Number(b.NegotiatedPrice || 0);
    const premium    = Number(b.PremiumAmount || 0);
    if (negotiated <= 0) throw new Error(`Booking ${b.BookingNo} has no NegotiatedPrice.`);

    // Settle the same current/legacy accounts that establish gate-pass readiness.
    const masterPosition = await loadMasterPosition(transaction, bookingId, acc.BOOKING_VARIANT_RECEIVABLE.GLCAID, true);
    const masterPaid = masterPosition.reduce((sum, account) => sum + account.Net, 0);
    if (masterPosition.some(account => account.Net < -0.01)) {
        throw new Error('A Master booking account is already over-settled. Reconcile its balance before delivery.');
    }

    // Backstop for the gate in issueGatePass (owner decision 2026-09-11).
    // This voucher settles the customer against what reached Master, so if
    // Master is short the difference silently strands as a credit on the
    // customer's account — which is exactly what happened on BK-2026-0002.
    // Refuse rather than post a settlement that cannot reconcile. The caller
    // is inside a transaction, so this rolls the delivery back whole.
    const definedRate = masterAmountDue(b);
    // Explicit historical confirmation is a business record, not a GL debit.
    // When it covers the missing remittance, issue the historical gate pass
    // without inventing an unmatched delivery journal. Optional matching stays intact.
    if (b.IsHistorical && Number(b.HistoricalMasterApprovedAmount||0)>=definedRate-0.01
        && definedRate-masterPaid>0.01) return null;
    if (definedRate - masterPaid > 0.01) {
        throw new Error(
            `Cannot settle delivery for ${b.BookingNo}: PKR ${(definedRate - masterPaid).toLocaleString('en-PK')} `
            + `of the defined rate (PKR ${definedRate.toLocaleString('en-PK')}) has not been remitted to Master. `
            + `Pay Master the balance first.`);
    }

    // Use JV voucher type — agency model has no internal sales invoice
    const vt = await new sql.Request(transaction).query("SELECT Voucherid FROM GLVoucherType WHERE Title='JV'");
    if (!vt.recordset.length) throw new Error('JV voucher type missing');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const voucherNo = await nextVoucherNo(transaction, 'JV');

    const totalAmount = masterPaid + premium;

    // Cross narration (owner ask 2026-09-18).
    const ctx = await N.loadNarrationContext(transaction, b.BookingID);
    const customer = N.customerText(ctx);
    const vehicle = N.vehicleText(ctx);
    const forVeh = N.forVehicleAndBooking(ctx);
    const customerTitle = await N.accountTitle(transaction, customerLeaf.GLCAID);
    const masterTitles = new Map();
    for (const account of masterPosition.filter(account => account.Net > 0)) {
        masterTitles.set(account.GLCAID, await N.accountTitle(transaction, account.GLCAID));
    }
    const bvrTitle = [...masterTitles.values()].join(' / ');
    const premDefTitle = await N.accountTitle(transaction, acc.PREMIUM_DEFERRED.GLCAID);
    const premIncTitle = await N.accountTitle(transaction, acc.PREMIUM_INCOME.GLCAID);

    const narration = N.line([
        `Delivery of ${vehicle || 'the booked vehicle'} to ${customer},`,
        b.BookingNo ? `booking ${b.BookingNo}.` : '',
        masterPaid > 0 ? `Vehicle PKR ${masterPaid.toLocaleString('en-PK')}.` : '',
        premium > 0 ? `Premium PKR ${premium.toLocaleString('en-PK')} recognized.` : '',
    ]);

    const hdrRes = await new sql.Request(transaction)
        .input('vd',   sql.DateTime,     new Date())
        .input('vno',  sql.NVarChar(50), voucherNo)
        .input('vtId', sql.Int,          voucherTypeId)
        .input('rem',  sql.NVarChar(sql.MAX), narration)
        .input('tot',  sql.Decimal(18,2), totalAmount)
        .input('src',  sql.NVarChar(20), 'SALES_DELIVERY')
        .input('srcId',sql.Int,          b.BookingID)
        .input('cby',  sql.Int,          userInfo?.userId || null)
        .input('cbyN', sql.NVarChar(100),userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @rem, @tot,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const voucherId = hdrRes.recordset[0].VoucherID;

    const insertLine = async (glcaid, dr, cr, lineNarration) => {
        if ((!dr || dr <= 0) && (!cr || cr <= 0)) return;
        await new sql.Request(transaction)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, glcaid)
            .input('nar', sql.NVarChar(sql.MAX), lineNarration)
            .input('dr',  sql.Decimal(18,2), dr || 0)
            .input('cr',  sql.Decimal(18,2), cr || 0)
            .input('pid', sql.Int, b.PartyID || null)
            .input('bid', sql.Int, b.BookingID)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, BookingID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @pid, @bid)`);
    };

    // A. Vehicle settlement against each original Master account (no premium).
    if (masterPaid > 0) {
        await insertLine(customerLeaf.GLCAID, masterPaid, 0, N.line([
            `${customer} charged on delivery of ${vehicle || 'the booked vehicle'},`,
            b.BookingNo ? `booking ${b.BookingNo}.` : '',
            customerLeaf.isPartyLeaf ? '' : '(posted to Booking Advance — no party account mapped)',
        ], bvrTitle));
        for (const account of masterPosition.filter(account => account.Net > 0)) {
            await insertLine(account.GLCAID, 0, account.Net, N.line([
                `Master Motors delivered ${vehicle || 'the booked vehicle'} to ${customer},`,
                b.BookingNo ? `booking ${b.BookingNo}` : '',
                '- Master booking account settled on delivery',
            ], customerTitle));
        }
    }
    // B. Premium recognition — strictly separate, never on the customer A/c
    if (premium > 0) {
        await insertLine(acc.PREMIUM_DEFERRED.GLCAID, premium, 0, N.line([
            `Premium held on ${customer}'s booking released on delivery of ${vehicle || 'the booked vehicle'},`,
            b.BookingNo ? `booking ${b.BookingNo}.` : '',
        ], premIncTitle));
        await insertLine(acc.PREMIUM_INCOME.GLCAID, 0, premium, N.line([
            `Premium earned on delivery of ${vehicle || 'the booked vehicle'} to ${customer},`,
            b.BookingNo ? `booking ${b.BookingNo}.` : '',
        ], premDefTitle));
    }

    // Subsidiary ledger — track the vehicle-side Dr against the customer's running balance.
    if (masterPaid > 0) {
        await new sql.Request(transaction)
            .input('pid', sql.Int, b.PartyID)
            .input('bid', sql.Int, b.BookingID)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, customerLeaf.GLCAID)
            .input('dr',  sql.Decimal(18,2), masterPaid)
            .input('nar', sql.NVarChar(500), N.line([
                `${vehicle || 'Vehicle'} delivered to ${customer},`,
                b.BookingNo ? `booking ${b.BookingNo}.` : '',
            ]).slice(0, 500))
            .query(`INSERT INTO dms_PartyLedger (PartyID, BookingID, VoucherID, GLCAID, Debit, Credit, Narration)
                    VALUES (@pid, @bid, @vid, @gl, @dr, 0, @nar)`);
    }

    // Deliberately left as Draft (owner ask 2026-08-07) — every sales-module
    // voucher sits in Draft for manual review + Finalize via the normal
    // Voucher screen before it hits the GL. For Gate Pass specifically, the
    // vehicle does not release and the booking does not close until this
    // voucher is finalized — see salesVoucherPostHookService.js.

    // Stamp back
    await new sql.Request(transaction)
        .input('bid', sql.Int, bookingId)
        .input('vid', sql.Int, voucherId)
        .query(`UPDATE dms_SalesBookings SET DeliveryVoucherID=@vid WHERE BookingID=@bid`);

    return voucherId;
}

module.exports = { postDeliveryVoucher };
