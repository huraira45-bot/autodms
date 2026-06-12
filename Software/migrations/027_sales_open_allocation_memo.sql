/*
 * Migration 027 — Sales Module Phase 0: Open-allocation memo ledger
 *
 * Source spec: .claude/planning/sales-module-design.md §9 + decision #9 (option b).
 *
 * Memo-only / off-balance-sheet. Cars in this table are PHYSICALLY at the
 * dealership but OWNED BY MASTER until we retail-sell them.
 *
 * NEVER touches the GL. Reports query this table joined with dms_Vehicle
 * for physical-stock visibility — but the trial balance, balance sheet,
 * and P&L all ignore it.
 *
 * On retail sale of an open-allocation car, the Vehicle Sale Voucher (VSV)
 * posts the full recognition journal in one shot (no prior asset entry to
 * reverse). This memo row is marked Sold + linked to the resulting booking.
 */

SET QUOTED_IDENTIFIER ON;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_OpenAllocationLedger')
BEGIN
    CREATE TABLE dbo.dms_OpenAllocationLedger (
        LedgerID                INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        VehicleID               INT            NOT NULL,
        AllocatedToUsAt         DATETIME       NOT NULL,    -- when Master shipped to us
        PhysicalArrivalAt       DATETIME       NULL,
        Status                  NVARCHAR(20)   NOT NULL DEFAULT N'AtDealer',  -- 'AtDealer' | 'Sold' | 'ReturnedToMaster'
        -- AgeDays computed at query time in reports (GETDATE() is non-deterministic, can't persist)
        SoldAt                  DATETIME       NULL,
        SoldToBookingID         INT            NULL,        -- when sold, link to booking
        ReturnedAt              DATETIME       NULL,
        ReturnReason            NVARCHAR(MAX)  NULL,
        Notes                   NVARCHAR(MAX)  NULL,
        CreatedAt               DATETIME       NOT NULL DEFAULT GETDATE(),
        CreatedByEmployeeID     INT            NULL,
        CreatedByName           NVARCHAR(100)  NULL,
        UpdatedAt               DATETIME       NULL,
        UpdatedByEmployeeID     INT            NULL,
        CONSTRAINT FK_OpenAlloc_Vehicle FOREIGN KEY (VehicleID)       REFERENCES dbo.dms_Vehicle(VehicleID),
        CONSTRAINT FK_OpenAlloc_Booking FOREIGN KEY (SoldToBookingID) REFERENCES dbo.dms_SalesBookings(BookingID),
        CONSTRAINT CK_OpenAlloc_Status  CHECK (Status IN (N'AtDealer', N'Sold', N'ReturnedToMaster'))
    );

    CREATE INDEX IX_OpenAlloc_Vehicle ON dbo.dms_OpenAllocationLedger(VehicleID);
    CREATE INDEX IX_OpenAlloc_Status  ON dbo.dms_OpenAllocationLedger(Status, AllocatedToUsAt);
END
GO

-- Filtered unique: one active "AtDealer" memo row per VIN at a time
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_OpenAlloc_OneActivePerVehicle')
BEGIN
    CREATE UNIQUE INDEX UX_OpenAlloc_OneActivePerVehicle
        ON dbo.dms_OpenAllocationLedger(VehicleID)
        WHERE Status = N'AtDealer';
END
GO
