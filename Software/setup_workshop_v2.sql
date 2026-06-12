IF OBJECT_ID('vw_WorkshopJobCards', 'V') IS NOT NULL DROP VIEW vw_WorkshopJobCards;
GO
CREATE VIEW vw_WorkshopJobCards AS
SELECT 
    j.JobCardId, j.JobCardNo, j.jobCode, j.JobCardDate,
    j.JobTypeId, t.CardCode AS JobTypeCode, t.Title AS JobTypeName,
    j.VehicleRegNo, j.ChasisNo, j.EngineNo,
    j.PartyID, j.EndUserID, j.EndUserCode,
    j.BrandCode, j.VarientID, j.VersionCode, j.VehicleCode,
    j.KiloMeter AS Odometer,
    j.JobStatus, 
    CASE j.JobStatus 
        WHEN 0 THEN 'Open'
        WHEN 1 THEN 'In Progress' 
        WHEN 2 THEN 'Ready'
        WHEN 3 THEN 'Invoiced'
        WHEN 4 THEN 'Closed'
        ELSE 'Unknown'
    END AS JobStatusText,
    j.Status AS PaymentType,
    j.FuelLevel, j.VOCRemarks, j.CustomerType,
    j.ReceiptDate, j.ReceiptTime,
    j.PromisedDate, j.PromisedTime,
    j.DeliveryDate, j.DeliveryTime,
    j.Remarks, j.EstimateJob,
    j.CompanyID, j.UserID,
    j.EntryUserDateTime AS CreatedAt,
    c.endUserName AS CustomerName, c.PhoneNo AS CustomerPhone
FROM Addata_JobCardInfo j
LEFT JOIN gen_JobCardType t ON j.JobTypeId = t.JobCardTypeId
LEFT JOIN addata_CustomerInfo c ON j.EndUserID = c.EndUserId;
GO
PRINT 'View updated';
GO
