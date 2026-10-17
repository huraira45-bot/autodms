const path = require('path');
const { sql } = require('../config/db');
const ROLES = ['sales_master_settlement', 'sales_admin_settings', 'sales_gm'];
const fail = (message, status=400) => { throw Object.assign(new Error(message), { status }); };

function validateInvoice({ bookingId, invoiceNo, invoiceDate, notes, file, user }) {
    if (!ROLES.some(role => user?.modules?.includes(role))) fail('Master invoice recording permission is required.',403);
    if (!Number.isInteger(user.userId) || !user.userName) fail('Authenticated user is required.',401);
    if (!Number.isSafeInteger(bookingId) || bookingId<=0) fail('Invalid booking ID.');
    if (typeof invoiceNo!=='string' || !invoiceNo.trim() || invoiceNo.trim().length>100) fail('Enter a Master invoice number of at most 100 characters.');
    if (typeof invoiceDate!=='string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) fail('Enter the Master invoice date (YYYY-MM-DD).');
    const date=new Date(invoiceDate+'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==invoiceDate) fail('Master invoice date is invalid.');
    if (notes!=null && (typeof notes!=='string' || notes.trim().length>500)) fail('Notes must be at most 500 characters.');
    if (!file?.path || !file.originalname) fail('Upload the Master invoice file before completing this record.');
    if (!/^(application\/pdf|image\/(jpeg|png|webp|gif))$/.test(file.mimetype) || !Number.isSafeInteger(file.size) || file.size<=0 || file.size>10*1024*1024)
        fail('Upload a PDF or JPG/PNG/WEBP/GIF image, up to 10 MB.');
    return { invoiceNo:invoiceNo.trim(), date, notes:notes?.trim() || null };
}

async function recordMasterInvoiceDocument(tx, input) {
    const {invoiceNo,date,notes}=validateInvoice(input),{bookingId,file,user}=input;
    const result=await new sql.Request(tx).input('id',sql.Int,bookingId)
        .query(`SELECT BookingID,Status FROM dms_SalesBookings WITH (UPDLOCK,HOLDLOCK) WHERE BookingID=@id`);
    const booking=result.recordset[0];
    if (!booking) fail('Booking not found.',404);
    if (booking.Status==='Cancelled') fail('A Master invoice cannot be recorded against a cancelled booking.',409);
    const existingResult=await new sql.Request(tx).input('id',sql.Int,bookingId)
        .query(`SELECT m.*,d.DeletedAt FROM dms_BookingMasterInvoices m
                JOIN dms_SalesDocuments d ON d.DocumentID=m.DocumentID WHERE m.BookingID=@id`);
    const existing=existingResult.recordset[0];
    if (existing && !existing.DeletedAt) fail('The Master invoice has already been uploaded. Refresh the booking to view it.',409);
    const filePath=`uploads/sales/${path.basename(file.path)}`;
    const inserted=await new sql.Request(tx).input('id',sql.Int,bookingId)
        .input('description',sql.NVarChar(500),`Master invoice ${invoiceNo} dated ${input.invoiceDate}`)
        .input('path',sql.NVarChar(500),filePath).input('original',sql.NVarChar(255),file.originalname)
        .input('mime',sql.NVarChar(100),file.mimetype).input('size',sql.BigInt,file.size)
        .input('emp',sql.Int,user.employeeId || null).input('name',sql.NVarChar(100),user.userName)
        .query(`INSERT INTO dms_SalesDocuments
                    (DocType,Description,FilePath,OriginalFileName,MimeType,SizeBytes,BookingID,UploadedByEmployeeID,UploadedByName)
                OUTPUT INSERTED.DocumentID
                VALUES ('MasterInvoice',@description,@path,@original,@mime,@size,@id,@emp,@name)`);
    const documentId=inserted.recordset[0].DocumentID;
    await new sql.Request(tx).input('id',sql.Int,bookingId).input('no',sql.NVarChar(100),invoiceNo)
        .input('date',sql.Date,date).input('doc',sql.Int,documentId).input('notes',sql.NVarChar(500),notes)
        .input('uid',sql.Int,user.userId).input('name',sql.NVarChar(100),user.userName)
        .query(existing ? `UPDATE dms_BookingMasterInvoices SET InvoiceNo=@no,InvoiceDate=@date,DocumentID=@doc,Notes=@notes,
                    RecordedByUserID=@uid,RecordedByName=@name,RecordedAt=SYSUTCDATETIME() WHERE BookingID=@id`
            : `INSERT INTO dms_BookingMasterInvoices (BookingID,InvoiceNo,InvoiceDate,DocumentID,Notes,RecordedByUserID,RecordedByName)
               VALUES (@id,@no,@date,@doc,@notes,@uid,@name)`);
    const detail={ InvoiceNo:invoiceNo,InvoiceDate:input.invoiceDate,DocumentID:documentId,FilePath:filePath };
    await new sql.Request(tx).input('id',sql.Int,bookingId)
        .input('old',sql.NVarChar(sql.MAX),existing ? JSON.stringify(existing) : null)
        .input('new',sql.NVarChar(sql.MAX),JSON.stringify(detail)).input('uid',sql.Int,user.userId)
        .input('emp',sql.Int,user.employeeId || null).input('name',sql.NVarChar(100),user.userName)
        .input('notes',sql.NVarChar(500),notes)
        .query(`INSERT INTO dms_SalesAuditLog
                    (BookingID,EntityType,EntityID,Action,OldValue,NewValue,ActorEmployeeID,ActorUserID,ActorName,Notes)
                VALUES (@id,'Booking',@id,'MasterInvoiceDocumentRecorded',@old,@new,@emp,@uid,@name,@notes)`);
    await new sql.Request(tx).input('id',sql.Int,bookingId).input('status',sql.NVarChar(30),booking.Status)
        .input('emp',sql.Int,user.employeeId || null).input('name',sql.NVarChar(100),user.userName)
        .input('role',sql.NVarChar(50),user.groupTitle || null)
        .input('reason',sql.NVarChar(sql.MAX),`Master invoice ${invoiceNo}, dated ${input.invoiceDate}, uploaded as ${file.originalname}.`)
        .query(`INSERT INTO dms_BookingStateTransitions (BookingID,FromState,ToState,ActorEmployeeID,ActorName,ActorRole,Reason)
                VALUES (@id,@status,@status,@emp,@name,@role,@reason)`);
    return { ...detail,BookingID:bookingId,Status:booking.Status };
}
module.exports={ recordMasterInvoiceDocument,validateInvoice,ROLES };
