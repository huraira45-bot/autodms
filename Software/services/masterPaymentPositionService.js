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
    // Aggregate voucher/account balances before matching payments. The former
    // correlated OR scanned the same opening entries once per pay order.
    const sources = `SELECT source.VoucherID,d.GLCAID,source.VoucherNo,source.VoucherDate,
            SUM(ISNULL(d.Debit,0)-ISNULL(d.Credit,0)) AS MasterAmount
        FROM data_FinanceVoucherDetail d
        JOIN data_FinanceVoucherInfo source ON source.VoucherID=d.VoucherID
        WHERE d.BookingID IS NULL AND ${masterAccountSql('d',coreGL)}
          AND source.Status='Posted' AND source.ReversesVoucherID IS NULL
          AND ISNULL(source.SourceDocType,'') NOT IN (${generatedSourcesSql})
        GROUP BY source.VoucherID,d.GLCAID,source.VoucherNo,source.VoucherDate`;
    const payments = `SELECT p.PaymentID,p.BookingID,p.VoucherID,p.LinkedVoucherGLCAID,
            p.HistoricalMasterGLCAID,p.Amount,v.VoucherNo,v.VoucherDate
        FROM dms_SalesPayments p JOIN data_FinanceVoucherInfo v ON v.VoucherID=p.VoucherID
        WHERE p.IsLinkedVoucher=1 AND p.Status='Posted' AND p.PaymentMode='PayOrder'
          AND p.Amount>0 AND ISNULL(p.PremiumPortion,0)=0 AND p.LinkedVoucherGLCAID IS NOT NULL
          AND v.Status='Posted' AND v.ReversesVoucherID IS NULL
          AND ISNULL(v.SourceDocType,'') NOT IN (${generatedSourcesSql})`;
    const matches = `SELECT p.PaymentID,p.BookingID,p.VoucherID AS PaymentVoucherID,p.LinkedVoucherGLCAID,
            p.Amount,master.VoucherID,master.GLCAID,master.MasterAmount
        FROM (${payments}) p JOIN (${sources}) master ON master.VoucherID=p.VoucherID
        WHERE p.VoucherNo NOT LIKE 'JV-OB-%' OR p.HistoricalMasterGLCAID IS NULL
            OR master.GLCAID=p.HistoricalMasterGLCAID
        UNION ALL
        SELECT p.PaymentID,p.BookingID,p.VoucherID,p.LinkedVoucherGLCAID,
            p.Amount,master.VoucherID,master.GLCAID,master.MasterAmount
        FROM (${payments}) p JOIN (${sources}) master
            ON master.GLCAID=p.HistoricalMasterGLCAID AND master.VoucherDate<=p.VoucherDate
        WHERE p.VoucherNo LIKE 'JV-OB-%' AND master.VoucherNo LIKE 'JV-OB-%'
          AND NOT EXISTS (SELECT 1 FROM data_FinanceVoucherDetail ownMaster
              WHERE ownMaster.VoucherID=p.VoucherID AND ${masterAccountSql('ownMaster',coreGL)})`;
    // These branches are disjoint: a direct source has a Master line in the
    // payment voucher; a separate opening source requires that none exists.
    // Count ALL candidate accounts before applying eligibility/capacity rules.
    return `SELECT candidate.PaymentID,candidate.BookingID,candidate.VoucherID,candidate.GLCAID,candidate.Amount,
        candidate.PaymentVoucherID
    FROM (
        SELECT master.PaymentID,master.BookingID,master.VoucherID,master.GLCAID,master.Amount,master.PaymentVoucherID,
            master.MasterAmount-ISNULL((SELECT SUM(a.Amount) FROM dms_HistoricalMasterAllocations a
                WHERE a.VoucherID=master.VoucherID AND a.GLCAID=master.GLCAID),0) AS Available,
            SUM(master.Amount) OVER (PARTITION BY master.VoucherID,master.GLCAID) AS Requested
        FROM (SELECT matched.*,COUNT(*) OVER (PARTITION BY matched.PaymentID) AS AccountCount
              FROM (${matches}) matched) master
        WHERE master.AccountCount=1 AND master.MasterAmount>0
          AND (SELECT ISNULL(SUM(ISNULL(c.Credit,0)-ISNULL(c.Debit,0)),0)
               FROM data_FinanceVoucherDetail c
               WHERE c.VoucherID=master.PaymentVoucherID AND c.GLCAID=master.LinkedVoucherGLCAID)>=master.Amount
          AND NOT EXISTS (SELECT 1 FROM dms_HistoricalMasterAllocations a
              WHERE a.VoucherID IN (master.PaymentVoucherID,master.VoucherID) AND a.BookingID=master.BookingID)
          AND NOT EXISTS (SELECT 1 FROM data_FinanceVoucherDetail tagged
              WHERE tagged.VoucherID IN (master.PaymentVoucherID,master.VoucherID) AND tagged.BookingID=master.BookingID
                AND ${masterAccountSql('tagged',coreGL)})
    ) candidate WHERE candidate.Requested<=candidate.Available`;
}

function masterPositionSql(booking, coreGL, { excludeDelivery = false } = {}) {
    return `SELECT movement.GLCAID,SUM(movement.Debit) AS Dr,SUM(movement.Credit) AS Cr,
        SUM(movement.Debit-movement.Credit) AS Net
    FROM (
        SELECT d.GLCAID,ISNULL(d.Debit,0) AS Debit,ISNULL(d.Credit,0) AS Credit
        FROM data_FinanceVoucherDetail d JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID
        LEFT JOIN data_FinanceVoucherInfo original ON original.VoucherID=v.ReversesVoucherID
        WHERE v.Status IN ('Posted','Reversed') AND ${masterAccountSql('d',coreGL)}
          ${excludeDelivery ? "AND ISNULL(v.SourceDocType,'')<>'SALES_DELIVERY' AND ISNULL(original.SourceDocType,'')<>'SALES_DELIVERY'" : ''}
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
const MASTER_SOURCE_IDS_SQL = `SELECT p.VoucherID FROM dms_SalesPayments p
    WHERE p.BookingID=@bid AND p.IsLinkedVoucher=1 AND p.PaymentMode='PayOrder' AND p.Status='Posted'
      AND p.VoucherID IS NOT NULL
    UNION
    SELECT opening.VoucherID FROM dms_SalesPayments p
    JOIN data_FinanceVoucherInfo customerVoucher ON customerVoucher.VoucherID=p.VoucherID
    JOIN data_FinanceVoucherInfo opening ON opening.VoucherNo LIKE 'JV-OB-%'
        AND opening.VoucherDate<=customerVoucher.VoucherDate
    JOIN data_FinanceVoucherDetail openingAccount ON openingAccount.VoucherID=opening.VoucherID
        AND openingAccount.GLCAID=p.HistoricalMasterGLCAID
    WHERE p.BookingID=@bid AND p.IsLinkedVoucher=1 AND p.PaymentMode='PayOrder' AND p.Status='Posted'
      AND customerVoucher.VoucherNo LIKE 'JV-OB-%' AND p.HistoricalMasterGLCAID IS NOT NULL`;
const MASTER_SOURCE_LOCK_SQL = 'SELECT VoucherID FROM data_FinanceVoucherInfo WITH (UPDLOCK,HOLDLOCK) WHERE VoucherID=@vid';
async function loadMasterPosition(executor, bookingId, coreGL, lockSources = false) {
    if (lockSources) {
        const sources=await new sql.Request(executor).input('bid',sql.Int,bookingId).query(MASTER_SOURCE_IDS_SQL);
        const ids=[...new Set(sources.recordset.map(row=>Number(row.VoucherID)))]
            .filter(id=>Number.isSafeInteger(id)&&id>0).sort((a,b)=>a-b);
        // Resolve the narrow source set before locking. A correlated OR under
        // HOLDLOCK produced a costly parallel plan across the voucher table.
        // Lock existing sources in a consistent order, then read capacities.
        for (const voucherId of ids) {
            await new sql.Request(executor).input('vid',sql.Int,voucherId).query(MASTER_SOURCE_LOCK_SQL);
        }
    }
    const r=await new sql.Request(executor).input('bid',sql.Int,bookingId).input('gl',sql.Int,coreGL)
        .query(masterPositionSql('@bid','@gl'));
    return r.recordset.map(row=>({GLCAID:row.GLCAID,Dr:Number(row.Dr)||0,Cr:Number(row.Cr)||0,Net:Number(row.Net)||0}));
}
module.exports={LEGACY_MASTER_CODES,masterAccountSql,historicalPayOrderSql,masterPositionSql,masterNetSql,loadMasterPosition,MASTER_SOURCE_IDS_SQL,MASTER_SOURCE_LOCK_SQL};
