/**
 * Gate Pass / Delivery → ledger posting service.
 *
 * Fires when an authorized user issues the gate pass for an allocated chassis.
 * This is the revenue-recognition event for the booking.
 *
 * Composite voucher (one event = one voucher per §14):
 *
 *   A. Revenue recognition
 *      Dr BOOKING_ADVANCE         (AmountPaidToDate cap'd at NegotiatedPrice)
 *      Dr BOOKING_RECEIVABLE      (remaining = NegotiatedPrice - AmountPaidToDate)
 *      Cr VEHICLE_SALES_REVENUE   (NegotiatedPrice)
 *
 *      If the negotiated price is < standard and SALES_DISCOUNT_GIVEN is
 *      mapped, an additional Dr line for the discount + Cr VEHICLE_SALES_REVENUE
 *      grosses up — but Phase 5 keeps revenue at NegotiatedPrice (Decision #19);
 *      discount is informational only. We skip the gross-up here.
 *
 *   B. COGS recognition
 *      Dr COGS_VEHICLES           (WholesalePrice)
 *      Cr VEHICLE_INVENTORY       (WholesalePrice)
 *
 *   C. Premium recognition (only if PremiumAmount > 0)
 *      Dr BOOKING_ADVANCE         (PremiumAmount)
 *      Cr PREMIUM_INCOME          (PremiumAmount)
 *
 * Subsidiary ledger writes one row that shifts BOOKING_ADVANCE → BOOKING_RECEIVABLE
 * on the customer's ledger so historical payments are visible against the
 * recognized booking line.
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');

async function resolveAccounts() {
    const need = ['BOOKING_ADVANCE', 'BOOKING_RECEIVABLE', 'VEHICLE_SALES_REVENUE',
                  'VEHICLE_INVENTORY', 'COGS_VEHICLES', 'PREMIUM_INCOME'];
    const out = {};
    for (const r of need) out[r] = { GLCAID: await resolveRole(r) };
    return out;
}

async function loadBooking(bookingId, transaction) {
    // WholesalePrice lives on the variant — pull it in via join here so the
    // booking row doesn't need a redundant copy.
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

/**
 * Posts the delivery/COGS/premium composite voucher.
 * Caller must be inside an open transaction.
 *
 * @returns {number} VoucherID
 */
async function postDeliveryVoucher(bookingId, userInfo, transaction) {
    const b = await loadBooking(bookingId, transaction);
    const negotiated = Number(b.NegotiatedPrice || 0);
    const wholesale  = Number(b.WholesalePrice || 0);
    const paid       = Number(b.AmountPaidToDate || 0);
    const premium    = Number(b.PremiumAmount || 0);

    if (negotiated <= 0) throw new Error(`Booking ${b.BookingNo} has no NegotiatedPrice — cannot recognize revenue.`);

    const acc = await resolveAccounts();

    // Use SI (Sales Invoice) voucher type
    const vt = await new sql.Request(transaction).query("SELECT Voucherid FROM GLVoucherType WHERE Title='SI'");
    if (!vt.recordset.length) throw new Error('SI voucher type missing');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqRes = await new sql.Request(transaction).query(
        `SELECT ISNULL(MAX(VoucherID),0) + 1 AS nextNo FROM data_FinanceVoucherInfo`);
    const voucherNo = `SI-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

    // Caps: advance leg is min(paid, negotiated) — anything above goes into premium
    // already, so advance cap == negotiated cap when there's overflow.
    const advanceApplied = Math.min(paid, negotiated);
    const receivableOpened = Math.max(0, negotiated - advanceApplied);

    // Total voucher amount = negotiated + premium (sum of credit sides)
    const totalAmount = negotiated + (premium > 0 ? premium : 0) + wholesale;

    const narration = `Delivery — revenue recognized for booking ${b.BookingNo} (negotiated PKR ${negotiated.toLocaleString('en-PK')})`;

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

    // A. Revenue
    if (advanceApplied > 0) {
        await insertLine(acc.BOOKING_ADVANCE.GLCAID, advanceApplied, 0,
            `Booking advance applied to revenue (${b.BookingNo})`);
    }
    if (receivableOpened > 0) {
        await insertLine(acc.BOOKING_RECEIVABLE.GLCAID, receivableOpened, 0,
            `Receivable opened for unpaid portion (${b.BookingNo})`);
    }
    await insertLine(acc.VEHICLE_SALES_REVENUE.GLCAID, 0, negotiated,
        `Vehicle sale recognized (${b.BookingNo})`);

    // B. COGS
    if (wholesale > 0) {
        await insertLine(acc.COGS_VEHICLES.GLCAID, wholesale, 0,
            `COGS for chassis released (${b.BookingNo})`);
        await insertLine(acc.VEHICLE_INVENTORY.GLCAID, 0, wholesale,
            `Vehicle inventory released (${b.BookingNo})`);
    }

    // C. Premium
    if (premium > 0) {
        await insertLine(acc.BOOKING_ADVANCE.GLCAID, premium, 0,
            `Booking advance — premium portion (${b.BookingNo})`);
        await insertLine(acc.PREMIUM_INCOME.GLCAID, 0, premium,
            `Premium income recognized (${b.BookingNo})`);
    }

    // Subsidiary ledger — the shift from advance to receivable for the customer.
    // Net: customer's ledger sees a Debit for any newly-opened receivable.
    if (receivableOpened > 0) {
        await new sql.Request(transaction)
            .input('pid', sql.Int, b.PartyID)
            .input('bid', sql.Int, b.BookingID)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, acc.BOOKING_RECEIVABLE.GLCAID)
            .input('dr',  sql.Decimal(18,2), receivableOpened)
            .input('nar', sql.NVarChar(500), `Receivable opened on delivery — ${b.BookingNo}`)
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
