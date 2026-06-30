/**
 * Gate Pass / Delivery → ledger posting service (agency model, migration 045 +
 * per-customer COA leaves + premium-separated treatment).
 *
 *   A. Settle the customer's vehicle account against Master fulfilment
 *        Dr Customer A/c             (= masterPaid)
 *        Cr BOOKING_VARIANT_RECEIVABLE (masterPaid)
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
        .query(`SELECT b.BookingID, b.BookingNo, b.PartyID, b.NegotiatedPrice,
                       b.AmountPaidToDate, b.PremiumAmount,
                       v.WholesalePrice
                FROM dms_SalesBookings b
                LEFT JOIN dms_VehicleVariant v ON b.VehicleVariantID = v.VariantID
                WHERE b.BookingID=@id`);
    if (!r.recordset.length) throw new Error(`Booking ${bookingId} not found.`);
    return r.recordset[0];
}

// What did we actually pay Master against this booking? Sum of Dr legs on
// BOOKING_VARIANT_RECEIVABLE in posted vouchers tagged to this BookingID.
async function loadMasterPaid(bookingId, bvrGL, transaction) {
    const r = await new sql.Request(transaction)
        .input('gl', sql.Int, bvrGL)
        .input('bid', sql.Int, bookingId)
        .query(`SELECT
                  ISNULL(SUM(CASE WHEN d.Debit  > 0 THEN d.Debit  ELSE 0 END), 0) AS Dr,
                  ISNULL(SUM(CASE WHEN d.Credit > 0 THEN d.Credit ELSE 0 END), 0) AS Cr
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                WHERE v.Status='Posted' AND d.GLCAID=@gl AND d.BookingID=@bid`);
    const { Dr, Cr } = r.recordset[0] || { Dr: 0, Cr: 0 };
    return Number(Dr) - Number(Cr);
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

    // What we actually paid Master against this booking (sum of BVR Dr legs).
    const masterPaid = await loadMasterPaid(bookingId, acc.BOOKING_VARIANT_RECEIVABLE.GLCAID, transaction);

    // Use JV voucher type — agency model has no internal sales invoice
    const vt = await new sql.Request(transaction).query("SELECT Voucherid FROM GLVoucherType WHERE Title='JV'");
    if (!vt.recordset.length) throw new Error('JV voucher type missing');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqRes = await new sql.Request(transaction).query(
        `SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo`);
    const voucherNo = `JV-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

    const totalAmount = masterPaid + premium;
    const narration = `Delivery — settling booking ${b.BookingNo}`
        + (masterPaid > 0 ? ` (vehicle: PKR ${masterPaid.toLocaleString('en-PK')})` : '')
        + (premium > 0 ? `, premium PKR ${premium.toLocaleString('en-PK')} recognized` : '');

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

    // A. Vehicle settlement — Customer A/c against BVR (no premium here)
    if (masterPaid > 0) {
        await insertLine(customerLeaf.GLCAID, masterPaid, 0,
            `Vehicle delivery settled — ${b.BookingNo}`
            + (customerLeaf.isPartyLeaf ? '' : ' (Booking Advance fallback)'));
        await insertLine(acc.BOOKING_VARIANT_RECEIVABLE.GLCAID, 0, masterPaid,
            `Booking variant fulfilled by Master (${b.BookingNo})`);
    }

    // B. Premium recognition — strictly separate, never on the customer A/c
    if (premium > 0) {
        await insertLine(acc.PREMIUM_DEFERRED.GLCAID, premium, 0,
            `Premium deferred → recognized (${b.BookingNo})`);
        await insertLine(acc.PREMIUM_INCOME.GLCAID, 0, premium,
            `Premium income recognized at delivery (${b.BookingNo})`);
    }

    // Subsidiary ledger — track the vehicle-side Dr against the customer's running balance.
    if (masterPaid > 0) {
        await new sql.Request(transaction)
            .input('pid', sql.Int, b.PartyID)
            .input('bid', sql.Int, b.BookingID)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, customerLeaf.GLCAID)
            .input('dr',  sql.Decimal(18,2), masterPaid)
            .input('nar', sql.NVarChar(500), `Vehicle delivered — ${b.BookingNo}`)
            .query(`INSERT INTO dms_PartyLedger (PartyID, BookingID, VoucherID, GLCAID, Debit, Credit, Narration)
                    VALUES (@pid, @bid, @vid, @gl, @dr, 0, @nar)`);
    }

    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    // Stamp back
    await new sql.Request(transaction)
        .input('bid', sql.Int, bookingId)
        .input('vid', sql.Int, voucherId)
        .query(`UPDATE dms_SalesBookings SET DeliveryVoucherID=@vid WHERE BookingID=@bid`);

    return voucherId;
}

module.exports = { postDeliveryVoucher };
