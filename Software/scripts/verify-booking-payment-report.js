// Read-only SQL verification. CTE fixtures shadow the real finance tables for
// this single SELECT; no booking, voucher, ledger or stock record is written.
// Run from Software: node scripts/verify-booking-payment-report.js
require('dotenv').config();
const assert = require('node:assert/strict');
const { sql, getPool } = require('../config/db');
const { masterPositionSql } = require('../services/masterPaymentPositionService');

async function verify() {
    const pool = await getPool();
    const result = await pool.request().input('gl', sql.Int, 999).query(`
        WITH data_FinanceVoucherInfo AS (
            SELECT x.*,CAST('2026-10-01' AS DATE) AS VoucherDate FROM (VALUES
                (1, 'Posted', NULL, 'PAY_MASTER', 1, 'BPV-1'),
                (2, 'Posted', NULL, 'SALES_DELIVERY', 1, 'JV-2'),
                (3, 'Reversed', NULL, 'PAY_MASTER', 2, 'BPV-3'),
                (4, 'Posted', 3, 'PAY_MASTER', 2, 'BPV-4'),
                (5, 'Draft', NULL, 'PAY_MASTER', 3, 'BPV-5'),
                (6, 'Posted', NULL, 'SALES_PAYMENT', 4, 'JV-6'),
                (7, 'Posted', NULL, 'SALES_DELIVERY', 4, 'JV-7'),
                (8, 'Posted', NULL, 'Opening', NULL, 'JV-OB-8'),
                (9, 'Posted', NULL, 'Manual', NULL, 'JV-9'),
                (10, 'Posted', NULL, 'PAY_MASTER', 7, 'BPV-10'),
                (11, 'Reversed', NULL, 'SALES_DELIVERY', 7, 'JV-11'),
                (12, 'Posted', 11, NULL, NULL, 'JV-12'),
                (13, 'Posted', NULL, 'PAY_MASTER', 8, 'BPV-13'),
                (14, 'Posted', NULL, 'Manual', NULL, 'JV-14'),
                (15, 'Posted', NULL, 'Manual', NULL, 'JV-15'),
                (16, 'Reversed', NULL, 'Opening', NULL, 'JV-OB-16')
            ) x(VoucherID,Status,ReversesVoucherID,SourceDocType,SourceDocID,VoucherNo)
        ), data_FinanceVoucherDetail AS (
            SELECT * FROM (VALUES
                (1,999,1,100.00,0.00), (2,999,1,0.00,100.00),
                (3,999,2,40.00,0.00), (4,999,2,0.00,40.00),
                (5,999,3,90.00,0.00), (6,999,4,100.00,0.00), (7,999,4,0.00,100.00),
                (8,999,NULL,200.00,0.00), (9,999,NULL,30.00,0.00), (9,777,NULL,0.00,30.00),
                (10,999,7,50.00,0.00), (11,999,7,0.00,50.00), (12,999,7,50.00,0.00),
                (13,999,NULL,40.00,0.00), (14,32185,9,70.00,0.00),
                (15,999,99,500.00,0.00), (16,999,NULL,20.00,0.00)
            ) x(VoucherID,GLCAID,BookingID,Debit,Credit)
        ), GLChartOFAccount AS (
            SELECT * FROM (VALUES (999,'CORE'),(32185,'102001011'),(777,'CUSTOMER')) x(GLCAID,GLCode)
        ), dms_HistoricalMasterAllocations AS (
            SELECT * FROM (VALUES (5,8,999,20.00),(10,16,999,20.00)) x(BookingID,VoucherID,GLCAID,Amount)
        ), dms_SalesPayments AS (
            SELECT 1 AS PaymentID,6 AS BookingID,9 AS VoucherID,'Posted' AS Status,'PayOrder' AS PaymentMode,
                CAST(30 AS DECIMAL(18,2)) AS Amount,0 AS PremiumPortion,777 AS LinkedVoucherGLCAID,
                1 AS IsLinkedVoucher,CAST(NULL AS INT) AS HistoricalMasterGLCAID
        )
        SELECT cases.BookingID,cases.ExpectedRemitted,cases.ExpectedPosition,
            (SELECT ISNULL(SUM(p.Net),0) FROM (${masterPositionSql('cases.BookingID', '@gl', { excludeDelivery: true })}) p) AS ActualRemitted,
            (SELECT ISNULL(SUM(p.Net),0) FROM (${masterPositionSql('cases.BookingID', '@gl')}) p) AS ActualPosition
        FROM (VALUES (1,100,0),(2,0,0),(3,0,0),(4,100,0),(5,20,20),(6,30,30),(7,50,50),(8,40,40),(9,70,70),(10,0,0))
            cases(BookingID,ExpectedRemitted,ExpectedPosition);`);
    assert.equal(result.recordset.length, 10);
    for (const row of result.recordset) {
        assert.equal(Number(row.ActualRemitted), Number(row.ExpectedRemitted), `Remittance fixture ${row.BookingID}`);
        assert.equal(Number(row.ActualPosition), Number(row.ExpectedPosition), `Existing balance fixture ${row.BookingID}`);
    }
    console.log('PASS: 10 SQL fixtures; delivery, reversals, drafts, direct pay orders, shared historical allocations, source tags and legacy Master accounts. Existing balance behavior preserved.');
}
verify().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => sql.close());
