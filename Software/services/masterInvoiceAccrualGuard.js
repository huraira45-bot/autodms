const {sql}=require('../config/db');
const STATES=['Allocated','MasterInvoicePending','MasterInvoicePosted','ReadyForDelivery','DeliveryApproved','GatePassIssued','Delivered','Closed'];
const fail=message=>{throw Object.assign(new Error(message),{status:409});};
async function requireUploadedMasterInvoice(tx,bookingId,invoiceNo,invoiceDate){
    const bk=await new sql.Request(tx).input('id',sql.Int,bookingId)
        .query(`SELECT Status,IsHistorical,AllocatedVehicleID,MasterIncentiveRateID FROM dms_SalesBookings WITH (UPDLOCK,HOLDLOCK) WHERE BookingID=@id`);
    const booking=bk.recordset[0];
    if(!booking)fail('Booking not found.');
    if(booking.IsHistorical)fail('Historical bookings require the Master invoice upload only; no Master incentive can be accrued.');
    if(booking.MasterIncentiveRateID)fail('Master incentive was already recognized using the booking-date rate. Upload the invoice for documentation only.');
    if(!STATES.includes(booking.Status) || !booking.AllocatedVehicleID)fail('An allocated, non-cancelled booking is required to process the Master incentive.');
    const uploaded=await new sql.Request(tx).input('id',sql.Int,bookingId)
        .query(`SELECT m.InvoiceNo,m.InvoiceDate,m.IncentiveProcessedAt
                FROM dms_BookingMasterInvoices m WITH (UPDLOCK,HOLDLOCK)
                JOIN dms_SalesDocuments d WITH (HOLDLOCK) ON d.DocumentID=m.DocumentID AND d.BookingID=m.BookingID
                WHERE m.BookingID=@id AND d.DocType='MasterInvoice' AND d.DeletedAt IS NULL`);
    const invoice=uploaded.recordset[0];
    if(!invoice)fail('Upload and save the Master invoice before accruing Master incentives.');
    if(invoice.IncentiveProcessedAt)fail('Master incentives have already been processed for this invoice.');
    if(invoice.InvoiceNo!==String(invoiceNo).trim() || invoice.InvoiceDate.toISOString().slice(0,10)!==invoiceDate)
        fail('Invoice number and date must match the uploaded Master invoice. Refresh the booking.');
    const existing=await new sql.Request(tx).input('id',sql.Int,bookingId)
        .query(`SELECT TOP(1) AccrualID FROM dms_SalesIncentiveAccruals WHERE BookingID=@id AND EarnerType='Master' AND Status<>'Reversed';
                SELECT TOP(1) VoucherID FROM data_FinanceVoucherInfo WHERE SourceDocType='MASTER_INVOICE' AND SourceDocID=@id
                  AND Status IN ('Draft','Posted') AND ReversesVoucherID IS NULL`);
    if(existing.recordsets.some(rows=>rows.length))fail('A Master incentive accrual or invoice voucher already exists for this booking.');
    return booking;
}
module.exports={requireUploadedMasterInvoice,MASTER_INVOICE_STATES:STATES};
