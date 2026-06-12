-- =====================================================
-- WORKSHOP MODULE: Fixed Views Using Exact Column Names
-- =====================================================

-- 1. Workshop Customer View
IF OBJECT_ID('vw_WorkshopCustomers', 'V') IS NOT NULL DROP VIEW vw_WorkshopCustomers;
GO
CREATE VIEW vw_WorkshopCustomers AS
SELECT 
    ProfileID, CustomerCode, endUserName AS CustomerName, 
    PhoneNo, Email, CNIC, Address,
    ChasisNo, EngineNo, RegistrationNo,
    BrandName, versionCode AS VehicleModel,
    vehicleCode, ColorId,
    PartyID, PartyName, PartyGLID, CompanyID
FROM addata_CustomerInfo;
GO

-- 2. Job Card List View
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

-- 3. Parts Issue View
IF OBJECT_ID('vw_PartsIssueToJobCard', 'V') IS NOT NULL DROP VIEW vw_PartsIssueToJobCard;
GO
CREATE VIEW vw_PartsIssueToJobCard AS
SELECT 
    si.StockIssueID, si.IssueDate, si.IssueNo,
    si.JobCardId, si.JobCardNo, si.Remarks,
    sid.StockIssueDetailID, sid.ItemId,
    i.ItenName AS ItemName, i.ItemNumber,
    sid.Quantity, sid.StockRate, sid.ItemRate,
    sid.IssueQuantity, sid.TechnicainId AS TechnicianId
FROM data_StockIssuetoJobCard si
JOIN data_StockIssuetoJobCardDetail sid ON si.StockIssueID = sid.StockIssueID
LEFT JOIN InventItems i ON sid.ItemId = i.ItemId;
GO

PRINT 'All workshop views created successfully.';
GO
