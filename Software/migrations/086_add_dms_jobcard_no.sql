-- 086_add_dms_jobcard_no.sql
-- Owner ask 2026-07-17: add a "DMS Job Card No." field on the JC form
-- (separate from jobCode / Job NO). The service advisor enters this as
-- the reference to Master Changan's DMS system. Finalize will be blocked
-- when it's empty (enforcement lives in finalizeController.js).
--
-- Migration adds the column to Addata_JobCardInfo and re-creates
-- vw_WorkshopJobCards so the JC form reads it back when the JC is
-- re-opened. Idempotent — safe to re-run.
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('Addata_JobCardInfo')
      AND name = 'DMSJobCardNo'
)
BEGIN
    ALTER TABLE Addata_JobCardInfo
    ADD DMSJobCardNo NVARCHAR(50) NULL;
    PRINT '086: added DMSJobCardNo column.';
END
ELSE
    PRINT '086: DMSJobCardNo column already present.';
GO

-- Rebuild the workshop-facing view to surface the new column so the JC
-- form GET reads it back into form.DMSJobCardNo on reload.
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
    c.Address AS CustomerAddress, c.Email AS CustomerEmail, p.PartyName
FROM Addata_JobCardInfo j
LEFT JOIN gen_JobCardType t ON j.JobTypeId = t.JobCardTypeId
LEFT JOIN addata_CustomerInfo c ON j.EndUserID = c.ProfileID
LEFT JOIN gen_PartiesInfo p ON j.PartyID = p.PartyID
LEFT JOIN GLChartOFAccount bank ON j.PaymentBankID = bank.GLCAID;
GO

PRINT '086_add_dms_jobcard_no complete.';
