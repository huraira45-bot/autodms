-- 064_view_jc_add_wacresults.sql
-- Owner report 2026-07-03: the free-text VOC / WAC Results textarea on the
-- JC form never showed the saved value after a reload, even after pressing
-- Save. Root cause: vw_WorkshopJobCards (source for getJobCardById) never
-- included the WACResults column, so the JC form loaded ''. Auto-save then
-- wrote '' back on the next tick, silently erasing what the operator typed.
-- Re-create the view with the missing column.
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('vw_WorkshopJobCards', 'V') IS NOT NULL
    DROP VIEW vw_WorkshopJobCards;
GO

CREATE VIEW vw_WorkshopJobCards AS
SELECT j.JobCardId, j.JobCardNo, j.jobCode, j.JobCardDate, j.JobTypeId, j.OrderTypeId,
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
    -- NEW COLUMNS (owner report 2026-07-03) — the JC form binds these into
    -- form.WACResults, form.DQIRNo, form.CheckedBy*, form.ConfirmBy* — but
    -- since the view didn't return them, reload always blanked them out.
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

PRINT '064_view_jc_add_wacresults.sql complete.';
GO
