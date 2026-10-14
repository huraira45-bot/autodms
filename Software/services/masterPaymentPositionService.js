const { sql } = require('../config/db');
const LEGACY_MASTER_CODES = ['102001001','102001002','102001005','102001006','102001008','102001011','102001012'];
const legacyCodesSql = LEGACY_MASTER_CODES.map(code => "'" + code + "'").join(',');
const generatedSourcesSql = "'PAY_MASTER','MASTER_INVOICE','SALES_PAYMENT','SALES_DELIVERY','SALES_INCENTIVE_ACCRUAL','SALES_INCENTIVE_DISB'";
// These arguments are source-code expressions, never request text.
function masterAccountSql(alias, coreGL) {
    return `(${alias}.GLCAID=${coreGL} OR ${alias}.GLCAID IN
        (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode IN (${legacyCodesSql})))`;
}
function historicalPayOrderSql(coreGL = '@gl') {
    return `SELECT candidate.PaymentID,candidate.BookingID,candidate.VoucherID,candidate.GLCAID,candidate.Amount,
        candidate.PaymentVoucherID
    FROM (
        SELECT p.PaymentID,p.BookingID,master.VoucherID,master.GLCAID,p.Amount,p.VoucherID AS PaymentVoucherID,
            master.MasterAmount-ISNULL((SELECT SUM(a.Amount) FROM dms_HistoricalMasterAllocations a
                WHERE a.VoucherID=master.VoucherID AND a.GLCAID=master.GLCAID),0) AS Available,
            SUM(p.Amount) OVER (PARTITION BY master.VoucherID,master.GLCAID) AS Requested
        FROM dms_SalesPayments p
        JOIN data_FinanceVoucherInfo v ON v.VoucherID=p.VoucherID
        CROSS APPLY (
            SELECT source.VoucherID,d.GLCAID,SUM(ISNULL(d.Debit,0)-ISNULL(d.Credit,0)) AS MasterAmount,
                COUNT(*) OVER () AS AccountCount
            FROM data_FinanceVoucherDetail d
            JOIN data_FinanceVoucherInfo source ON source.VoucherID=d.VoucherID
            WHERE d.BookingID IS NULL AND ${masterAccountSql('d',coreGL)}
              AND source.Status='Posted' AND source.ReversesVoucherID IS NULL
              AND ISNULL(source.SourceDocType,'') NOT IN (${generatedSourcesSql})
              AND (
                -- Ordinary direct pay order: its own unambiguous Master entry.
                (source.VoucherID=v.VoucherID AND
                    (v.VoucherNo NOT LIKE 'JV-OB-%' OR p.HistoricalMasterGLCAID IS NULL
                        OR d.GLCAID=p.HistoricalMasterGLCAID))
                OR
                -- Customer and Master opening balances can be in separate vouchers.
                (v.VoucherNo LIKE 'JV-OB-%' AND source.VoucherNo LIKE 'JV-OB-%'
                    AND source.VoucherDate<=v.VoucherDate AND d.GLCAID=p.HistoricalMasterGLCAID
                    AND NOT EXISTS (SELECT 1 FROM data_FinanceVoucherDetail ownMaster
                        WHERE ownMaster.VoucherID=v.VoucherID AND ${masterAccountSql('ownMaster',coreGL)}))
              )
            GROUP BY source.VoucherID,d.GLCAID
        ) master
        WHERE p.IsLinkedVoucher=1 AND p.Status='Posted' AND p.PaymentMode='PayOrder'
          AND p.Amount>0 AND ISNULL(p.PremiumPortion,0)=0 AND p.LinkedVoucherGLCAID IS NOT NULL
          AND v.Status='Posted' AND v.ReversesVoucherID IS NULL
          AND ISNULL(v.SourceDocType,'') NOT IN (${generatedSourcesSql})
          AND master.AccountCount=1 AND master.MasterAmount>0
          AND (SELECT ISNULL(SUM(ISNULL(c.Credit,0)-ISNULL(c.Debit,0)),0)
               FROM data_FinanceVoucherDetail c
               WHERE c.VoucherID=p.VoucherID AND c.GLCAID=p.LinkedVoucherGLCAID)>=p.Amount
          AND NOT EXISTS (SELECT 1 FROM dms_HistoricalMasterAllocations a
              WHERE a.VoucherID IN (p.VoucherID,master.VoucherID) AND a.BookingID=p.BookingID)
          AND NOT EXISTS (SELECT 1 FROM data_FinanceVoucherDetail tagged
              WHERE tagged.VoucherID IN (p.VoucherID,master.VoucherID) AND tagged.BookingID=p.BookingID
                AND ${masterAccountSql('tagged',coreGL)})
    ) candidate WHERE candidate.Requested<=candidate.Available`;
}

function masterPositionSql(booking, coreGL) {
    return `SELECT movement.GLCAID,SUM(movement.Debit) AS Dr,SUM(movement.Credit) AS Cr,
        SUM(movement.Debit-movement.Credit) AS Net
    FROM (
        SELECT d.GLCAID,ISNULL(d.Debit,0) AS Debit,ISNULL(d.Credit,0) AS Credit
        FROM data_FinanceVoucherDetail d JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID
        LEFT JOIN data_FinanceVoucherInfo original ON original.VoucherID=v.ReversesVoucherID
        WHERE v.Status IN ('Posted','Reversed') AND ${masterAccountSql('d',coreGL)}
          AND (d.BookingID=${booking} OR (v.SourceDocType='PAY_MASTER' AND v.SourceDocID=${booking})
               OR (original.SourceDocType='PAY_MASTER' AND original.SourceDocID=${booking}))
        UNION ALL
        SELECT a.GLCAID,a.Amount,0 FROM dms_HistoricalMasterAllocations a
        JOIN data_FinanceVoucherInfo hv ON hv.VoucherID=a.VoucherID
        WHERE a.BookingID=${booking} AND hv.Status='Posted' AND hv.ReversesVoucherID IS NULL
        UNION ALL
        SELECT po.GLCAID,po.Amount,0 FROM (${historicalPayOrderSql(coreGL)}) po
        WHERE po.BookingID=${booking}
    ) movement GROUP BY movement.GLCAID`;
}
function masterNetSql(booking, coreGL) {
    return `(SELECT ISNULL(SUM(position.Net),0) FROM (${masterPositionSql(booking,coreGL)}) position)`;
}
async function loadMasterPosition(executor, bookingId, coreGL, lockSources = false) {
    if (lockSources) {
        await new sql.Request(executor).input('bid',sql.Int,bookingId).query(`
            SELECT v.VoucherID FROM data_FinanceVoucherInfo v WITH (UPDLOCK,HOLDLOCK)
            WHERE EXISTS (SELECT 1 FROM dms_SalesPayments p
                JOIN data_FinanceVoucherInfo customerVoucher ON customerVoucher.VoucherID=p.VoucherID
                WHERE p.BookingID=@bid AND p.IsLinkedVoucher=1 AND p.PaymentMode='PayOrder' AND p.Status='Posted'
                  AND (p.VoucherID=v.VoucherID OR (
                    customerVoucher.VoucherNo LIKE 'JV-OB-%' AND v.VoucherNo LIKE 'JV-OB-%'
                    AND v.VoucherDate<=customerVoucher.VoucherDate
                    AND EXISTS (SELECT 1 FROM data_FinanceVoucherDetail openingAccount
                        WHERE openingAccount.VoucherID=v.VoucherID AND openingAccount.GLCAID=p.HistoricalMasterGLCAID))))`);
    }
    const r=await new sql.Request(executor).input('bid',sql.Int,bookingId).input('gl',sql.Int,coreGL)
        .query(masterPositionSql('@bid','@gl'));
    return r.recordset.map(row=>({GLCAID:row.GLCAID,Dr:Number(row.Dr)||0,Cr:Number(row.Cr)||0,Net:Number(row.Net)||0}));
}
module.exports={LEGACY_MASTER_CODES,masterAccountSql,historicalPayOrderSql,masterPositionSql,masterNetSql,loadMasterPosition};
