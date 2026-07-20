-- =============================================================================
-- Import legacy vehicle history from ssMasterVehicle into shadow tables.
--
-- IDEMPOTENT — safe to re-run. TRUNCATEs the four shadow tables at the start
-- and re-copies everything from the legacy DB. WorkshopVehicles is topped up
-- (only ADDs missing reg-nos; never modifies existing rows).
--
-- Run this AFTER migration 091 has created the shadow tables.
--
-- Prereqs
--   * SQL Server login running this script must have SELECT on ssMasterVehicle
--     and INSERT/TRUNCATE on the current DB.
--   * Both databases must be on the same instance.
-- =============================================================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @started DATETIME = GETDATE();
PRINT 'Started at ' + CONVERT(NVARCHAR(30), @started, 121);

-- ---------- Wipe shadow tables ----------------------------------------------
TRUNCATE TABLE dbo.Legacy_JobCardLabour;
TRUNCATE TABLE dbo.Legacy_JobCardParts;
TRUNCATE TABLE dbo.Legacy_JobCardSublets;
TRUNCATE TABLE dbo.Legacy_JobCards;

-- ---------- 1. Headers -------------------------------------------------------
PRINT 'Copying RO headers...';

INSERT INTO dbo.Legacy_JobCards (
    LegacyID, WorkOrderNo, JobCardDate, CompletedDate, PromisedDate,
    WorkOrderStatus, IsFinal, FinalAt,
    ServiceType, BusinessUnitID, PeriodicMaintainceID,
    AdvisorID, AdvisorName, ForemanName,
    RegistrationNumber, ChassisNumber, EngineNumber,
    VehicleType, VType, Model, ColorName, OdMeter,
    CustomerName, Mobile1, Mobile2, Phone, CNIC, CAddress, DeliveredTo,
    PartyID, PartyName,
    InsuranceCompanyname, ClaimNo, DepAmount, DepPartyName,
    LabourAmount, SubletRepairAmount, SparesAmount, LubricantsAmount,
    NetAmount, NetPayable, Paid, Balance, DiscountedAmount,
    VoiceOfCustomer, TA_Diagnosis, JobCardOtherFinding
)
SELECT
    h.ID,
    h.WorkOrderNo,
    h.DateIn,
    h.DateOut,
    h.PromiseDate,
    h.WorkOrderStatus,
    h.isFinal,
    h.FinalAt,
    CASE
        WHEN h.BusinessUnitID = 4              THEN N'B&P'
        WHEN h.PeriodicMaintainceID IS NOT NULL THEN N'PPM'
        ELSE                                        N'GR'
    END,
    h.BusinessUnitID,
    h.PeriodicMaintainceID,
    h.AdvisorID,
    h.AdvisorName,
    h.ForemanName,
    h.RegistrationNumber,
    h.ChassisNumber,
    h.EngineNumber,
    h.VehicleType,
    h.VType,
    h.Model,
    h.ColorName,
    h.OdMeter,
    h.CustomerName,
    h.Mobile1,
    h.Mobile2,
    h.Phone,
    h.CNICNo,
    h.CAddress,
    h.DeliveredTo,
    h.PartyID,
    h.PartyName,
    h.InsuranceCompanyname,
    h.ClaimNo,
    h.DepAmount,
    h.DepPartyName,
    h.LabourAmount,
    h.SubletRepairAmount,
    h.SparesAmount,
    h.LubricantsAmount,
    h.NetAmount,
    h.NetPayable,
    h.Paid,
    h.Balance,
    h.DiscountedAmount,
    h.VoiceOfCustomer,
    h.TA_Diagnosis,
    h.JobCardOtherFinding
FROM ssMasterVehicle.dbo.srvRepairOrderHead h;

DECLARE @hdrCount INT = @@ROWCOUNT;
PRINT '  ' + CAST(@hdrCount AS NVARCHAR(10)) + ' RO headers copied.';

-- ---------- 2. Labour lines --------------------------------------------------
PRINT 'Copying labour lines...';

INSERT INTO dbo.Legacy_JobCardLabour (
    LegacyDetailID, LegacyJobCardID, JobDescription,
    Qty, Rate, DiscountedAmount, NetRate, TotalAmount, PST,
    JobPerformerName, BayNo, StartAt, EndedAt
)
SELECT
    j.ID,
    j.RepairOrderID,
    j.JobDescription,
    j.Qty,
    j.Rate,
    j.DiscountedAmount,
    j.NetRate,
    j.TotalAmount,
    j.PST,
    j.JobPerformerName,
    j.BayNo,
    j.StartAt,
    j.EndedAt
FROM ssMasterVehicle.dbo.srvRepairOrderJobs j
WHERE EXISTS (SELECT 1 FROM dbo.Legacy_JobCards jc WHERE jc.LegacyID = j.RepairOrderID);

PRINT '  ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' labour lines copied.';

-- ---------- 3. Parts lines ---------------------------------------------------
PRINT 'Copying parts lines...';

INSERT INTO dbo.Legacy_JobCardParts (
    SIRDetailId, LegacyJobCardID, SIRId,
    ItemNumber, ItemDescription,
    Qty, SalesRate, NetUnitRate, TotalAmount, TotalNetAmount, SaleTaxAmount
)
SELECT
    d.SIRDetailId,
    m.WorkOrderId,
    d.SIRId,
    d.ItemNumber,
    d.ItemDescription,
    d.Qty,
    d.SalesRate,
    d.NetUnitRate,
    d.TotalAmount,
    d.TotalNetAmount,
    d.TotalSaleTaxAmount        -- header-level tax lives in the detail, use total
FROM ssMasterVehicle.dbo.prtSIRDetail d
INNER JOIN ssMasterVehicle.dbo.prtSIRMaster m ON m.SIRId = d.SIRId
WHERE m.WorkOrderId IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.Legacy_JobCards jc WHERE jc.LegacyID = m.WorkOrderId);

PRINT '  ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' parts lines copied.';

-- ---------- 4. Sublet lines --------------------------------------------------
PRINT 'Copying sublet lines...';

INSERT INTO dbo.Legacy_JobCardSublets (
    SubletRepairDetailId, LegacyJobCardID, SubletRepairId,
    SupplierName, SupplierBillNo, BillDate,
    RepairDescription, Quantity, Rate, BillAmount, BillCost, Pst
)
SELECT
    sd.SubletRepairDetailId,
    sm.RepairOrderID,
    sm.SubletRepairId,
    sm.SupplierName,
    sm.SupplierBillNo,
    sm.BillDate,
    sd.RepairDescription,
    sd.Quantity,
    sd.Rate,
    sd.BillAmount,
    sd.BillCost,
    sd.pst
FROM ssMasterVehicle.dbo.srvRepairOrderSubLetRepairDetail sd
INNER JOIN ssMasterVehicle.dbo.srvRepairOrderSubletRepairInfo sm ON sm.SubletRepairId = sd.SubletRepairId
WHERE EXISTS (SELECT 1 FROM dbo.Legacy_JobCards jc WHERE jc.LegacyID = sm.RepairOrderID);

PRINT '  ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' sublet lines copied.';

-- ---------- 5. Vehicle master top-up ----------------------------------------
--
-- For every distinct RegistrationNumber in legacy that does NOT already
-- exist in WorkshopVehicles, insert a placeholder row. EndUserID stays NULL
-- (WorkshopVehicles.EndUserID is nullable) so we don't fabricate customer
-- links — the current customer master stays untouched. Search-by-RegNo in
-- the JC creation flow will now find these vehicles.
--
PRINT 'Topping up WorkshopVehicles from legacy reg-nos...';

INSERT INTO dbo.WorkshopVehicles (
    EndUserID, RegistrationNo, ChasisNo, EngineNo,
    BrandName, VehicleModel
)
SELECT
    NULL,
    l.RegistrationNumber,
    MAX(l.ChassisNumber),
    MAX(l.EngineNumber),
    MAX(l.VType),
    MAX(l.Model)
FROM dbo.Legacy_JobCards l
WHERE l.RegistrationNumber IS NOT NULL
  AND LEN(LTRIM(RTRIM(l.RegistrationNumber))) >= 3
  AND NOT EXISTS (
      SELECT 1 FROM dbo.WorkshopVehicles v
       WHERE LTRIM(RTRIM(v.RegistrationNo)) = LTRIM(RTRIM(l.RegistrationNumber))
  )
GROUP BY l.RegistrationNumber;

PRINT '  ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' new vehicles added to WorkshopVehicles.';

-- ---------- Summary ----------------------------------------------------------
PRINT '';
PRINT '=========================================================';
PRINT 'Legacy vehicle-history import summary';
PRINT '=========================================================';
SELECT
    (SELECT COUNT(*) FROM dbo.Legacy_JobCards)         AS Legacy_JCs,
    (SELECT COUNT(*) FROM dbo.Legacy_JobCardLabour)    AS Labour_Lines,
    (SELECT COUNT(*) FROM dbo.Legacy_JobCardParts)     AS Parts_Lines,
    (SELECT COUNT(*) FROM dbo.Legacy_JobCardSublets)   AS Sublet_Lines,
    (SELECT MIN(JobCardDate) FROM dbo.Legacy_JobCards) AS Oldest,
    (SELECT MAX(JobCardDate) FROM dbo.Legacy_JobCards) AS Newest,
    DATEDIFF(SECOND, @started, GETDATE())              AS Elapsed_Seconds;
