const { historicalPayOrderSql, masterAccountSql } = require('./masterPaymentPositionService');

// conditions contains only application-owned predicates with bound parameters.
// Materialize global historical PO eligibility once: its capacity window must
// include payments on bookings outside the user's report filters.
function bookingPaymentReportQuery(conditions) {
    return `SET NOCOUNT ON;
        IF OBJECT_ID('tempdb..#BookingPaymentRows') IS NOT NULL DROP TABLE #BookingPaymentRows;
        IF OBJECT_ID('tempdb..#BookingPaymentOrders') IS NOT NULL DROP TABLE #BookingPaymentOrders;

        SELECT b.BookingID,b.BookingNo,b.Status,b.IsHistorical,b.VehicleModelID,b.VehicleVariantID,
            b.CreatedBy_SalesExecutiveID AS SalespersonID,
            CAST(COALESCE(b.BookingDate,b.CreatedAt) AS DATE) AS BookingDate,b.PromisedDeliveryMonth,
            p.PartyName AS CustomerName,p.PhoneOne AS Phone,m.ModelName,v.VariantName,veh.ChasisNo,
            e.EmployeeName AS SalespersonName,b.NegotiatedPrice,b.AmountPaidToDate,
            b.MasterAgreedAmount,b.MasterPriceBeforeDiscount,v.WholesalePrice,b.HistoricalMasterApprovedAmount
        INTO #BookingPaymentRows
        FROM dms_SalesBookings b
        LEFT JOIN gen_PartiesInfo p ON p.PartyID=b.PartyID
        LEFT JOIN dms_VehicleModel m ON m.ModelID=b.VehicleModelID
        LEFT JOIN dms_VehicleVariant v ON v.VariantID=b.VehicleVariantID
        LEFT JOIN dms_Vehicle veh ON veh.VehicleID=b.AllocatedVehicleID
        LEFT JOIN gen_EmployeeInfo e ON e.EmployeeID=b.CreatedBy_SalesExecutiveID
        WHERE ${conditions.join(' AND ')};
        CREATE UNIQUE CLUSTERED INDEX IX_BookingPaymentRows ON #BookingPaymentRows(BookingID);

        SELECT po.BookingID,po.GLCAID,po.Amount INTO #BookingPaymentOrders
        FROM (${historicalPayOrderSql('@gl')}) po
        OPTION (MAXDOP 1);

        WITH ${masterMovementCtes()}
        SELECT report.*,ISNULL(paid.MasterLedgerRemitted,0) AS MasterLedgerRemitted
        FROM #BookingPaymentRows report
        LEFT JOIN (SELECT BookingID,SUM(Amount) AS MasterLedgerRemitted FROM MasterMovements GROUP BY BookingID) paid
            ON paid.BookingID=report.BookingID
        ORDER BY report.BookingDate DESC,report.BookingID DESC
        OPTION (MAXDOP 1);

        DROP TABLE #BookingPaymentOrders;
        DROP TABLE #BookingPaymentRows;`;
}
function masterMovementCtes(scope = '#BookingPaymentRows', orders = '#BookingPaymentOrders') {
    return `        MasterLines AS (
            SELECT d.BookingID,d.Debit,d.Credit,v.SourceDocType,v.SourceDocID,
                original.SourceDocType AS OriginalSourceDocType,original.SourceDocID AS OriginalSourceDocID
            FROM data_FinanceVoucherDetail d
            JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID
            LEFT JOIN data_FinanceVoucherInfo original ON original.VoucherID=v.ReversesVoucherID
            WHERE v.Status IN ('Posted','Reversed') AND ${masterAccountSql('d', '@gl')}
                AND ISNULL(v.SourceDocType,'')<>'SALES_DELIVERY'
                AND ISNULL(original.SourceDocType,'')<>'SALES_DELIVERY'
        ), MasterMovements AS (
            SELECT target.BookingID,ISNULL(line.Debit,0)-ISNULL(line.Credit,0) AS Amount
            FROM MasterLines line
            CROSS APPLY (
                SELECT line.BookingID
                UNION SELECT line.SourceDocID WHERE line.SourceDocType='PAY_MASTER'
                UNION SELECT line.OriginalSourceDocID WHERE line.OriginalSourceDocType='PAY_MASTER'
            ) target
            JOIN ${scope} scope ON scope.BookingID=target.BookingID
            UNION ALL
            SELECT a.BookingID,a.Amount FROM dms_HistoricalMasterAllocations a
            JOIN data_FinanceVoucherInfo v ON v.VoucherID=a.VoucherID
            JOIN ${scope} scope ON scope.BookingID=a.BookingID
            WHERE v.Status='Posted' AND v.ReversesVoucherID IS NULL
            UNION ALL
            SELECT po.BookingID,po.Amount FROM ${orders} po
            JOIN ${scope} scope ON scope.BookingID=po.BookingID
        )
`;
}
module.exports = { bookingPaymentReportQuery, masterMovementCtes };
