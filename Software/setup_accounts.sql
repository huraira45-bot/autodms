USE temp_db1;
GO

-- Ensure COA has some basic accounts if empty
IF NOT EXISTS (SELECT * FROM GLChartOFAccount)
BEGIN
    -- Level 1: Categories
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, isParent, GLNature, Companyid, Status) VALUES 
    ('1', 'ASSETS', 1, 1, 'Debit', 1, 1),
    ('2', 'LIABILITIES', 1, 1, 'Credit', 1, 1),
    ('3', 'EQUITY', 1, 1, 'Credit', 1, 1),
    ('4', 'REVENUE', 1, 1, 'Credit', 1, 1),
    ('5', 'EXPENSES', 1, 1, 'Debit', 1, 1);

    -- Level 2: Control Accounts
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, isParent, GLNature, Companyid, Status) VALUES 
    ('101', 'CASH & BANK', 2, 1, 'Debit', 1, 1),
    ('102', 'ACCOUNTS RECEIVABLE', 2, 1, 'Debit', 1, 1),
    ('103', 'INVENTORY', 2, 1, 'Debit', 1, 1),
    ('201', 'ACCOUNTS PAYABLE', 2, 1, 'Credit', 1, 1),
    ('501', 'OPERATING EXPENSES', 2, 1, 'Debit', 1, 1);

    -- Level 3: Detail Accounts
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, isParent, GLNature, Companyid, Status) VALUES 
    ('101001', 'CASH IN HAND', 3, 0, 'Debit', 1, 1),
    ('101002', 'HBL MAIN ACCOUNT', 3, 0, 'Debit', 1, 1),
    ('201001', 'TRADE CREDITORS', 3, 0, 'Credit', 1, 1),
    ('401001', 'PARTS SALES', 3, 0, 'Credit', 1, 1),
    ('501001', 'SALARIES EXPENSE', 3, 0, 'Debit', 1, 1);
END
GO

-- Voucher Entry Tables (Simplified for this module if needed, otherwise use existing)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[data_FinanceVoucherInfo]') AND type in (N'U'))
BEGIN
    CREATE TABLE data_FinanceVoucherInfo (
        VoucherID INT PRIMARY KEY IDENTITY(1,1),
        VoucherDate DATETIME DEFAULT GETDATE(),
        VoucherNo NVARCHAR(50) UNIQUE,
        VoucherTypeID INT, -- Reference to GLVoucherType
        Remarks NVARCHAR(MAX),
        TotalAmount DECIMAL(18,2),
        Posted BIT DEFAULT 0,
        EntryUserDateTime DATETIME DEFAULT GETDATE()
    );

    CREATE TABLE data_FinanceVoucherDetail (
        VoucherDetailID INT PRIMARY KEY IDENTITY(1,1),
        VoucherID INT FOREIGN KEY REFERENCES data_FinanceVoucherInfo(VoucherID),
        GLCAID INT, -- Reference to GLChartOFAccount
        Narration NVARCHAR(MAX),
        Debit DECIMAL(18,2) DEFAULT 0,
        Credit DECIMAL(18,2) DEFAULT 0
    );
END
GO
