-- 122_view_jc_restore_customerdob.sql
-- Owner report 2026-08-19, JC PPM-7141: DOB blank on the Work Order print
-- again, even though 074_view_jc_add_customerdob.sql fixed this exact issue
-- on 2026-07-10. Root cause: 086_add_dms_jobcard_no.sql rebuilt
-- vw_WorkshopJobCards from an older copy of the view definition (to add
-- DMSJobCardNo) and silently dropped c.DOB AS CustomerDOB in the process.
-- No migration since has touched the view, so it's been missing since 086.
-- Re-adds CustomerDOB on top of the current (086) column set. Idempotent —
-- safe to re-run.
SET NOCOUNT ON;
GO

ALTER VIEW vw_WorkshopJobCards AS
SELECT j.JobCardId, j.JobCardNo, j.jobCode, j.DMSJobCardNo, j.JobCardDate, j.JobTypeId, j.OrderTypeId,
    t.CardCode AS JobTypeCode, t.Title AS JobTypeName,
    j.VehicleRegNo, j.ChasisNo, j.EngineNo, j.PartyID, j.EndUserID, j.EndUserCode,
    j.BrandCode, j.VarientID, j.VersionCode, j.VehicleCode, j.KiloMeter AS Odometer,
    j.JobStatus,
    CASE j.JobStatus WHEN 0 THEN 'Open' WHEN 1 THEN 'In Progress' WHEN 2 THEN 'Ready'
        WHEN 3 THEN 'Invoiced' WHEN 4 THEN 'Closed' ELSE 'Unknown' END AS JobStatusText,
    j.Status AS PaymentType, j.FuelLevel, j.VOCRemarks, j.CustomerType,
    j.ReceiptDate, j.PromisedDate, j.DeliveryDate, j.Remarks, j.CompanyID,
    j.EntryUserDateTime AS CreatedAt, j.CreatedBy, j.CreatedByName,
    j.IsFinalized, j.FinalizedBy, j.FinalizedByName, j.FinalizedAt,
    j.PMType,
    j.ServiceAdvisor, j.ServiceAdvisorID,
    j.RepeatROID, j.BatteryNo, j.VehicleColor, j.Millage,
    j.IsEstimatedRO, j.EstimatedRONo, j.ApprovedBy, j.RevisedDelivery,
    j.JobResult, j.IsFIR, j.BringByType, j.BringByName, j.BringByMobile,
    j.DeliveredTo, j.DeliveryMobile, j.DeliveredAt, j.PaymentCO, j.PaymentBankID,
    bank.GLTitle AS PaymentBankName, bank.GLCode AS PaymentBankCode,
    j.CareOffID, j.CareOffName,
    j.WACResults, j.DQIRNo, j.CheckedByID, j.CheckedByName,
    j.ConfirmByID, j.ConfirmByName,
    c.endUserName AS CustomerName, c.PhoneNo AS CustomerPhone, c.CNIC AS CustomerCNIC,
    c.Address AS CustomerAddress, c.Email AS CustomerEmail,
    c.DOB AS CustomerDOB,
    p.PartyName
FROM Addata_JobCardInfo j
LEFT JOIN gen_JobCardType t ON j.JobTypeId = t.JobCardTypeId
LEFT JOIN addata_CustomerInfo c ON j.EndUserID = c.ProfileID
LEFT JOIN gen_PartiesInfo p ON j.PartyID = p.PartyID
LEFT JOIN GLChartOFAccount bank ON j.PaymentBankID = bank.GLCAID;
GO

PRINT '122_view_jc_restore_customerdob complete.';
