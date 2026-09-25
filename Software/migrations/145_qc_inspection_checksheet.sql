-- 145_qc_inspection_checksheet.sql
-- The QC Inspection Checksheet filled at delivery (owner ask 2026-09-25).
--
-- A paper sheet of 44 points in 8 sections, worked through before the car is
-- handed back. Owner's decisions, taken the same day:
--   * RECORD ONLY -- an incomplete sheet never blocks finalizing a job card.
--     The paper says "Job Cards wont be closed", but enforcing that in
--     software would strand a car whose one unconfirmed point is waiting on
--     something outside the workshop's hands.
--   * The points are EDITABLE in Workshop Settings, not fixed in code, so a
--     point can be reworded or retired without a developer.
--
-- Shape:
--   dms_QCInspectionPoints    the master list -- section, order, wording
--   dms_QCInspections         one sheet per job card, per attempt
--   dms_QCInspectionResults   one row per point on that sheet
--
-- A result stores the point's WORDING as it stood when the sheet was filled,
-- not just its id. Retiring or rewording a point later must never change what
-- a sheet signed off months ago says it checked.
--
-- Idempotent -- safe to re-run. Re-running does NOT re-seed points that were
-- deleted on purpose; the seed only fills an empty table.
SET NOCOUNT ON;

IF OBJECT_ID('dms_QCInspectionPoints', 'U') IS NULL
BEGIN
    CREATE TABLE dms_QCInspectionPoints (
        PointID     INT IDENTITY(1,1) CONSTRAINT PK_QCInspectionPoints PRIMARY KEY,
        Section     NVARCHAR(60)  NOT NULL,
        SectionSeq  INT           NOT NULL,   -- keeps sections in the paper's order
        PointSeq    INT           NOT NULL,   -- order within the section
        PointText   NVARCHAR(300) NOT NULL,
        IsActive    BIT           NOT NULL CONSTRAINT DF_QCInspectionPoints_Active DEFAULT 1,
        CreatedAt   DATETIME      NOT NULL CONSTRAINT DF_QCInspectionPoints_Created DEFAULT GETDATE(),
        UpdatedAt   DATETIME      NULL
    );
    CREATE INDEX IX_QCInspectionPoints_Order ON dms_QCInspectionPoints (IsActive, SectionSeq, PointSeq);
    PRINT '145: created dms_QCInspectionPoints.';
END
GO

IF OBJECT_ID('dms_QCInspections', 'U') IS NULL
BEGIN
    CREATE TABLE dms_QCInspections (
        InspectionID    INT IDENTITY(1,1) CONSTRAINT PK_QCInspections PRIMARY KEY,
        JobCardID       INT           NOT NULL,
        -- Copied at the time, so the sheet still reads correctly if the job
        -- card's number is later corrected.
        JobCardNo       NVARCHAR(100) NULL,
        VehicleRegNo    NVARCHAR(150) NULL,
        VehicleModel    NVARCHAR(300) NULL,
        Odometer        DECIMAL(18,2) NULL,
        Status          NVARCHAR(20)  NOT NULL CONSTRAINT DF_QCInspections_Status DEFAULT 'InProgress',
        InspectedByUserID INT         NULL,
        InspectedByName NVARCHAR(100) NULL,
        StartedAt       DATETIME      NOT NULL CONSTRAINT DF_QCInspections_Started DEFAULT GETDATE(),
        CompletedAt     DATETIME      NULL,
        Notes           NVARCHAR(1000) NULL,
        CONSTRAINT CK_QCInspections_Status CHECK (Status IN ('InProgress', 'Completed'))
    );
    CREATE INDEX IX_QCInspections_JobCard ON dms_QCInspections (JobCardID, InspectionID);
    PRINT '145: created dms_QCInspections.';
END
GO

IF OBJECT_ID('dms_QCInspectionResults', 'U') IS NULL
BEGIN
    CREATE TABLE dms_QCInspectionResults (
        ResultID     INT IDENTITY(1,1) CONSTRAINT PK_QCInspectionResults PRIMARY KEY,
        InspectionID INT           NOT NULL
                     CONSTRAINT FK_QCInspectionResults_Inspection REFERENCES dms_QCInspections (InspectionID),
        -- No FK: a point retired later must not make an old sheet unreadable.
        PointID      INT           NULL,
        Section      NVARCHAR(60)  NOT NULL,
        SectionSeq   INT           NOT NULL,
        PointSeq     INT           NOT NULL,
        -- The wording as it stood when this sheet was filled.
        PointText    NVARCHAR(300) NOT NULL,
        -- NULL means "not looked at yet" and is different from "checked and
        -- not OK"; a half-finished sheet must not read as a passed one.
        Confirmed    BIT           NULL,
        Remarks      NVARCHAR(300) NULL,
        CheckedAt    DATETIME      NULL,
        CONSTRAINT UQ_QCInspectionResults_Point UNIQUE (InspectionID, SectionSeq, PointSeq)
    );
    CREATE INDEX IX_QCInspectionResults_Inspection ON dms_QCInspectionResults (InspectionID, SectionSeq, PointSeq);
    PRINT '145: created dms_QCInspectionResults.';
END
GO

-- The 44 points from the dealership's paper sheet, in its order. Seeded only
-- into an empty table, so a re-run never resurrects a point that was retired
-- deliberately.
IF NOT EXISTS (SELECT 1 FROM dms_QCInspectionPoints)
BEGIN
    INSERT INTO dms_QCInspectionPoints (Section, SectionSeq, PointSeq, PointText) VALUES
    ('Pre Validation / Confirmation', 1, 1, 'Vehicle inspected post repair & customer complaint has been resolved'),
    ('Pre Validation / Confirmation', 1, 2, 'Road test on/for affected area was performed'),
    ('Pre Validation / Confirmation', 1, 3, 'No repeat symptom was observed during final inspection or road test'),

    ('Exterior', 2, 1, 'Alignment of body panels'),
    ('Exterior', 2, 2, 'Paint quality and finish'),
    ('Exterior', 2, 3, 'Scratches, dents or any irregular pattern'),
    ('Exterior', 2, 4, 'Bumpers fitment'),
    ('Exterior', 2, 5, 'Mirrors'),
    ('Exterior', 2, 6, 'Windshield / windows clean & damage free'),
    ('Exterior', 2, 7, 'Wipers (functional and appearance)'),

    ('Electrical', 3, 1, 'Headlights (low / high beam)'),
    ('Electrical', 3, 2, 'Parking lights'),
    ('Electrical', 3, 3, 'Turn indicators'),
    ('Electrical', 3, 4, 'Hazard lights'),
    ('Electrical', 3, 5, 'Brake lights'),
    ('Electrical', 3, 6, 'Reverse lights'),
    ('Electrical', 3, 7, 'Horn'),
    ('Electrical', 3, 8, 'Battery terminals & battery health'),

    ('Engine Compartment', 4, 1, 'Engine oil level'),
    ('Engine Compartment', 4, 2, 'Coolant level (between min and max)'),
    ('Engine Compartment', 4, 3, 'Brake fluid level'),
    ('Engine Compartment', 4, 4, 'Power steering level'),
    ('Engine Compartment', 4, 5, 'Any fluid leakage'),
    ('Engine Compartment', 4, 6, 'Belts & hoses condition'),
    ('Engine Compartment', 4, 7, 'Battery condition'),

    ('Underbody / Suspension', 5, 1, 'No oil leaks'),
    ('Underbody / Suspension', 5, 2, 'Suspension area'),
    ('Underbody / Suspension', 5, 3, 'Brake lines'),
    ('Underbody / Suspension', 5, 4, 'Exhaust system'),
    ('Underbody / Suspension', 5, 5, 'Wheel nuts torqued & tightened'),

    ('Tyres & Brakes', 6, 1, 'Tyre pressure'),
    ('Tyres & Brakes', 6, 2, 'Tyre condition'),
    ('Tyres & Brakes', 6, 3, 'Wheel alignment verified (if applicable)'),
    ('Tyres & Brakes', 6, 4, 'Parking brake functioning'),

    ('Interior', 7, 1, 'Dashboard warning lights (MIL) off'),
    ('Interior', 7, 2, 'A/C functioning'),
    ('Interior', 7, 3, 'Seat belts (functional)'),
    ('Interior', 7, 4, 'Door locks'),
    ('Interior', 7, 5, 'Power windows'),
    ('Interior', 7, 6, 'Interior cleanliness'),

    ('Road Test Verification', 8, 1, 'Engine performance'),
    ('Road Test Verification', 8, 2, 'Steering performance'),
    ('Road Test Verification', 8, 3, 'Suspension performance'),
    ('Road Test Verification', 8, 4, 'Noise or vibration');

    PRINT '145: seeded 44 inspection points.';
END
ELSE
    PRINT '145: inspection points already present - left alone.';
GO

PRINT '145_qc_inspection_checksheet complete.';
