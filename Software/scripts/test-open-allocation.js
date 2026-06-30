/**
 * Open-Allocation end-to-end walkthrough.
 *
 *   - Creates a test customer (Ali Walk-In) and links them to a fresh leaf
 *     under 201002.
 *   - Creates a booking against the open-allocation chassis (VehicleID=2,
 *     ChasisNo='trtrt').
 *   - Walks payment → Pay Master → allocate → gate pass.
 *   - Dumps the resulting GL.
 *
 * Run with:  node scripts/test-open-allocation.js
 */
const { getPool, sql } = require('../config/db');
const { postSalesPaymentVoucher } = require('../services/salesPaymentPostingService');
const { postPayMasterVoucher }    = require('../services/payMasterService');
const { postDeliveryVoucher }     = require('../services/salesDeliveryPostingService');

const FAKE_USER = { userId: null, userName: 'open-alloc-test', employeeId: null };
const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
    const pool = await getPool();

    // ------------------------------------------------------------------
    // 1. Pick the open-allocation chassis + a fresh COA leaf
    // ------------------------------------------------------------------
    const veh = (await pool.request().query(`
        SELECT TOP 1 v.VehicleID, v.VariantID, v.ChasisNo, vt.WholesalePrice
        FROM dms_Vehicle v
        INNER JOIN dms_VehicleVariant vt ON vt.VariantID = v.VariantID
        WHERE v.Status='AtDealer' AND v.AllocationType='OpenAllocation'`)).recordset[0];
    if (!veh) throw new Error('No AtDealer open-allocation chassis found.');

    const freeLeaf = (await pool.request().query(`
        SELECT TOP 1 c.GLCAID, c.GLCode, c.GLTitle
        FROM GLChartOFAccount c
        LEFT JOIN gen_PartiesInfo p ON p.PartyGLID = c.GLCAID
        WHERE c.GLCode LIKE '201002%' AND c.GLCode <> '201002'
          AND TRY_CAST(SUBSTRING(c.GLCode, 7, 10) AS INT) < 900
          AND c.Status=1 AND c.isParent=0
          AND p.PartyID IS NULL
        ORDER BY c.GLCode`)).recordset[0];
    if (!freeLeaf) throw new Error('No free 201002 leaf.');

    console.log(`Chassis : ${veh.ChasisNo} (VehicleID=${veh.VehicleID}, WholesalePrice=${veh.WholesalePrice})`);
    console.log(`COA leaf: ${freeLeaf.GLCode} ${freeLeaf.GLTitle}\n`);

    // ------------------------------------------------------------------
    // 2. Create test customer + booking in one transaction
    // ------------------------------------------------------------------
    const tx1 = new sql.Transaction(pool);
    await tx1.begin();
    let partyId, bookingId, bookingNo;
    try {
        const partyR = await new sql.Request(tx1)
            .input('name', sql.NVarChar(200), 'ALI WALK-IN (open-alloc test)')
            .input('gl',   sql.Int,           freeLeaf.GLCAID)
            .query(`INSERT INTO gen_PartiesInfo (PartyName, PartyType, PartyGLID, Status)
                    OUTPUT INSERTED.PartyID
                    VALUES (@name, 'Customer', @gl, 1)`);
        partyId = partyR.recordset[0].PartyID;

        const seqR = await new sql.Request(tx1).query(`SELECT NEXT VALUE FOR dbo.seq_SalesBookingNo AS n`);
        bookingNo = `BK-2026-${String(seqR.recordset[0].n).padStart(4, '0')}`;

        const bkR = await new sql.Request(tx1)
            .input('no',  sql.NVarChar(50), bookingNo)
            .input('pid', sql.Int,          partyId)
            .input('mid', sql.Int,          1)              // ModelID 1
            .input('vid', sql.Int,          veh.VariantID)
            .input('np',  sql.Decimal(18,2), veh.WholesalePrice)  // vehicle = set price
            .input('prem',sql.Decimal(18,2), 50)            // premium markup
            .query(`INSERT INTO dms_SalesBookings
                        (BookingNo, PartyID, VehicleModelID, VehicleVariantID,
                         NegotiatedPrice, PremiumAmount, AmountPaidToDate, Status,
                         CreatedAt, CreatedByName)
                    OUTPUT INSERTED.BookingID
                    VALUES (@no, @pid, @mid, @vid, @np, @prem, 0, 'PendingPayment',
                            GETDATE(), 'open-alloc-test')`);
        bookingId = bkR.recordset[0].BookingID;

        await tx1.commit();
    } catch (e) { await tx1.rollback(); throw e; }
    console.log(`Party   : #${partyId} ALI WALK-IN`);
    console.log(`Booking : ${bookingNo} (BookingID=${bookingId}), Vehicle 1000 + Premium 50\n`);

    // ------------------------------------------------------------------
    // 3. Payment #1 — direct PayOrder 800 to Master (Case 2 pass-through)
    // ------------------------------------------------------------------
    const tx2 = new sql.Transaction(pool);
    await tx2.begin();
    try {
        const ins = await new sql.Request(tx2)
            .input('bid', sql.Int, bookingId)
            .input('p',   sql.Decimal(18,2), 800)
            .input('po',  sql.NVarChar(50), 'PO-TEST-001')
            .input('pob', sql.NVarChar(100),'BANK ALFALAH (issuing)')
            .query(`INSERT INTO dms_SalesPayments
                        (BookingID, PaymentPath, PaymentMode, Amount, PremiumPortion,
                         PayOrderNumber, PayOrderBankName, ReceivedAt, Status, ReceivedByName)
                    OUTPUT INSERTED.PaymentID
                    VALUES (@bid, 'PayOrder', 'PayOrder', @p, 0,
                            @po, @pob, GETDATE(), 'Posted', 'open-alloc-test')`);
        const pid = ins.recordset[0].PaymentID;
        const vid = await postSalesPaymentVoucher(pid, FAKE_USER, tx2);
        await tx2.commit();
        console.log(`Payment 1: PayOrder PO-TEST-001 for 800 direct to Master → voucher #${vid}`);
    } catch (e) { await tx2.rollback(); throw e; }

    // ------------------------------------------------------------------
    // 4. Payment #2 — Cash 200 vehicle + 50 premium (total 250)
    // ------------------------------------------------------------------
    const tx3 = new sql.Transaction(pool);
    await tx3.begin();
    try {
        const ins = await new sql.Request(tx3)
            .input('bid', sql.Int, bookingId)
            .input('amt', sql.Decimal(18,2), 200)
            .input('prem',sql.Decimal(18,2), 50)
            .query(`INSERT INTO dms_SalesPayments
                        (BookingID, PaymentPath, PaymentMode, Amount, PremiumPortion,
                         ReceivedAt, Status, ReceivedByName)
                    OUTPUT INSERTED.PaymentID
                    VALUES (@bid, 'Direct', 'Cash', @amt, @prem,
                            GETDATE(), 'Posted', 'open-alloc-test')`);
        const pid = ins.recordset[0].PaymentID;
        const vid = await postSalesPaymentVoucher(pid, FAKE_USER, tx3);
        await tx3.commit();
        console.log(`Payment 2: Cash 200 vehicle + 50 premium (total 250) → voucher #${vid}`);
    } catch (e) { await tx3.rollback(); throw e; }

    // ------------------------------------------------------------------
    // 5. Pay Master 200 — forward the cash share to Master
    // ------------------------------------------------------------------
    const bankR = await pool.request().query(`
        SELECT TOP 1 GLCAID FROM dms_BankAccounts WHERE IsActive=1 ORDER BY GLCAID`);
    const bankGL = bankR.recordset[0].GLCAID;

    const tx4 = new sql.Transaction(pool);
    await tx4.begin();
    try {
        const r = await postPayMasterVoucher({
            bookingId, amount: 200, mode: 'Bank',
            bankAccountGLCAID: bankGL,
            reference: 'OPEN-ALLOC-SETTLEMENT',
        }, FAKE_USER, tx4);
        await tx4.commit();
        console.log(`Pay Master: 200 → voucher ${r.voucherNo} (#${r.voucherId})`);
    } catch (e) { await tx4.rollback(); throw e; }

    // ------------------------------------------------------------------
    // 6. Allocate the open-allocation chassis
    // ------------------------------------------------------------------
    const tx5 = new sql.Transaction(pool);
    await tx5.begin();
    try {
        await new sql.Request(tx5)
            .input('bid', sql.Int, bookingId)
            .input('vid', sql.Int, veh.VehicleID)
            .query(`UPDATE dms_SalesBookings
                    SET AllocatedVehicleID=@vid, Status='Allocated', AllocatedAt=GETDATE(),
                        UpdatedAt=GETDATE(), UpdatedByName='open-alloc-test'
                    WHERE BookingID=@bid;
                    UPDATE dms_Vehicle SET Status='Allocated', CurrentBookingID=@bid, UpdatedAt=GETDATE()
                    WHERE VehicleID=@vid;`);
        await tx5.commit();
        console.log(`Allocated: VehicleID=${veh.VehicleID} to booking ${bookingNo}`);
    } catch (e) { await tx5.rollback(); throw e; }

    // ------------------------------------------------------------------
    // 7. Gate Pass (delivery)
    // ------------------------------------------------------------------
    const tx6 = new sql.Transaction(pool);
    await tx6.begin();
    try {
        const vid = await postDeliveryVoucher(bookingId, FAKE_USER, tx6);
        await new sql.Request(tx6)
            .input('bid', sql.Int, bookingId)
            .query(`UPDATE dms_SalesBookings
                    SET Status='Closed', GatePassIssuedAt=GETDATE(), DeliveredAt=GETDATE(),
                        ClosedAt=GETDATE(), UpdatedAt=GETDATE(), UpdatedByName='open-alloc-test'
                    WHERE BookingID=@bid;
                    UPDATE dms_Vehicle SET Status='Sold', SoldDeliveredAt=GETDATE(), UpdatedAt=GETDATE()
                    WHERE CurrentBookingID=@bid;
                    UPDATE dms_OpenAllocationLedger SET Status='Sold', SoldAt=GETDATE(), SoldToBookingID=@bid
                    WHERE VehicleID = (SELECT AllocatedVehicleID FROM dms_SalesBookings WHERE BookingID=@bid)`);
        await tx6.commit();
        console.log(`Gate Pass: delivery voucher #${vid}\n`);
    } catch (e) { await tx6.rollback(); throw e; }

    // ------------------------------------------------------------------
    // 8. Dump everything posted for this booking
    // ------------------------------------------------------------------
    const vchs = await pool.request().input('bid', sql.Int, bookingId).query(`
        SELECT v.VoucherID, v.VoucherNo, v.SourceDocType, v.TotalAmount,
               vt.Title AS VType
        FROM data_FinanceVoucherInfo v
        INNER JOIN GLVoucherType vt ON vt.Voucherid = v.VoucherTypeID
        WHERE (v.SourceDocType='PAY_MASTER' AND v.SourceDocID=@bid)
           OR (v.SourceDocType='SALES_DELIVERY' AND v.SourceDocID=@bid)
           OR (v.SourceDocType='SALES_PAYMENT' AND v.SourceDocID IN
                (SELECT PaymentID FROM dms_SalesPayments WHERE BookingID=@bid))
        ORDER BY v.VoucherID`);

    const lines = await pool.request().input('bid', sql.Int, bookingId).query(`
        SELECT v.VoucherNo, v.SourceDocType, c.GLCode, c.GLTitle, d.Debit, d.Credit
        FROM data_FinanceVoucherInfo v
        INNER JOIN data_FinanceVoucherDetail d ON d.VoucherID = v.VoucherID
        LEFT JOIN GLChartOFAccount c ON c.GLCAID = d.GLCAID
        WHERE (v.SourceDocType='PAY_MASTER' AND v.SourceDocID=@bid)
           OR (v.SourceDocType='SALES_DELIVERY' AND v.SourceDocID=@bid)
           OR (v.SourceDocType='SALES_PAYMENT' AND v.SourceDocID IN
                (SELECT PaymentID FROM dms_SalesPayments WHERE BookingID=@bid))
        ORDER BY v.VoucherID, d.VoucherDetailID`);

    console.log('═'.repeat(95));
    console.log('GL DUMP'.padStart(54));
    console.log('═'.repeat(95));
    let lastV = null;
    for (const ln of lines.recordset) {
        if (ln.VoucherNo !== lastV) {
            console.log();
            console.log(`${ln.VoucherNo}   (${ln.SourceDocType})`);
            console.log('─'.repeat(95));
            lastV = ln.VoucherNo;
        }
        const code = (ln.GLCode || '?').padEnd(12);
        const title = (ln.GLTitle || '?').slice(0, 50).padEnd(50);
        const dr = ln.Debit > 0 ? fmt(ln.Debit).padStart(10) : ' '.padStart(10);
        const cr = ln.Credit > 0 ? fmt(ln.Credit).padStart(10) : ' '.padStart(10);
        console.log(`  ${code} ${title}  Dr ${dr}  Cr ${cr}`);
    }

    // ------------------------------------------------------------------
    // 9. End-state by account (filtered to this booking)
    // ------------------------------------------------------------------
    console.log();
    console.log('═'.repeat(95));
    console.log('END-STATE PER ACCOUNT (this booking only)'.padStart(60));
    console.log('═'.repeat(95));
    const balances = await pool.request().input('bid', sql.Int, bookingId).query(`
        SELECT c.GLCode, c.GLTitle,
               SUM(d.Debit) AS Dr, SUM(d.Credit) AS Cr,
               SUM(d.Debit) - SUM(d.Credit) AS Net
        FROM data_FinanceVoucherDetail d
        INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
        LEFT JOIN GLChartOFAccount c ON c.GLCAID = d.GLCAID
        WHERE d.BookingID=@bid
        GROUP BY c.GLCode, c.GLTitle
        ORDER BY c.GLCode`);

    for (const b of balances.recordset) {
        const code = (b.GLCode || '?').padEnd(12);
        const title = (b.GLTitle || '?').slice(0, 50).padEnd(50);
        const net = Number(b.Net || 0);
        const tag = net > 0 ? `Dr ${fmt(net).padStart(10)}`
                 : net < 0 ? `Cr ${fmt(-net).padStart(10)}`
                           : '   ' + '0'.padStart(10);
        console.log(`  ${code} ${title}  ${tag}`);
    }

    console.log();
    console.log('Booking + Vehicle state:');
    const final = await pool.request().input('bid', sql.Int, bookingId).query(`
        SELECT b.BookingNo, b.Status AS BookingStatus, b.AmountPaidToDate, b.PremiumAmount,
               v.ChasisNo, v.Status AS VehicleStatus,
               (SELECT TOP 1 Status FROM dms_OpenAllocationLedger WHERE VehicleID=v.VehicleID) AS LedgerStatus
        FROM dms_SalesBookings b
        LEFT JOIN dms_Vehicle v ON v.VehicleID = b.AllocatedVehicleID
        WHERE b.BookingID=@bid`);
    const f = final.recordset[0];
    console.log(`  ${f.BookingNo}: ${f.BookingStatus}  ·  Paid ${fmt(f.AmountPaidToDate)} (vehicle) + ${fmt(f.PremiumAmount)} (premium)`);
    console.log(`  Chassis ${f.ChasisNo}: dms_Vehicle=${f.VehicleStatus}  dms_OpenAllocationLedger=${f.LedgerStatus}`);

    process.exit(0);
})().catch(err => { console.error('FAILED:', err); process.exit(1); });
