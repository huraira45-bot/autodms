/** Local SQL verification: all fixture, booking and audit changes roll back. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('assert/strict');
const { sql, getPool } = require('../config/db');
const { applyBookingDiscount } = require('../services/salesBookingDiscountService');
const { masterAmountDue } = require('../services/salesMasterAmount');
(async () => {
    if (!['.', 'localhost', '127.0.0.1', require('os').hostname().toLowerCase()].includes((process.env.DB_SERVER || '').split('\\')[0].toLowerCase())) {
        throw new Error('Run against the local development database only.');
    }
    const pool = await getPool(), tx = new sql.Transaction(pool), marker = 'VERIFY-' + Date.now();
    await tx.begin();
    try {
        const request = () => new sql.Request(tx);
        const fixture = await request().query(`SELECT TOP (1) PartyID FROM gen_PartiesInfo ORDER BY PartyID;
            SELECT TOP (1) VariantID,ModelID FROM dms_VehicleVariant ORDER BY VariantID;
            SELECT TOP (1) EmployeeID FROM gen_EmployeeInfo ORDER BY EmployeeID`);
        assert.ok(fixture.recordsets.every(rows => rows.length), 'Local DB needs a party, variant and employee.');
        const created = await request().input('no', sql.NVarChar(20), marker)
            .input('party', sql.Int, fixture.recordsets[0][0].PartyID).input('model', sql.Int, fixture.recordsets[1][0].ModelID)
            .input('variant', sql.Int, fixture.recordsets[1][0].VariantID).input('emp', sql.Int, fixture.recordsets[2][0].EmployeeID)
            .query(`INSERT INTO dms_SalesBookings (BookingNo,PartyID,VehicleModelID,VehicleVariantID,StandardPrice,
                NegotiatedPrice,AmountPaidToDate,PremiumAmount,Status,CreatedBy_SalesExecutiveID)
                OUTPUT INSERTED.BookingID VALUES (@no,@party,@model,@variant,1200,1000,1000,50,'Allocated',@emp)`);
        const id = created.recordset[0].BookingID;
        const snapshot = async () => JSON.stringify((await request().query(`
            SELECT * FROM data_FinanceVoucherInfo ORDER BY VoucherID;
            SELECT * FROM data_FinanceVoucherDetail ORDER BY VoucherID,GLCAID;
            SELECT * FROM dms_PartyLedger ORDER BY LedgerID;
            SELECT * FROM dms_SalesPayments ORDER BY PaymentID`)).recordsets);
        const before = await snapshot();
        const user = { userName: 'Local rollback verification', modules: ['sales_admin_pricing'] };
        const input = { bookingId: id, amount: '100.25', expectedPrice: 1000, reason: 'Local verification discount', user };
        const load = async () => (await request().input('id', sql.Int, id)
            .query('SELECT * FROM dms_SalesBookings WHERE BookingID=@id')).recordset[0];
        await applyBookingDiscount(tx, input);
        let booking = await load();
        assert.equal(booking.NegotiatedPrice, 899.75); assert.equal(booking.DiscountAmount, 300.25);
        assert.equal(booking.AmountPaidToDate, 1000); assert.equal(booking.PremiumAmount, 50);
        assert.equal(booking.Status, 'Allocated'); assert.equal(masterAmountDue({ ...booking, WholesalePrice: 0 }), 1000);
        await assert.rejects(applyBookingDiscount(tx, input), err => err.statusCode === 409);
        await applyBookingDiscount(tx, { ...input, amount: '99.75', expectedPrice: 899.75 });
        booking = await load();
        assert.equal(booking.NegotiatedPrice, 800); assert.equal(booking.MasterPriceBeforeDiscount, 1000);
        assert.equal(await snapshot(), before, 'No voucher, GL detail, party ledger or payment row may change.');
        const audit = await request().input('id', sql.Int, id).query(`
            SELECT COUNT(*) AS Count FROM dms_SalesAuditLog WHERE BookingID=@id AND Action='ApplyBookingDiscount';
            SELECT COUNT(*) AS Count FROM dms_BookingStateTransitions WHERE BookingID=@id`);
        assert.equal(audit.recordsets[0][0].Count, 2); assert.equal(audit.recordsets[1][0].Count, 2);
        console.log('PASS: actual SQL discounts, totals, audit, stale retry, fixed Master fallback and identical GL/party/payment rows.');
    } finally { await tx.rollback(); }
    const remaining = await pool.request().input('no', sql.NVarChar(20), marker)
        .query('SELECT COUNT(*) AS Count FROM dms_SalesBookings WHERE BookingNo=@no');
    assert.equal(remaining.recordset[0].Count, 0);
    console.log('PASS: fixture booking and both discounts/audits rolled back.');
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => sql.close());
