CREATE TABLE [dbo].[addata_CustomerAdvPayment] (
    [CustomerAdvPaymentID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [PaymentDate] date NULL,
    [PartyID] int NULL,
    [Remarks] varchar(300) NULL,
    [VoucherNo] int NULL,
    [CashAmount] numeric(18,2) NULL,
    [BankAmount] numeric(18,2) NULL,
    [BankInfoID] int NULL,
    [ReferenceNo] varchar(50) NULL,
    [ReferenceDate] date NULL,
    [ReferenceAmount] numeric(18,2) NULL,
    [AccountVoucherID] int NULL,
    [BankName] nvarchar(50) NULL,
    [CustomerPaymentType] tinyint NOT NULL,
    [BranchID] int NULL,
    [JobCardID] int NULL,
    [AdvanceFrom] tinyint NULL,
    [TotalAmount] numeric(18,2) NULL
);
GO

CREATE TABLE [dbo].[addata_CustomerInfo] (
    [ProfileID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [UserId] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [PartyID] int NULL,
    [EndUserId] int NULL,
    [ChasisNo] nvarchar(150) NULL,
    [EngineNo] nvarchar(150) NULL,
    [RegistrationNo] nvarchar(150) NULL,
    [InsuranceCompany] nvarchar(150) NULL,
    [InsurancePolicyNo] nvarchar(150) NULL,
    [LossNo] nvarchar(150) NULL,
    [InvoiceNo] int NULL,
    [InvoiceDate] datetime NULL,
    [EnderUserCode] nvarchar(150) NULL,
    [Remarks] nvarchar(150) NULL,
    [InsuranceCompanyId] int NULL,
    [ColorId] int NULL,
    [BrandCode] nvarchar(150) NULL,
    [BrandName] nvarchar(150) NULL,
    [varientId] int NULL,
    [versionCode] nvarchar(150) NULL,
    [vehicleCode] nvarchar(150) NULL,
    [CustomerCode] nvarchar(150) NULL,
    [endUserName] nvarchar(150) NULL,
    [PartyName] nvarchar(150) NULL,
    [Email] nvarchar(150) NULL,
    [CNIC] nvarchar(150) NULL,
    [PhoneNo] nvarchar(150) NULL,
    [Address] nvarchar(150) NULL,
    [PartyGLID] int NULL,
    [PartyGroupID] int NULL
);
GO

CREATE TABLE [dbo].[addata_CustomerInvoiceDetailInfo] (
    [CustomerInvoiceDetailId] int NOT NULL,
    [CustomerInvoiceId] int NULL,
    [PartsId] int NULL,
    [SchduleId] int NULL,
    [Months] int NULL,
    [Advisorid] int NULL,
    [JobInfoId] int NULL,
    [TechnicianId] int NULL,
    [Price] numeric(18,3) NOT NULL,
    [Remarks] nvarchar(MAX) NULL,
    [IssueDQuantiy] numeric(18,3) NULL,
    [SuplementryJobId] int NULL,
    [SuplementryPartsId] int NULL,
    [TabId] nvarchar(150) NULL,
    [Depereciation] numeric(18,3) NULL,
    [DepAmount] numeric(18,3) NULL,
    [SalvageAmt] numeric(18,3) NULL,
    [Salvage] numeric(18,3) NULL,
    [Discount] numeric(18,3) NULL,
    [PartNumber] nvarchar(150) NULL,
    [DiscAmt] numeric(18,3) NULL,
    [StockRate] numeric(18,3) NULL,
    [PartsName] nvarchar(250) NULL,
    [PriceForGST] numeric(18,3) NOT NULL
);
GO

CREATE TABLE [dbo].[addata_CustomerInvoiceInfo] (
    [CustomerInvoiceId] int NOT NULL,
    [Date] datetime NULL,
    [JobCardId] int NULL,
    [SNO] int NULL,
    [InvoiceCode] nvarchar(50) NULL,
    [CompanyID] int NULL,
    [UserID] int NULL,
    [FiscalID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyDate] datetime NULL,
    [ModifyUserId] int NULL,
    [OutKm] numeric(18,3) NULL,
    [PaidByCustomer] numeric(18,3) NULL,
    [PaidByInsurance] numeric(18,3) NULL,
    [SumofJobs] numeric(18,3) NULL,
    [SumofParts] numeric(18,3) NULL,
    [SumofLubricants] numeric(18,3) NULL,
    [SupTotalJobs] numeric(18,3) NULL,
    [SupTotalParts] numeric(18,3) NULL,
    [GrossAmount] numeric(18,3) NULL,
    [DiscountPartsAmount] numeric(18,3) NULL,
    [DiscountPartsPercentage] numeric(18,3) NULL,
    [OtherDiscountAmount] numeric(18,3) NULL,
    [OtherDiscountPercentage] numeric(18,3) NULL,
    [TaxId] int NULL,
    [TaxPercentage] numeric(18,3) NULL,
    [TaxAmount] numeric(18,3) NULL,
    [Tax2Id] int NULL,
    [Tax2Percentage] numeric(18,3) NULL,
    [Tax2Amount] numeric(18,3) NULL,
    [LabourDiscountAmount] numeric(18,3) NULL,
    [LabourDiscountPercentage] numeric(18,3) NULL,
    [VEODAmount] numeric(18,3) NULL,
    [EwDiscount] numeric(18,3) NULL,
    [PstDiscountPercentage] numeric(18,3) NULL,
    [PstDiscountAmount] numeric(18,3) NULL,
    [SubTotal] numeric(18,3) NULL,
    [DepriciationAmount] numeric(18,3) NULL,
    [AmountOfCustomer] numeric(18,3) NULL,
    [AmountOfInsurance] numeric(18,3) NULL,
    [AccountVoucherID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NULL,
    [SumOfSubletInvoiceAmount] numeric(25,10) NOT NULL,
    [NetReceivable] numeric(25,10) NOT NULL,
    [TotalBillAmount] numeric(25,10) NOT NULL,
    [SumofPartsForGST] numeric(18,3) NOT NULL,
    [SumofLubricantsForGST] numeric(18,3) NOT NULL,
    [NumberValue] int NULL,
    [IsOld] bit NOT NULL
);
GO

CREATE TABLE [dbo].[addata_CustomerInvoiceRecovery] (
    [CustomerInvoiceRecoveryID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [CustomerInvoiceRecoveryDate] date NULL,
    [PartyID] int NULL,
    [Remarks] varchar(300) NULL,
    [CustomerInvoiceRecoveryVoucherNo] int NULL,
    [CashAmount] numeric(18,2) NULL,
    [BankAmount] numeric(18,2) NULL,
    [BankInfoID] int NULL,
    [ReferenceNo] varchar(50) NULL,
    [ReferenceDate] date NULL,
    [ReferenceAmount] numeric(18,2) NULL,
    [AccountVoucherID] int NULL,
    [BankName] nvarchar(50) NULL,
    [CustomerInvoiceRecoveryType] tinyint NOT NULL,
    [BranchID] int NULL,
    [AdjustedAdvance] numeric(18,3) NOT NULL,
    [AdvanceRemaining] numeric(18,2) NOT NULL
);
GO

CREATE TABLE [dbo].[addata_CustomerInvoiceRecoveryDetail] (
    [CustomerInvoiceRecoveryDetailID] int NOT NULL,
    [CustomerInvoiceRecoveryID] int NULL,
    [CustomerInvoiceId] int NULL,
    [CustomerInvoiceNo] int NOT NULL,
    [RecoveryAmount] numeric(18,2) NOT NULL,
    [SalvagePercentage] numeric(18,2) NOT NULL,
    [SalvageAmount] numeric(18,2) NOT NULL,
    [IncomeTaxLabour] numeric(18,2) NOT NULL,
    [IncomeTaxParts] numeric(18,2) NOT NULL,
    [PriceDifference] numeric(18,2) NOT NULL,
    [TotalDeduct] numeric(18,2) NOT NULL,
    [TotalInvoiceAmount] numeric(18,2) NOT NULL,
    [PSTAmount] numeric(18,2) NOT NULL
);
GO

CREATE TABLE [dbo].[addata_CustomerInvoiceSubletJobDetail] (
    [CustomerInvoiceSubletJobDetailID] int NOT NULL,
    [CustomerInvoiceId] int NULL,
    [VendorID] int NULL,
    [JobInfoId] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [InvoiceAmount] numeric(25,10) NULL,
    [PayableAmount] numeric(25,10) NULL,
    [SubletJobDate] date NULL
);
GO

CREATE TABLE [dbo].[addata_DispatchInformation] (
    [DispatchID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [VarientID] int NOT NULL,
    [BookingType] tinyint NULL,
    [DispatchDate] date NULL,
    [EngineNo] varchar(30) NULL,
    [ChasisNo] varchar(30) NULL,
    [ColorID] int NULL,
    [Model] varchar(20) NULL,
    [Factoryprice] numeric(12,0) NOT NULL,
    [TaxAmount] numeric(12,0) NOT NULL,
    [BranchID] int NULL,
    [PurchasePartyGlCaid] int NULL,
    [RetailPrice] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[addata_DispatchInformation_LogInfo] (
    [DispLogID] int NOT NULL,
    [DispatchID] int NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [VarientID] int NOT NULL,
    [BookingType] tinyint NULL,
    [DispatchDate] date NULL,
    [EngineNo] varchar(30) NULL,
    [ChasisNo] varchar(30) NULL,
    [ColorID] int NULL,
    [Model] varchar(20) NULL,
    [Factoryprice] numeric(12,0) NOT NULL,
    [TaxAmount] numeric(12,0) NOT NULL,
    [BranchID] int NULL,
    [PurchasePartyGlCaid] int NULL,
    [RetailPrice] numeric(18,3) NULL,
    [ModifiedType] int NULL
);
GO

CREATE TABLE [dbo].[addata_generalGatePassInfo] (
    [gatePassId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [BranchID] int NULL,
    [CustomerInvoiceId] int NULL,
    [Type] int NULL,
    [Remarks] nvarchar(300) NULL
);
GO

CREATE TABLE [dbo].[Addata_JobCardInfo] (
    [JobCardId] int NOT NULL,
    [JobCardDate] datetime NULL,
    [JobCardNo] nvarchar(100) NULL,
    [SNO] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [EstimateJob] int NULL,
    [JobCardType] int NULL,
    [VehicleRegNo] nvarchar(150) NULL,
    [ChasisNo] nvarchar(150) NULL,
    [EngineNo] nvarchar(150) NULL,
    [PartyID] int NULL,
    [PartyGLID] int NULL,
    [GLCode] nvarchar(50) NULL,
    [EndUserID] int NULL,
    [EndUserCode] nvarchar(50) NULL,
    [ColorId] int NULL,
    [BrandCode] int NULL,
    [VarientID] int NULL,
    [VersionCode] nvarchar(50) NULL,
    [VehicleCode] nvarchar(50) NULL,
    [jobCode] nvarchar(50) NULL,
    [JobTypeId] int NULL,
    [KiloMeter] decimal(18,3) NULL,
    [JobStatus] int NULL,
    [ReceiptDate] datetime NULL,
    [ReceiptTime] datetime NULL,
    [PromisedDate] datetime NULL,
    [PromisedTime] datetime NULL,
    [DeliveryDate] datetime NULL,
    [DeliveryTime] datetime NULL,
    [PartyGroupID] int NULL,
    [CompanyID] int NULL,
    [UserID] int NULL,
    [FiscalID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyDate] datetime NULL,
    [ModifyUserId] int NULL,
    [JobEstApprovalId] int NULL,
    [Status] nvarchar(50) NULL,
    [NumberValue] int NULL,
    [IsOld] bit NOT NULL
);
GO

CREATE TABLE [dbo].[Addata_JobCardInfocheckboxDetail] (
    [DetailcheckboxId] int NOT NULL,
    [JobCardId] int NULL,
    [PartsId] int NULL,
    [SchduleId] int NULL,
    [Months] int NULL,
    [Advisorid] int NULL,
    [JobInfoId] int NULL,
    [TechnicianId] int NULL,
    [Price] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [Quantity] numeric(18,3) NULL,
    [SuplementryJobId] int NULL,
    [SuplementryPartsId] int NULL,
    [TabId] nvarchar(150) NULL,
    [Depereciation] numeric(18,3) NULL,
    [DepAmount] numeric(18,3) NULL,
    [SalvageAmt] numeric(18,3) NULL,
    [Salvage] numeric(18,3) NULL,
    [Discount] numeric(18,3) NULL,
    [PartNumber] nvarchar(150) NULL,
    [DiscAmt] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[Addata_JobCardInfoDetail] (
    [DetailId] int NOT NULL,
    [JobCardId] int NULL,
    [PartsId] int NULL,
    [SchduleId] int NULL,
    [Months] int NULL,
    [Advisorid] int NULL,
    [JobInfoId] int NULL,
    [TechnicianId] int NULL,
    [Price] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [Quantity] numeric(18,3) NULL,
    [SuplementryJobId] int NULL,
    [SuplementryPartsId] int NULL,
    [TabId] nvarchar(150) NULL,
    [Depereciation] numeric(18,3) NULL,
    [DepAmount] numeric(18,3) NULL,
    [SalvageAmt] numeric(18,3) NULL,
    [Salvage] numeric(18,3) NULL,
    [Discount] numeric(18,3) NULL,
    [PartNumber] nvarchar(150) NULL,
    [DiscAmt] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[Addata_JobCardInfoDetailLog] (
    [DetailLogId] int NOT NULL,
    [JobCardLogId] int NULL,
    [DetailId] int NULL,
    [JobCardId] int NULL,
    [PartsId] int NULL,
    [SchduleId] int NULL,
    [Months] int NULL,
    [Advisorid] int NULL,
    [JobInfoId] int NULL,
    [TechnicianId] int NULL,
    [Price] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [Quantity] numeric(18,3) NULL,
    [SuplementryJobId] int NULL,
    [SuplementryPartsId] int NULL,
    [TabId] nvarchar(150) NULL,
    [Depereciation] numeric(18,3) NULL,
    [DepAmount] numeric(18,3) NULL,
    [SalvageAmt] numeric(18,3) NULL,
    [Salvage] numeric(18,3) NULL,
    [Discount] numeric(18,3) NULL,
    [PartNumber] nvarchar(150) NULL,
    [DiscAmt] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[Addata_JobCardInfoLog] (
    [JobCardLogId] int NOT NULL,
    [JobCardId] int NULL,
    [JobCardDate] datetime NULL,
    [JobCardNo] nvarchar(100) NULL,
    [SNO] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [EstimateJob] int NULL,
    [JobCardType] int NULL,
    [VehicleRegNo] nvarchar(150) NULL,
    [ChasisNo] nvarchar(150) NULL,
    [EngineNo] nvarchar(150) NULL,
    [PartyID] int NULL,
    [PartyGLID] int NULL,
    [GLCode] nvarchar(50) NULL,
    [EndUserID] int NULL,
    [EndUserCode] nvarchar(50) NULL,
    [ColorId] int NULL,
    [BrandCode] int NULL,
    [VarientID] int NULL,
    [VersionCode] nvarchar(50) NULL,
    [VehicleCode] nvarchar(50) NULL,
    [jobCode] nvarchar(50) NULL,
    [JobTypeId] int NULL,
    [KiloMeter] decimal(18,3) NULL,
    [JobStatus] int NULL,
    [ReceiptDate] datetime NULL,
    [ReceiptTime] datetime NULL,
    [PromisedDate] datetime NULL,
    [PromisedTime] datetime NULL,
    [DeliveryDate] datetime NULL,
    [DeliveryTime] datetime NULL,
    [PartyGroupID] int NULL,
    [CompanyID] int NULL,
    [UserID] int NULL,
    [FiscalID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyDate] datetime NULL,
    [ModifyUserId] int NULL,
    [JobEstApprovalId] int NULL,
    [Status] nvarchar(50) NULL,
    [ModifiedType] int NULL
);
GO

CREATE TABLE [dbo].[Addata_JobCardInfolubricantDetail] (
    [DetaillubricantId] int NOT NULL,
    [JobCardId] int NULL,
    [PartsId] int NULL,
    [SchduleId] int NULL,
    [Months] int NULL,
    [Advisorid] int NULL,
    [JobInfoId] int NULL,
    [TechnicianId] int NULL,
    [Price] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [Quantity] numeric(18,3) NULL,
    [SuplementryJobId] int NULL,
    [SuplementryPartsId] int NULL,
    [TabId] nvarchar(150) NULL,
    [Depereciation] numeric(18,3) NULL,
    [DepAmount] numeric(18,3) NULL,
    [SalvageAmt] numeric(18,3) NULL,
    [Salvage] numeric(18,3) NULL,
    [Discount] numeric(18,3) NULL,
    [PartNumber] nvarchar(150) NULL,
    [DiscAmt] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[Addata_JobCardInfoPartsDetail] (
    [DetailPartsId] int NOT NULL,
    [JobCardId] int NULL,
    [PartsId] int NULL,
    [SchduleId] int NULL,
    [Months] int NULL,
    [Advisorid] int NULL,
    [JobInfoId] int NULL,
    [TechnicianId] int NULL,
    [Price] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [Quantity] numeric(18,3) NULL,
    [SuplementryJobId] int NULL,
    [SuplementryPartsId] int NULL,
    [TabId] nvarchar(150) NULL,
    [Depereciation] numeric(18,3) NULL,
    [DepAmount] numeric(18,3) NULL,
    [SalvageAmt] numeric(18,3) NULL,
    [Salvage] numeric(18,3) NULL,
    [Discount] numeric(18,3) NULL,
    [PartNumber] nvarchar(150) NULL,
    [DiscAmt] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[Addata_JobCardInfosubjobDetail] (
    [DetailsubjobId] int NOT NULL,
    [JobCardId] int NULL,
    [PartsId] int NULL,
    [SchduleId] int NULL,
    [Months] int NULL,
    [Advisorid] int NULL,
    [JobInfoId] int NULL,
    [TechnicianId] int NULL,
    [Price] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [Quantity] numeric(18,3) NULL,
    [SuplementryJobId] int NULL,
    [SuplementryPartsId] int NULL,
    [TabId] nvarchar(150) NULL,
    [Depereciation] numeric(18,3) NULL,
    [DepAmount] numeric(18,3) NULL,
    [SalvageAmt] numeric(18,3) NULL,
    [Salvage] numeric(18,3) NULL,
    [Discount] numeric(18,3) NULL,
    [PartNumber] nvarchar(150) NULL,
    [DiscAmt] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[Addata_JobCardInfoSubletJobDetail] (
    [SubletJobDetailID] int NOT NULL,
    [JobCardId] int NULL,
    [VendorID] int NULL,
    [JobInfoId] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [InvoiceAmount] numeric(25,10) NULL,
    [PayableAmount] numeric(25,10) NULL,
    [SubletJobDate] date NULL
);
GO

CREATE TABLE [dbo].[Addata_JobCardInfosubpartsDetail] (
    [DetailsubpartsId] int NOT NULL,
    [JobCardId] int NULL,
    [PartsId] int NULL,
    [SchduleId] int NULL,
    [Months] int NULL,
    [Advisorid] int NULL,
    [JobInfoId] int NULL,
    [TechnicianId] int NULL,
    [Price] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [SuplementryJobId] int NULL,
    [SuplementryPartsId] int NULL,
    [TabId] nvarchar(150) NULL,
    [Depereciation] numeric(18,3) NULL,
    [DepAmount] numeric(18,3) NULL,
    [SalvageAmt] numeric(18,3) NULL,
    [Salvage] numeric(18,3) NULL,
    [Discount] numeric(18,3) NULL,
    [PartNumber] nvarchar(150) NULL,
    [DiscAmt] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[addata_JobStatusInfo] (
    [Seriel] int NOT NULL,
    [Value] int NOT NULL,
    [Type] nvarchar(50) NULL,
    [AttachedCharacter] nvarchar(10) NULL
);
GO

CREATE TABLE [dbo].[addata_RecoveryDetail] (
    [RecoveryDetailID] int NOT NULL,
    [RecoveryID] int NULL,
    [SaleID] int NULL,
    [RecoveryAmount] numeric(18,2) NOT NULL,
    [PSTWithHeld] numeric(18,2) NOT NULL,
    [DepricaitionDeduction] numeric(18,2) NOT NULL,
    [Salvage] numeric(18,2) NOT NULL,
    [IncomeTaxLabour] numeric(18,2) NOT NULL,
    [IncomeTaxParts] numeric(18,2) NOT NULL
);
GO

CREATE TABLE [dbo].[addata_RecoveryInfo] (
    [RecoveryID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [RecoveryDate] date NULL,
    [PartyID] int NULL,
    [Remarks] varchar(300) NULL,
    [RecoveryVoucherNo] int NULL,
    [CashAmount] numeric(18,2) NULL,
    [BankAmount] numeric(18,2) NULL,
    [BankInfoID] int NULL,
    [ReferenceNo] varchar(50) NULL,
    [ReferenceDate] date NULL,
    [ReferenceAmount] numeric(18,2) NULL,
    [AccountVoucherID] int NULL,
    [BankName] nvarchar(50) NULL,
    [RecoveryType] tinyint NOT NULL,
    [BranchID] int NULL
);
GO

CREATE TABLE [dbo].[addata_SaleDetail] (
    [SaleDetailID] int NOT NULL,
    [SaleID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [NetAmount] numeric(18,3) NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [DiscountAmountTwo] decimal(18,3) NOT NULL
);
GO

CREATE TABLE [dbo].[addata_SaleInfo] (
    [SaleID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SaleDate] date NULL,
    [PartyID] int NULL,
    [Remarks] varchar(300) NULL,
    [NetAmount] numeric(18,2) NULL,
    [SaleVoucherNo] int NULL,
    [JobCardNumber] nvarchar(50) NULL,
    [BillNo] nvarchar(50) NULL,
    [BranchID] int NULL
);
GO

CREATE TABLE [dbo].[addata_StockReturnFromJobCardInfo] (
    [StockReturnID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [ReturnDate] date NULL,
    [ReturnNo] int NULL,
    [ReturnFromWHID] int NULL,
    [ReturnBranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [AccountVoucherID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [SRNo] nvarchar(50) NULL,
    [SRDate] datetime NULL,
    [JobCardId] int NULL,
    [JobCardNo] nvarchar(50) NULL,
    [InvoiceNo] nvarchar(50) NULL,
    [SourceNo] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[addata_StockReturnFromJobCardInfoDetail] (
    [StockReturnDetailID] int NOT NULL,
    [StockReturnID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NULL,
    [ReturnQuantity] numeric(18,3) NULL,
    [IssueQuantity] numeric(18,3) NULL,
    [TechnicainId] int NULL,
    [LocationID] int NULL,
    [ItemRate] numeric(18,3) NOT NULL
);
GO

CREATE TABLE [dbo].[addata_TrackerAssigmentDetail] (
    [TrackerAssigmentDetailID] int NOT NULL,
    [TrackerAssigmentID] int NULL,
    [ItemId] int NULL,
    [ReplaceItemId] int NULL,
    [VehicleRegistrationID] int NULL,
    [Quantity] numeric(18,3) NULL,
    [ItemRate] numeric(18,3) NULL,
    [NetAmount] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [Remarks] nvarchar(300) NULL,
    [MOHitemId] int NULL,
    [ReplaceMOHid] int NULL,
    [isRemoved] bit NULL
);
GO

CREATE TABLE [dbo].[addata_TrackerAssigmentDetailParams] (
    [TrackerAssigmentParamsID] int NOT NULL,
    [TrackerAssigmentDetailID] int NOT NULL,
    [TrackerAssigmentID] int NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[addata_TrackerAssigmentDetailParamsIn] (
    [TrackerAssigmentParamsID] int NOT NULL,
    [TrackerAssigmentDetailID] int NOT NULL,
    [TrackerAssigmentID] int NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[addata_TrackerAssigmentDetailTax] (
    [TrackerAssigmentDetailTaxID] int NOT NULL,
    [TrackerAssigmentDetailID] int NULL,
    [TrackerAssigmentID] int NULL,
    [TaxID] int NULL,
    [TaxPercentage] decimal(18,3) NULL,
    [TaxAmountPerUnit] decimal(18,3) NULL,
    [TaxAmount] decimal(18,3) NULL
);
GO

CREATE TABLE [dbo].[addata_TrackerAssigmentinfo] (
    [TrackerAssigmentID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [TrackerAssigmentDate] date NULL,
    [TrackerType] varchar(50) NULL,
    [InvoiceType] varchar(100) NULL,
    [PartyID] int NOT NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NULL,
    [NetAmount] numeric(18,2) NOT NULL,
    [TrackerAssigmentVoucherNo] int NULL,
    [WHID] int NULL,
    [AccountVoucherID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [StockIOID] int NULL,
    [StockIOIDIn] int NULL,
    [TechnicianID] int NULL,
    [TechnicianFee] numeric(18,3) NULL,
    [SaleManId] int NULL,
    [SalesManFee] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[addata_TrackerRedoDetail] (
    [DetailID] int NOT NULL,
    [RenewID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [NetAmount] numeric(18,3) NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [DiscountAmountTwo] decimal(18,3) NOT NULL
);
GO

CREATE TABLE [dbo].[addata_TrackerRedoDetailParams] (
    [TrackerRedoDetailParamsID] int NOT NULL,
    [RenewDetailID] int NOT NULL,
    [RenewID] int NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[addata_TrackerRedoInfo] (
    [RenewID] int NOT NULL,
    [RemovalVchNo] int NULL,
    [RDate] datetime NULL,
    [TrackerMohItemID] int NULL,
    [BranchID] int NULL,
    [CompanyID] int NULL,
    [fiscalId] int NULL,
    [UserID] int NULL,
    [EnteryDate] datetime NULL,
    [ModifyDate] datetime NULL,
    [TechnicianID] int NULL,
    [SalesManId] int NULL,
    [MFGId] int NULL,
    [MFGOHId] int NULL,
    [AssignmentId] int NULL,
    [AccountVchId] int NULL,
    [isTaxable] bit NULL,
    [PartyID] int NULL,
    [DiscountType] int NULL,
    [DiscountPercent] numeric(18,3) NULL,
    [DiscountAmount] numeric(18,3) NULL,
    [Remarks] nvarchar(500) NULL,
    [NetAmount] numeric(18,3) NULL,
    [Whid] int NULL,
    [PartyName] nvarchar(500) NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleBookingInfo] (
    [Seriel] int NOT NULL,
    [Value] int NOT NULL,
    [BookingType] nvarchar(50) NULL,
    [AttachedCharacter] nvarchar(10) NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleCommitmentDetail] (
    [SaleDetailID] int NOT NULL,
    [CommitmentID] int NULL,
    [SaleServiceInfoID] int NULL,
    [SaleServiceAmount] numeric(10,0) NULL,
    [SaleServiceCostAmount] numeric(10,0) NOT NULL,
    [VendorId] int NULL,
    [IncomeHead] int NULL,
    [Remarks] nvarchar(200) NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleCommitmentInformation] (
    [CommitmentID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [VarientID] int NOT NULL,
    [BookingType] tinyint NULL,
    [SaleDate] date NULL,
    [EngineNo] varchar(30) NULL,
    [ChasisNo] varchar(30) NULL,
    [ColorID] int NULL,
    [Model] varchar(20) NULL,
    [AccountVoucherID] int NULL,
    [Factoryprice] numeric(12,0) NOT NULL,
    [TaxAmount] numeric(12,0) NOT NULL,
    [PartyID] int NOT NULL,
    [ReceiveID] int NULL,
    [GrossAmount] numeric(12,0) NOT NULL,
    [DiscountAmount] numeric(12,0) NOT NULL,
    [PremiumAmount] numeric(12,0) NOT NULL,
    [BranchID] int NULL,
    [PartialPayment] numeric(18,0) NULL,
    [PakSuzukiInvoiceNo] nvarchar(50) NULL,
    [DeliveredTo] nvarchar(50) NULL,
    [DeliveryDate] date NULL,
    [InvoiceDate] date NULL,
    [BookingNumber] nvarchar(50) NULL,
    [BookingDate] datetime NULL,
    [ddCash] numeric(12,0) NULL,
    [DDNumber] numeric(18,2) NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleDeliveryInfo] (
    [VehicleDeliveryID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SaleID] int NULL,
    [VarientID] int NULL,
    [DeliveryDate] datetime NULL,
    [ChasisNO] nvarchar(50) NULL,
    [EngineNO] nvarchar(50) NULL,
    [ReceiverName] nvarchar(50) NULL,
    [ReceiverCNICNo] nvarchar(50) NULL,
    [ReceiverContactNO] nvarchar(50) NULL,
    [ReceiverAdress] nvarchar(50) NULL,
    [PartyID] int NULL,
    [BranchID] int NULL,
    [Image] nvarchar(MAX) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [SFI] int NULL,
    [FFIDays] int NULL,
    [FFI] int NULL,
    [SFIDays] int NULL,
    [Vehicle] int NULL,
    [VehicleAmount] numeric(18,2) NULL
);
GO

CREATE TABLE [dbo].[addata_VehiclePaperInHandtInformation] (
    [RegisterID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [VarientID] int NOT NULL,
    [BookingType] tinyint NULL,
    [SaleDate] date NULL,
    [EngineNo] varchar(30) NULL,
    [ChasisNo] varchar(30) NULL,
    [ColorID] int NULL,
    [Model] varchar(20) NULL,
    [Factoryprice] numeric(12,0) NOT NULL,
    [TaxAmount] numeric(12,0) NOT NULL,
    [PartyID] int NOT NULL,
    [ReceiveID] int NULL,
    [GrossAmount] numeric(12,0) NOT NULL,
    [DiscountAmount] numeric(12,0) NOT NULL,
    [PremiumAmount] numeric(12,0) NOT NULL,
    [BranchID] int NULL,
    [PartialPayment] numeric(18,0) NULL,
    [PakSuzukiInvoiceNo] nvarchar(50) NULL,
    [DeliveredTo] nvarchar(50) NULL,
    [DeliveryDate] date NULL,
    [InvoiceDate] date NULL,
    [SaleID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [RegistrationNo] nvarchar(200) NULL,
    [FileNo] nvarchar(200) NULL,
    [OrginalCopyNo] nvarchar(200) NULL
);
GO

CREATE TABLE [dbo].[addata_VehiclePaymentDetail] (
    [PaymentDetailID] int NOT NULL,
    [PaymentID] int NULL,
    [BankInfoID] int NULL,
    [ReferenceNo] nvarchar(MAX) NULL,
    [Amount] numeric(12,0) NULL
);
GO

CREATE TABLE [dbo].[addata_VehiclePaymentInformation] (
    [PaymentID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [ChasisNo] varchar(30) NULL,
    [PaymentDate] date NULL,
    [AccountVoucherID] int NULL,
    [CashAmount] numeric(12,0) NOT NULL,
    [SaleID] int NULL,
    [PartyID] int NULL,
    [BranchID] int NULL,
    [Remarks] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleReceiveInformation] (
    [ReceiveID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [VarientID] int NOT NULL,
    [BookingType] tinyint NULL,
    [ReceiveDate] date NULL,
    [EngineNo] varchar(30) NULL,
    [ChasisNo] varchar(30) NULL,
    [ColorID] int NULL,
    [Model] varchar(20) NULL,
    [AccountVoucherID] int NULL,
    [Factoryprice] numeric(12,0) NOT NULL,
    [TaxAmount] numeric(12,0) NULL,
    [BranchID] int NULL,
    [RetailPrice] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleReceiveInformation_LogInfo] (
    [ReceiveLogID] int NOT NULL,
    [ReceiveID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [VarientID] int NOT NULL,
    [BookingType] tinyint NULL,
    [ReceiveDate] date NULL,
    [EngineNo] varchar(30) NULL,
    [ChasisNo] varchar(30) NULL,
    [ColorID] int NULL,
    [Model] varchar(20) NULL,
    [AccountVoucherID] int NULL,
    [Factoryprice] numeric(12,0) NOT NULL,
    [TaxAmount] numeric(12,0) NOT NULL,
    [BranchID] int NULL,
    [RetailPrice] numeric(18,3) NULL,
    [ModifiedType] int NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleRecoveryDetail] (
    [RecoveryDetailID] int NOT NULL,
    [RecoveryID] int NULL,
    [BankInfoID] int NULL,
    [ReferenceNo] varchar(30) NULL,
    [Amount] numeric(12,0) NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleRecoveryDetailLog] (
    [RecoveryDetailLogID] int NOT NULL,
    [RecoveryLogID] int NULL,
    [RecoveryDetailID] int NULL,
    [RecoveryID] int NULL,
    [BankInfoID] int NULL,
    [ReferenceNo] varchar(30) NULL,
    [Amount] numeric(12,0) NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleRecoveryInfoLog] (
    [RecoveryLogID] int NOT NULL,
    [RecoveryID] int NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [ChasisNo] varchar(30) NULL,
    [RecoveryDate] date NULL,
    [AccountVoucherID] int NULL,
    [CashAmount] numeric(12,0) NOT NULL,
    [SaleID] int NULL,
    [AccountPosting] bit NOT NULL,
    [BranchID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [fileNo] nvarchar(50) NULL,
    [LeasePlan] nvarchar(MAX) NULL,
    [LeaseAmount] numeric(18,3) NULL,
    [ModifiedType] int NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleRecoveryInformation] (
    [RecoveryID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [ChasisNo] varchar(30) NULL,
    [RecoveryDate] date NULL,
    [AccountVoucherID] int NULL,
    [CashAmount] numeric(12,0) NOT NULL,
    [SaleID] int NULL,
    [AccountPosting] bit NOT NULL,
    [BranchID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [fileNo] nvarchar(50) NULL,
    [LeasePlan] nvarchar(MAX) NULL,
    [LeaseAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleSaleDetail] (
    [SaleDetailID] int NOT NULL,
    [SaleID] int NULL,
    [SaleServiceInfoID] int NULL,
    [SaleServiceAmount] numeric(10,0) NULL,
    [SaleServiceCostAmount] numeric(10,0) NOT NULL,
    [VendorId] int NULL,
    [IncomeHead] int NULL,
    [Remarks] nvarchar(200) NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleSaleDetailLog] (
    [SaleDetailLogID] int NOT NULL,
    [SaleDetailID] int NULL,
    [SaleLogID] int NULL,
    [SaleID] int NULL,
    [SaleServiceInfoID] int NULL,
    [SaleServiceAmount] numeric(10,0) NULL,
    [SaleServiceCostAmount] numeric(10,0) NOT NULL,
    [VendorId] int NULL,
    [IncomeHead] int NULL,
    [Remarks] nvarchar(200) NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleSaleInfoLog] (
    [SaleLogID] int NOT NULL,
    [SaleID] int NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [VarientID] int NOT NULL,
    [BookingType] tinyint NULL,
    [SaleDate] date NULL,
    [EngineNo] varchar(30) NULL,
    [ChasisNo] varchar(30) NULL,
    [ColorID] int NULL,
    [Model] varchar(20) NULL,
    [AccountVoucherID] int NULL,
    [Factoryprice] numeric(12,0) NOT NULL,
    [TaxAmount] numeric(12,0) NOT NULL,
    [PartyID] int NOT NULL,
    [ReceiveID] int NULL,
    [GrossAmount] numeric(12,0) NOT NULL,
    [DiscountAmount] numeric(12,0) NOT NULL,
    [PremiumAmount] numeric(12,0) NOT NULL,
    [BranchID] int NULL,
    [PartialPayment] numeric(18,0) NULL,
    [PakSuzukiInvoiceNo] nvarchar(50) NULL,
    [DeliveredTo] nvarchar(50) NULL,
    [DeliveryDate] date NULL,
    [InvoiceDate] date NULL,
    [CommitmentId] int NULL,
    [KeyNumber] nvarchar(50) NULL,
    [fileNo] nvarchar(250) NULL,
    [LeasePlan] nvarchar(MAX) NULL,
    [LeaseAmount] numeric(18,3) NULL,
    [BankerCommission] numeric(18,3) NULL,
    [InvoiceType] int NULL,
    [RetailPrice] numeric(18,3) NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NULL,
    [ModifiedType] int NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleSaleInformation] (
    [SaleID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [VarientID] int NOT NULL,
    [BookingType] tinyint NULL,
    [SaleDate] date NULL,
    [EngineNo] varchar(30) NULL,
    [ChasisNo] varchar(30) NULL,
    [ColorID] int NULL,
    [Model] varchar(20) NULL,
    [AccountVoucherID] int NULL,
    [Factoryprice] numeric(12,0) NOT NULL,
    [TaxAmount] numeric(12,0) NOT NULL,
    [PartyID] int NOT NULL,
    [ReceiveID] int NULL,
    [GrossAmount] numeric(12,0) NOT NULL,
    [DiscountAmount] numeric(12,0) NOT NULL,
    [PremiumAmount] numeric(12,0) NOT NULL,
    [BranchID] int NULL,
    [PartialPayment] numeric(18,0) NULL,
    [PakSuzukiInvoiceNo] nvarchar(50) NULL,
    [DeliveredTo] nvarchar(50) NULL,
    [DeliveryDate] date NULL,
    [InvoiceDate] date NULL,
    [CommitmentId] int NULL,
    [KeyNumber] nvarchar(50) NULL,
    [fileNo] nvarchar(250) NULL,
    [LeasePlan] nvarchar(MAX) NULL,
    [LeaseAmount] numeric(18,3) NULL,
    [BankerCommission] numeric(18,3) NULL,
    [InvoiceType] int NULL,
    [RetailPrice] numeric(18,3) NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NULL,
    [PartyType] int NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleServicesPaymentDetail] (
    [SaleDetailID] int NOT NULL,
    [SaleID] int NULL,
    [SaleServiceInfoID] int NULL,
    [SaleServiceAmount] numeric(10,0) NULL,
    [SaleServiceCostAmount] numeric(10,0) NOT NULL,
    [VendorId] int NULL,
    [IncomeHead] int NULL,
    [Remarks] nvarchar(200) NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleServicesPaymentInformation] (
    [RecoveryID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [VarientID] int NOT NULL,
    [BookingType] tinyint NULL,
    [SaleDate] date NULL,
    [EngineNo] varchar(30) NULL,
    [ChasisNo] varchar(30) NULL,
    [ColorID] int NULL,
    [Model] varchar(20) NULL,
    [AccountVoucherID] int NULL,
    [Factoryprice] numeric(12,0) NOT NULL,
    [TaxAmount] numeric(12,0) NOT NULL,
    [PartyID] int NOT NULL,
    [ReceiveID] int NULL,
    [GrossAmount] numeric(12,0) NOT NULL,
    [DiscountAmount] numeric(12,0) NOT NULL,
    [PremiumAmount] numeric(12,0) NOT NULL,
    [BranchID] int NULL,
    [PartialPayment] numeric(18,0) NULL,
    [PakSuzukiInvoiceNo] nvarchar(50) NULL,
    [DeliveredTo] nvarchar(50) NULL,
    [DeliveryDate] date NULL,
    [InvoiceDate] date NULL,
    [SaleID] int NULL
);
GO

CREATE TABLE [dbo].[addata_VehicleTransferInformation] (
    [VehicleTransferID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [VarientID] int NOT NULL,
    [BookingType] tinyint NULL,
    [TransferDate] date NULL,
    [EngineNo] varchar(30) NULL,
    [ChasisNo] varchar(30) NULL,
    [ColorID] int NULL,
    [Model] varchar(20) NULL,
    [AccountVoucherID] int NULL,
    [Factoryprice] numeric(12,0) NOT NULL,
    [TaxAmount] numeric(12,0) NOT NULL,
    [TransferedTo] varchar(200) NULL,
    [ReceiveID] int NULL,
    [BranchID] int NULL
);
GO

CREATE TABLE [dbo].[adgen_ActivityTypeInfo] (
    [ActivityTypeId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [ActivityCode] nvarchar(50) NULL,
    [Description] nvarchar(300) NULL
);
GO

CREATE TABLE [dbo].[adgen_ColorInfo] (
    [ColorID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [ColorTitle] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[adgen_InsuranceJobEstApprovalDetail] (
    [JobEstApprovalDetailId] int NOT NULL,
    [JobEstApprovalId] int NOT NULL,
    [JobId] int NULL,
    [Remarks] nvarchar(50) NULL,
    [LabourRate] numeric(18,3) NULL,
    [ItemId] int NULL,
    [Quantity] int NULL,
    [Depreciation] numeric(18,3) NULL,
    [DepriciationAmount] numeric(18,3) NULL,
    [Price] numeric(18,3) NULL,
    [Total] numeric(18,3) NULL,
    [TabName] nvarchar(50) NULL,
    [Discount] numeric(18,3) NULL,
    [Salvage] numeric(18,3) NULL,
    [DiscountAmount] numeric(18,3) NULL,
    [SalvageAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[adgen_InsuranceJobEstApprovalPartsDetail] (
    [JobEstApprovalpartsDetailId] int NOT NULL,
    [JobEstApprovalId] int NOT NULL,
    [JobId] int NULL,
    [Remarks] nvarchar(50) NULL,
    [LabourRate] numeric(18,3) NULL,
    [ItemId] int NULL,
    [Quantity] int NULL,
    [Depreciation] numeric(18,3) NULL,
    [DepriciationAmount] numeric(18,3) NULL,
    [Price] numeric(18,3) NULL,
    [Total] numeric(18,3) NULL,
    [TabName] nvarchar(50) NULL,
    [Discount] numeric(18,3) NULL,
    [Salvage] numeric(18,3) NULL,
    [DiscountAmount] numeric(18,3) NULL,
    [SalvageAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[adgen_InsuranceJobEstApprovalsubjobDetail] (
    [JobEstApprovalsubjobDetailId] int NOT NULL,
    [JobEstApprovalId] int NOT NULL,
    [JobId] int NULL,
    [Remarks] nvarchar(50) NULL,
    [LabourRate] numeric(18,3) NULL,
    [ItemId] int NULL,
    [Quantity] int NULL,
    [Depreciation] numeric(18,3) NULL,
    [DepriciationAmount] numeric(18,3) NULL,
    [Price] numeric(18,3) NULL,
    [Total] numeric(18,3) NULL,
    [TabName] nvarchar(50) NULL,
    [Discount] numeric(18,3) NULL,
    [Salvage] numeric(18,3) NULL,
    [DiscountAmount] numeric(18,3) NULL,
    [SalvageAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[adgen_InsuranceJobEstApprovalsubPartsDetail] (
    [JobEstApprovalsubpartsDetailId] int NOT NULL,
    [JobEstApprovalId] int NOT NULL,
    [JobId] int NULL,
    [Remarks] nvarchar(50) NULL,
    [LabourRate] numeric(18,3) NULL,
    [ItemId] int NULL,
    [Quantity] int NULL,
    [Depreciation] numeric(18,3) NULL,
    [DepriciationAmount] numeric(18,3) NULL,
    [Price] numeric(18,3) NULL,
    [Total] numeric(18,3) NULL,
    [TabName] nvarchar(50) NULL,
    [Discount] numeric(18,3) NULL,
    [Salvage] numeric(18,3) NULL,
    [DiscountAmount] numeric(18,3) NULL,
    [SalvageAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[adgen_InsuranceJobEstimateDetail] (
    [JobEstimateDetailId] int NOT NULL,
    [JobEstimateId] int NULL,
    [JobId] int NULL,
    [Remarks] nvarchar(50) NULL,
    [LabourRate] numeric(18,3) NULL,
    [ItemId] int NULL,
    [Quantity] int NULL,
    [Depreciation] numeric(18,3) NULL,
    [DepriciationAmount] numeric(18,3) NULL,
    [Price] numeric(18,3) NULL,
    [Total] numeric(18,3) NULL,
    [TabName] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[adgen_InsuranceJobEstimateInfo] (
    [JobEstimateId] int NOT NULL,
    [JobEstimateCode] nvarchar(50) NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [JobCardId] int NULL,
    [ZoneId] int NULL,
    [StationId] int NULL,
    [PolicyNo] nvarchar(50) NULL,
    [Certificate] nvarchar(50) NULL,
    [LossNo] nvarchar(50) NULL,
    [VOD] nvarchar(50) NULL,
    [Surveyor] nvarchar(50) NULL,
    [Remarks] nvarchar(50) NULL,
    [SNO] int NULL,
    [Date] datetime NULL,
    [InsuredBy] int NULL,
    [InsuranceBranch] int NULL,
    [Approved] bit NULL,
    [PartyID] int NULL,
    [ProfileID] int NULL
);
GO

CREATE TABLE [dbo].[adgen_InsuranceJobEstimatePartsDetail] (
    [JobEstimatePartsDetailId] int NOT NULL,
    [JobEstimateId] int NULL,
    [ItemId] int NULL,
    [Quantity] int NULL,
    [Depreciation] numeric(18,3) NULL,
    [DepriciationAmount] numeric(18,3) NULL,
    [Price] numeric(18,3) NULL,
    [Total] numeric(18,3) NULL,
    [TabName] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[adgen_JobCardTypeBilling] (
    [BillingID] int NOT NULL,
    [EntryUserID] int NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [BillDate] datetime NULL,
    [JobCardTypeId] int NULL,
    [Remarks] nvarchar(500) NULL,
    [PSMCNO] nvarchar(50) NULL,
    [GrossAmount] decimal(18,2) NOT NULL,
    [GSTAmount] decimal(18,2) NOT NULL,
    [PSTAmount] decimal(18,2) NOT NULL,
    [NetAmount] decimal(18,2) NOT NULL,
    [GSTId] int NULL,
    [PSTId] int NULL,
    [VoucherNo] int NULL,
    [IsTaxable] bit NOT NULL,
    [JobCardId] int NULL,
    [PromotionalTax] decimal(18,2) NOT NULL,
    [DateFrom] datetime NULL,
    [DateTo] datetime NULL,
    [AccountVoucherID] int NULL,
    [LaborTotal] decimal(18,2) NULL,
    [PartsTotal] decimal(18,2) NULL,
    [PartsAmountForGST] decimal(18,2) NOT NULL
);
GO

CREATE TABLE [dbo].[adgen_JobCardTypeBillingDetail] (
    [BillingDetailID] int NOT NULL,
    [BillingID] int NULL,
    [Labour] decimal(18,2) NULL,
    [JobCardTypeId] int NULL,
    [JobCardNo] int NULL,
    [ChasisNo] nvarchar(50) NULL,
    [JobTypeId] int NULL,
    [JobDate] datetime NULL,
    [JobCardId] int NULL,
    [LaborAmount] decimal(18,2) NULL,
    [PartsAmount] decimal(18,2) NULL,
    [DMISJobCardNo] nvarchar(50) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [PartsAmountForGST] decimal(18,2) NOT NULL
);
GO

CREATE TABLE [dbo].[adgen_JobCardTypeBillingRecovery] (
    [JobCardTypeBillingRecoveryID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [RecoveryDate] date NULL,
    [JobCardTypeId] int NULL,
    [RecoveryVoucherNo] int NULL,
    [DateFrom] date NULL,
    [DateTo] date NULL,
    [RecoveryType] tinyint NOT NULL,
    [CashAmount] numeric(18,2) NULL,
    [BankAmount] numeric(18,2) NULL,
    [BankInfoID] int NULL,
    [ReferenceNo] nvarchar(50) NULL,
    [ReferenceDate] date NULL,
    [ReferenceAmount] numeric(18,2) NULL,
    [AccountVoucherID] int NULL,
    [BankName] nvarchar(50) NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [Remarks] nvarchar(1000) NULL
);
GO

CREATE TABLE [dbo].[adgen_JobCardTypeBillingRecoveryDetail] (
    [JobCardTypeBillingRecoveryDetailID] int NOT NULL,
    [JobCardTypeBillingRecoveryID] int NULL,
    [BillingID] int NULL,
    [TotalBillAmount] numeric(18,2) NOT NULL,
    [RecoveryAmount] numeric(18,2) NOT NULL,
    [IncomeTaxLabour] numeric(18,2) NOT NULL,
    [IncomeTaxParts] numeric(18,2) NOT NULL,
    [PSTAmountWithHeld] numeric(18,2) NOT NULL,
    [PromotionalTax] numeric(18,2) NOT NULL,
    [TotalDeduction] numeric(18,2) NOT NULL
);
GO

CREATE TABLE [dbo].[adgen_JobCardTypeLabour] (
    [LabourID] int NOT NULL,
    [EntryUserID] int NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL
);
GO

CREATE TABLE [dbo].[adgen_JobCardTypeLabourDetail] (
    [DetailID] int NOT NULL,
    [LabourID] int NULL,
    [Labour] decimal(18,2) NULL,
    [JobCardTypeId] int NULL
);
GO

CREATE TABLE [dbo].[adgen_JobInsuranceEstApprovalInfo] (
    [JobEstApprovalId] int NOT NULL,
    [JobEstApprovalCode] nvarchar(50) NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [ApprovalRemarks] nvarchar(50) NULL,
    [SNO] int NULL,
    [ApprovalDate] datetime NULL,
    [JobEstimateId] int NULL,
    [PolicyNo] nvarchar(250) NULL,
    [Certificate] nvarchar(250) NULL,
    [LossNo] nvarchar(250) NULL,
    [VOD] nvarchar(250) NULL,
    [Surveyor] nvarchar(250) NULL,
    [JobCardNo] nvarchar(250) NULL,
    [PartyName] nvarchar(250) NULL,
    [ChasisNo] nvarchar(250) NULL,
    [EngineNo] nvarchar(250) NULL,
    [Remarks] nvarchar(250) NULL,
    [ZoneId] int NULL,
    [StationId] int NULL,
    [Approved] bit NULL
);
GO

CREATE TABLE [dbo].[adgen_SaleServiceInfo] (
    [SaleServiceInfoID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [Name] nvarchar(100) NULL,
    [GLCAID] int NULL,
    [Description] nvarchar(200) NULL,
    [ChargeToCompany] bit NOT NULL,
    [VehicleGroupId] int NULL
);
GO

CREATE TABLE [dbo].[adgen_ScheduleMaintainceDetail] (
    [MaintainDetailId] int NOT NULL,
    [MaintainId] int NULL,
    [JobInfoId] int NULL,
    [ActivityId] int NULL,
    [KM] nvarchar(50) NULL,
    [Month] nvarchar(50) NULL,
    [Labour] numeric(18,3) NULL,
    [ItemId] int NULL,
    [ItemSalesPrice] numeric(18,3) NULL,
    [Quantity] int NULL,
    [TabName] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[adgen_ScheduleMaintainenceInfo] (
    [MaintainId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [VarientID] int NULL,
    [KM] nvarchar(50) NULL,
    [Month] nvarchar(50) NULL,
    [PromptDays] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[adgen_VarientInfo] (
    [VarientID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [VehicleID] int NOT NULL,
    [VarientTitle] varchar(50) NULL,
    [VersionCode] varchar(30) NULL,
    [Factoryprice] numeric(12,0) NULL,
    [TaxAmount] numeric(12,0) NULL,
    [Description] varchar(100) NULL,
    [Power] varchar(20) NULL,
    [CNGFitted] bit NOT NULL
);
GO

CREATE TABLE [dbo].[adgen_VehicleGroup] (
    [VehicleGroupID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [VehicleGroupTitle] varchar(50) NULL,
    [IncomePlusGLID] int NULL,
    [VehicleSaleGLID] int NULL,
    [AssetsGLID] int NULL,
    [CGSGLID] int NULL
);
GO

CREATE TABLE [dbo].[adgen_VehicleInfo] (
    [VehicleID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [VehicleGroupID] int NOT NULL,
    [VehicleTitle] varchar(50) NULL,
    [VehicleCode] varchar(30) NULL
);
GO

CREATE TABLE [dbo].[adgen_VehicleRegistrationInfo] (
    [VehicleRegistrationID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [AssetType] nvarchar(50) NULL,
    [RegistrationNo] nvarchar(50) NULL,
    [EngineChasisNo] nvarchar(50) NULL,
    [Version] nvarchar(50) NULL,
    [Model] nvarchar(50) NULL,
    [IsAutomatic] bit NULL,
    [VehicleID] int NULL,
    [ColorID] int NULL,
    [FuelType] nvarchar(100) NULL,
    [Ppin] nvarchar(50) NULL,
    [Epin] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_AgentRegistraton] (
    [AgentRegisterID] int NOT NULL,
    [AgentName] nvarchar(250) NULL,
    [AgentNumber] nvarchar(50) NULL,
    [AgentAddress] nvarchar(MAX) NULL,
    [AgentGLID] int NULL,
    [CNICNNo] nvarchar(150) NULL,
    [CityName] nvarchar(150) NULL,
    [CompanyID] int NULL,
    [RegistrationDate] datetime NULL,
    [EnteryUserID] int NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [Commission] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_AttendanceDetail] (
    [AttendanceDetailID] int NOT NULL,
    [AttendanceID] int NULL,
    [EmployeeID] int NULL,
    [Status] nvarchar(50) NULL,
    [DepartmentID] int NULL,
    [DesignationID] int NULL,
    [OverTime] numeric(18,2) NULL,
    [Site] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_AttendanceInfo] (
    [AttendanceID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [Date] datetime NULL,
    [BranchID] int NULL,
    [DepartmentId] int NULL,
    [WHID] int NULL
);
GO

CREATE TABLE [dbo].[data_barcodePrintDetail] (
    [PrintDetailID] int NOT NULL,
    [ItemID] int NULL,
    [PrintingDate] datetime NULL,
    [PrintQty] int NULL,
    [ImagePath] nvarchar(3000) NULL,
    [PrintedBy] int NULL,
    [ItemName] nvarchar(250) NULL,
    [Size] nvarchar(150) NULL,
    [Model] nvarchar(250) NULL,
    [PrintID] int NULL,
    [BarcodeNumber] nvarchar(250) NULL,
    [BarcodeString] nvarchar(250) NULL
);
GO

CREATE TABLE [dbo].[data_barcodePrintMaster] (
    [PrintDate] datetime NULL,
    [PrintId] int NOT NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[data_CertificateDetailInfo] (
    [CertificateDetailId] int NOT NULL,
    [CertificateId] int NULL,
    [MasterEquipmentId] int NULL,
    [Selection] nvarchar(50) NULL,
    [Reference] nvarchar(50) NULL,
    [InstrumentReading] nvarchar(50) NULL,
    [Error] nvarchar(50) NULL,
    [TabName] nvarchar(50) NULL,
    [Field] nvarchar(MAX) NULL,
    [PostReference] nvarchar(50) NULL,
    [PostInstrumentReading] nvarchar(50) NULL,
    [PostSelection] nvarchar(50) NULL,
    [PostError] nvarchar(50) NULL,
    [PreReference] nvarchar(50) NULL,
    [PreInstrumentReading] nvarchar(50) NULL,
    [PreSelection] nvarchar(50) NULL,
    [PreError] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_CertificateInfo] (
    [CertificateId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchID] int NULL,
    [CertificateType] tinyint NULL,
    [CertificateNo] nvarchar(50) NULL,
    [PartyID] int NULL,
    [Date] datetime NULL,
    [RecDate] datetime NULL,
    [CusEquipmentId] int NULL,
    [UINO] nvarchar(50) NULL,
    [Location] nvarchar(MAX) NULL,
    [Tolerance] nvarchar(50) NULL,
    [DType] nvarchar(50) NULL,
    [Make] nvarchar(50) NULL,
    [Range] nvarchar(50) NULL,
    [Model] nvarchar(50) NULL,
    [Serial] nvarchar(50) NULL,
    [Temperature] nvarchar(50) NULL,
    [RelativeHumidity] nvarchar(50) NULL,
    [IsResultReffered] bit NULL,
    [IsCertificateValid] bit NULL,
    [IsIssueNo] bit NULL,
    [IsCustomerVerified] bit NULL,
    [Sno] int NULL,
    [Reference] bit NULL,
    [MasterReading] bit NULL,
    [FieldBy] nvarchar(MAX) NULL,
    [isManual] bit NULL,
    [outOfOrder] bit NULL,
    [PostReference] bit NULL,
    [PostMasterReading] bit NULL,
    [PreReference] bit NULL,
    [PreMasterReading] bit NULL,
    [WorkingRange] nvarchar(50) NULL,
    [CALine] nvarchar(50) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [Inspection] int NULL
);
GO

CREATE TABLE [dbo].[data_CertificateInfolog] (
    [CertificateId] int NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchID] int NULL,
    [CertificateType] tinyint NULL,
    [CertificateNo] nvarchar(50) NULL,
    [PartyID] int NULL,
    [Date] datetime NULL,
    [RecDate] datetime NULL,
    [CusEquipmentId] int NULL,
    [UINO] nvarchar(50) NULL,
    [Location] nvarchar(MAX) NULL,
    [Tolerance] nvarchar(50) NULL,
    [DType] nvarchar(50) NULL,
    [Make] nvarchar(50) NULL,
    [Range] nvarchar(50) NULL,
    [Model] nvarchar(50) NULL,
    [Serial] nvarchar(50) NULL,
    [Temperature] nvarchar(50) NULL,
    [RelativeHumidity] nvarchar(50) NULL,
    [IsResultReffered] bit NULL,
    [IsCertificateValid] bit NULL,
    [IsIssueNo] bit NULL,
    [IsCustomerVerified] bit NULL,
    [Sno] int NULL,
    [Reference] bit NULL,
    [MasterReading] bit NULL,
    [FieldBy] nvarchar(MAX) NULL,
    [isManual] bit NULL,
    [outOfOrder] bit NULL,
    [PostReference] bit NULL,
    [PostMasterReading] bit NULL,
    [PreReference] bit NULL,
    [PreMasterReading] bit NULL
);
GO

CREATE TABLE [dbo].[data_ChallanFeesRecoveryInfo] (
    [RecoveryID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchId] int NULL,
    [FiscalId] int NULL,
    [StudentId] int NULL,
    [RecoveryMonthDate] datetime NULL,
    [AccountVoucherID] int NULL,
    [RecoveryNumber] int NULL,
    [CashAmount] numeric(18,2) NULL,
    [Remarks] nvarchar(50) NULL,
    [FeesId] int NULL
);
GO

CREATE TABLE [dbo].[data_ChallanFeesRecoveryInfoDetail] (
    [RecoveryDetailID] int NOT NULL,
    [RecoveryID] int NOT NULL,
    [FeesId] int NULL,
    [Monthlyfees] numeric(18,2) NULL,
    [AnnualFees] numeric(18,2) NULL,
    [OtherFees] numeric(18,2) NULL,
    [Fine] numeric(18,2) NULL,
    [AdmissionFees] numeric(18,2) NULL,
    [RecoveredAdmissionFees] numeric(18,2) NULL,
    [RecoveredAnnualFees] numeric(18,2) NULL,
    [RecoveredMonthlyfees] numeric(18,2) NULL,
    [RecoveredOtherFees] numeric(18,2) NULL,
    [RecoveredFine] numeric(18,2) NULL
);
GO

CREATE TABLE [dbo].[data_ContainersGatePass] (
    [GATEPASSID] int NOT NULL,
    [GatePassNo] int NULL,
    [GatePassDate] datetime NULL,
    [ContainerNo] nvarchar(250) NULL,
    [LoadingUnLoading] nvarchar(250) NULL,
    [ShippingLine] nvarchar(250) NULL,
    [Size] nvarchar(250) NULL,
    [VehicleRegisterID] int NULL,
    [BiltyNo] int NULL,
    [PartyID] int NULL,
    [CRONo] nvarchar(250) NULL,
    [Transports] nvarchar(1000) NULL,
    [AC] nvarchar(1000) NULL,
    [AmountReceived] numeric(18,3) NULL,
    [PlacmentRs] numeric(18,3) NULL,
    [TimeIn] datetime NULL,
    [TimeOut] datetime NULL,
    [DriverName] nvarchar(2000) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [CompanyID] int NULL,
    [EnteryUserID] int NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [IsTaxable] bit NULL,
    [BranchID] int NULL,
    [FiscalID] int NULL,
    [EnteryUserDateTime] datetime NULL,
    [CustumerName] nvarchar(MAX) NULL,
    [ShipperImporter] nvarchar(MAX) NULL,
    [FullEmpty] int NULL
);
GO

CREATE TABLE [dbo].[data_CounterPurchase] (
    [CounterPurchaseID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [OrderDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [PurchaseOrderNo] int NULL,
    [WHID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [PaymentTermID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [PurchaseReqID] int NULL,
    [AddressOfPlace] nvarchar(MAX) NULL,
    [SaleManInfoID] int NULL,
    [PurchaseReqNo] int NULL,
    [ReferenceNumber] nvarchar(500) NULL,
    [AdvanceAmount] numeric(18,3) NULL,
    [AccountVoucherID] int NULL,
    [BrokerID] int NULL,
    [BrokeryRate] numeric(18,3) NULL,
    [isCompleted] bit NULL,
    [For] int NULL,
    [PaymentDate] datetime NULL,
    [PaymentMode] int NULL,
    [SubjectLine] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_CounterPurchaseDetail] (
    [CounterPurchaseDetailID] int NOT NULL,
    [CounterPurchaseID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,3) NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [PurchaseReqDetailID] int NULL,
    [DeductionPercentage] numeric(18,3) NULL,
    [DeductionQty] numeric(18,5) NULL,
    [DeductionStandard] numeric(18,3) NULL,
    [WagesStandard] numeric(18,3) NULL,
    [BardanaStandard] numeric(18,3) NULL,
    [BardanaId] int NULL,
    [For] tinyint NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [ItemName] nvarchar(250) NULL
);
GO

CREATE TABLE [dbo].[data_CounterPurchaseDetailTax] (
    [POTaxID] int NOT NULL,
    [CounterPurchaseID] int NULL,
    [CounterPurchaseDetailID] int NULL,
    [TaxID] int NULL,
    [TaxPercentage] decimal(18,3) NULL,
    [TaxAmountPerUnit] decimal(18,3) NULL,
    [TaxAmount] decimal(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_CounterSale] (
    [CounterSaleID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [OrderDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [SaleOrderNo] int NULL,
    [WHID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [PaymentTermID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [SaleReqID] int NULL,
    [AddressOfPlace] nvarchar(MAX) NULL,
    [SaleManInfoID] int NULL,
    [SaleReqNo] int NULL,
    [ReferenceNumber] nvarchar(500) NULL,
    [AdvanceAmount] numeric(18,3) NULL,
    [AccountVoucherID] int NULL,
    [BrokerID] int NULL,
    [BrokeryRate] numeric(18,3) NULL,
    [isCompleted] bit NULL,
    [For] int NULL,
    [PaymentDate] datetime NULL,
    [PaymentMode] int NULL,
    [SubjectLine] nvarchar(MAX) NULL,
    [Approved] bit NOT NULL,
    [SaleMode] varchar(50) NULL,
    [InvoiceType] int NULL
);
GO

CREATE TABLE [dbo].[data_CounterSaleDetail] (
    [CounterSaleDetailID] int NOT NULL,
    [CounterSaleID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,3) NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [SaleReqDetailID] int NULL,
    [DeductionPercentage] numeric(18,3) NULL,
    [DeductionQty] numeric(18,5) NULL,
    [DeductionStandard] numeric(18,3) NULL,
    [WagesStandard] numeric(18,3) NULL,
    [BardanaStandard] numeric(18,3) NULL,
    [BardanaId] int NULL,
    [For] tinyint NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [ItemName] nvarchar(250) NULL,
    [StockRate] numeric(18,3) NULL,
    [LocationID] int NULL
);
GO

CREATE TABLE [dbo].[data_CounterSaleDetailLog] (
    [CounterSaleDetailLogID] int NOT NULL,
    [CounterSaleLogID] nchar(10) NULL,
    [CounterSaleDetailID] int NULL,
    [CounterSaleID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,3) NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [SaleReqDetailID] int NULL,
    [DeductionPercentage] numeric(18,3) NULL,
    [DeductionQty] numeric(18,5) NULL,
    [DeductionStandard] numeric(18,3) NULL,
    [WagesStandard] numeric(18,3) NULL,
    [BardanaStandard] numeric(18,3) NULL,
    [BardanaId] int NULL,
    [For] tinyint NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [ItemName] nvarchar(250) NULL,
    [StockRate] numeric(18,3) NULL,
    [LocationID] int NULL
);
GO

CREATE TABLE [dbo].[data_CounterSaleLog] (
    [CounterSaleLogID] int NOT NULL,
    [CounterSaleID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NOT NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [OrderDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [SaleOrderNo] int NULL,
    [WHID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [PaymentTermID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [SaleReqID] int NULL,
    [AddressOfPlace] nvarchar(MAX) NULL,
    [SaleManInfoID] int NULL,
    [SaleReqNo] int NULL,
    [ReferenceNumber] nvarchar(500) NULL,
    [AdvanceAmount] numeric(18,3) NULL,
    [AccountVoucherID] int NULL,
    [BrokerID] int NULL,
    [BrokeryRate] numeric(18,3) NULL,
    [isCompleted] bit NULL,
    [For] int NULL,
    [PaymentDate] datetime NULL,
    [PaymentMode] int NULL,
    [SubjectLine] nvarchar(MAX) NULL,
    [Approved] bit NOT NULL,
    [SaleMode] varchar(50) NULL,
    [InvoiceType] int NULL,
    [ModifiedType] int NULL
);
GO

CREATE TABLE [dbo].[data_CounterSaleReturn] (
    [CounterSaleReturnID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [OrderDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [CounterSaleID] int NULL,
    [CounterSaleVoucherNo] int NULL,
    [WHID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [PaymentTermID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [AddressOfPlace] nvarchar(MAX) NULL,
    [SaleManInfoID] int NULL,
    [CounterSalesReturnNo] int NULL,
    [ReferenceNumber] nvarchar(500) NULL,
    [AdvanceAmount] numeric(18,3) NULL,
    [AccountVoucherID] int NULL,
    [BrokerID] int NULL,
    [BrokeryRate] numeric(18,3) NULL,
    [isCompleted] bit NULL,
    [For] int NULL,
    [PaymentDate] datetime NULL,
    [PaymentMode] int NULL,
    [SubjectLine] nvarchar(MAX) NULL,
    [SaleMode] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_CounterSaleReturnDetail] (
    [CounterSaleReturnDetailID] int NOT NULL,
    [CounterSaleReturnID] int NULL,
    [ItemId] int NULL,
    [ItemName] nvarchar(250) NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,3) NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [CounterSaleDetailID] int NULL,
    [DeductionPercentage] numeric(18,3) NULL,
    [DeductionQty] numeric(18,5) NULL,
    [DeductionStandard] numeric(18,3) NULL,
    [WagesStandard] numeric(18,3) NULL,
    [BardanaStandard] numeric(18,3) NULL,
    [BardanaId] int NULL,
    [For] tinyint NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [StockRate] numeric(18,3) NULL,
    [LocationID] int NULL
);
GO

CREATE TABLE [dbo].[data_CounterSaleReturnDetailLog] (
    [CounterSaleReturnDetailLogID] int NOT NULL,
    [CounterSaleReturnLogID] int NULL,
    [CounterSaleReturnDetailID] int NULL,
    [CounterSaleReturnID] int NULL,
    [ItemId] int NULL,
    [ItemName] nvarchar(250) NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,3) NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [CounterSaleDetailID] int NULL,
    [DeductionPercentage] numeric(18,3) NULL,
    [DeductionQty] numeric(18,5) NULL,
    [DeductionStandard] numeric(18,3) NULL,
    [WagesStandard] numeric(18,3) NULL,
    [BardanaStandard] numeric(18,3) NULL,
    [BardanaId] int NULL,
    [For] tinyint NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [StockRate] numeric(18,3) NULL,
    [LocationID] int NULL
);
GO

CREATE TABLE [dbo].[data_CounterSaleReturnLog] (
    [CounterSaleReturnLogID] int NOT NULL,
    [CounterSaleReturnID] int NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [OrderDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [CounterSaleID] int NULL,
    [CounterSaleVoucherNo] int NULL,
    [WHID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [PaymentTermID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [AddressOfPlace] nvarchar(MAX) NULL,
    [SaleManInfoID] int NULL,
    [CounterSalesReturnNo] int NULL,
    [ReferenceNumber] nvarchar(500) NULL,
    [AdvanceAmount] numeric(18,3) NULL,
    [AccountVoucherID] int NULL,
    [BrokerID] int NULL,
    [BrokeryRate] numeric(18,3) NULL,
    [isCompleted] bit NULL,
    [For] int NULL,
    [PaymentDate] datetime NULL,
    [PaymentMode] int NULL,
    [SubjectLine] nvarchar(MAX) NULL,
    [SaleMode] varchar(50) NULL,
    [ModifiedType] int NULL
);
GO

CREATE TABLE [dbo].[data_DailyIssuence] (
    [DailyIssuanceId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [EmployeeID] int NULL,
    [partyId] int NULL,
    [ForProject] nvarchar(MAX) NULL,
    [IsTaxable] bit NULL,
    [DailyIssuanceDate] datetime NULL,
    [BranchId] int NULL,
    [ProjectID] int NULL,
    [ExpectedReturnDate] datetime NULL,
    [ManualNo] nvarchar(150) NULL,
    [PONumber] nvarchar(150) NULL,
    [PODescription] nvarchar(150) NULL,
    [WHID] int NULL
);
GO

CREATE TABLE [dbo].[data_DailyIssuenceDetail] (
    [DailyIssuanceDetailId] int NOT NULL,
    [ItemId] int NULL,
    [Status] nvarchar(MAX) NULL,
    [DailyIssuanceId] int NULL,
    [Quantity] numeric(18,2) NULL,
    [EmpId] int NULL
);
GO

CREATE TABLE [dbo].[data_DisassemblingDetail] (
    [DisassemblingDetailID] int NOT NULL,
    [DisassemblingID] int NOT NULL,
    [ItemId] int NULL,
    [Quantity] numeric(10,3) NULL,
    [WHID] int NULL,
    [StockRate] numeric(14,5) NOT NULL
);
GO

CREATE TABLE [dbo].[data_DisassemblingDetailParams] (
    [DisassemblingDetailParamsID] int NOT NULL,
    [DisassemblingDetailID] int NOT NULL,
    [DisassemblingID] int NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_DisassemblingDetailParamsDG] (
    [DisassemblingDGParamsID] int NOT NULL,
    [DisassemblingID] int NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_DisassemblingInfo] (
    [DisassemblingID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [DisassemblingNo] int NULL,
    [ItemId] int NULL,
    [DisassemblingDate] date NULL,
    [Quantity] numeric(18,3) NULL,
    [WHID] int NOT NULL,
    [Remarks] varchar(300) NULL,
    [AccountVoucherID] int NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [ManufacturingID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL
);
GO

CREATE TABLE [dbo].[data_DriverRegistraton] (
    [VehicleRegisterID] int NOT NULL,
    [DriverName] nvarchar(250) NULL,
    [DriverNumber] nvarchar(50) NULL,
    [DriverAddress] nvarchar(MAX) NULL,
    [DriverGLID] int NULL,
    [CNICNNo] nvarchar(150) NULL,
    [CityName] nvarchar(150) NULL,
    [CompanyID] int NULL,
    [RegistrationDate] datetime NULL,
    [LicenseNo] nvarchar(250) NULL,
    [LicenseExpiry] datetime NULL,
    [VehicleNumber] nvarchar(50) NULL,
    [EnteryUserID] int NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL
);
GO

CREATE TABLE [dbo].[data_FeesChallansInfo] (
    [FeesID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchId] int NULL,
    [FiscalId] int NULL,
    [StudentId] int NULL,
    [FeesMonthDate] datetime NULL,
    [AdmissionFees] numeric(18,2) NULL,
    [AnnualFees] numeric(18,2) NULL,
    [MonthlyFees] numeric(18,2) NULL,
    [OtherCharges] numeric(18,2) NULL,
    [Discount] numeric(18,2) NULL,
    [NetFees] numeric(18,2) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [Fine] numeric(18,2) NULL,
    [AccountVoucherID] int NULL,
    [FeesNumber] int NULL
);
GO

CREATE TABLE [dbo].[data_GeneralSaleBookingInfo] (
    [SaleGeneralID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SaleVoucherNo] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [IsTaxable] bit NULL,
    [SaleDate] datetime NULL,
    [AccountVoucherId] int NULL,
    [BranchId] int NULL,
    [NetAmount] numeric(18,3) NULL,
    [RadiusUserID] nvarchar(250) NULL,
    [PartyID] int NULL
);
GO

CREATE TABLE [dbo].[data_InventItemsBarcode] (
    [RegisterID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchID] int NULL,
    [FiscalID] int NULL,
    [RegisterDate] datetime NULL,
    [ItemID] int NULL,
    [BarcodeType] int NULL,
    [SystemBarcode] nvarchar(100) NULL
);
GO

CREATE TABLE [dbo].[data_InventItemsBarcodeDetail] (
    [RegisterDetailID] int NOT NULL,
    [RegisterID] int NULL,
    [ItemID] int NULL,
    [BarcodeNumber] nvarchar(100) NULL
);
GO

CREATE TABLE [dbo].[data_InventItemsRateParts] (
    [AutNumber] int NOT NULL,
    [CategoryID] int NULL,
    [RateUpdateDate] datetime NULL,
    [PartNo] nvarchar(250) NULL,
    [ItemName] nvarchar(MAX) NULL,
    [UOMID] int NULL,
    [PurhasePrice] numeric(18,3) NULL,
    [SalePrice] numeric(18,3) NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[data_InwardGatePassDetail] (
    [InwardGatePassDetailID] int NOT NULL,
    [InwardGatePassID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [PurchaseOrderDetailID] int NULL,
    [PolythenBags] nvarchar(50) NULL,
    [JuteBags] nvarchar(50) NULL,
    [FirstWeight] numeric(18,3) NULL,
    [SecondWeight] numeric(18,3) NULL,
    [Deduction] numeric(18,3) NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [LocationId] int NULL,
    [SaleRate] numeric(18,3) NULL,
    [ReceivedQty] numeric(18,3) NULL,
    [AcceptedQty] numeric(18,3) NULL,
    [PurchaseOrderId] int NULL,
    [PurchaseID] int NULL,
    [Brokerage] numeric(18,3) NULL,
    [BardanaID] int NULL,
    [DeductionStandard] numeric(18,3) NULL,
    [BardanaStandard] numeric(18,3) NULL,
    [WagesStandard] numeric(18,3) NULL,
    [DeductionQty] numeric(18,3) NULL,
    [LaborRate] numeric(18,3) NULL,
    [For] tinyint NULL,
    [ItemDescription] nvarchar(MAX) NULL,
    [ItemPacking] nvarchar(MAX) NULL,
    [DtNetAmount] numeric(18,3) NULL,
    [ItemRate] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_InwardGatePassInfo] (
    [InwardGatePassID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [IGPDate] date NULL,
    [IGPNo] int NULL,
    [PartyID] int NULL,
    [Remarks] varchar(300) NULL,
    [PurchaseOrderID] int NULL,
    [WHID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [TruckNumber] nvarchar(50) NULL,
    [BuiltyNumber] nvarchar(50) NULL,
    [DriverName] nvarchar(50) NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [GrnType] nvarchar(50) NULL,
    [LoadingUnloadingFreight] numeric(18,3) NULL,
    [TransporterID] int NULL,
    [BuyerID] int NULL,
    [SaleOrderID] int NULL,
    [AccountVoucherID] int NULL,
    [SaleOrderNo] nvarchar(50) NULL,
    [InwardGatePassStyle] nvarchar(50) NULL,
    [OutwardGatePassId] int NULL,
    [SaleOrderDetailID] int NULL,
    [SaleID] int NULL,
    [FreightType] int NULL,
    [FreightAmount] numeric(18,3) NULL,
    [SoItemid] int NULL,
    [PackingWages] numeric(18,3) NULL,
    [PackRate] numeric(18,3) NULL,
    [LaborRate] numeric(18,3) NULL,
    [TBardana] numeric(18,3) NULL,
    [TBags] numeric(18,3) NULL,
    [BAccountID] int NULL,
    [MainWareHouseQty] numeric(18,3) NULL,
    [For] int NULL,
    [DeliveryChallanNo] nvarchar(50) NULL,
    [DeliveryChallanDate] datetime NULL,
    [NetAmount] numeric(18,3) NULL,
    [AttachmentPath] nvarchar(MAX) NULL,
    [WeightID] int NULL,
    [WeightSerielNo] int NULL
);
GO

CREATE TABLE [dbo].[data_ItemChangeDetail] (
    [ItemChangeDetailId] int NOT NULL,
    [itemChangeId] int NULL,
    [ItemId] int NULL,
    [ItemName] nvarchar(250) NULL,
    [WholeSaleRate] numeric(18,3) NULL,
    [PurchaseRate] numeric(18,3) NULL,
    [SaleRate] numeric(18,3) NULL,
    [date] datetime NULL
);
GO

CREATE TABLE [dbo].[data_ItemChangeInfo] (
    [itemChangeId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [Date] datetime NULL,
    [BranchID] int NULL
);
GO

CREATE TABLE [dbo].[data_LoanDetail] (
    [LoanDetailiD] int NOT NULL,
    [LoanID] int NULL,
    [InstallmentDate] date NULL,
    [InstallmentAmount] numeric(18,0) NULL,
    [Paid] bit NOT NULL
);
GO

CREATE TABLE [dbo].[data_LoanInfo] (
    [LoanID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [EmployeeID] int NULL,
    [AccountVoucherID] int NULL,
    [LoanDate] date NULL,
    [Amount] numeric(18,0) NULL,
    [LoanMonthStart] date NULL,
    [NumberofInstallment] int NULL,
    [AdvanceOrLoan] varchar(50) NULL,
    [BranchID] int NULL,
    [BankGlID] int NULL,
    [PaymentType] int NULL,
    [WHID] int NULL
);
GO

CREATE TABLE [dbo].[data_ManufacturingDetail] (
    [ManufacturingDetailID] int NOT NULL,
    [ManufacturingID] int NOT NULL,
    [ItemId] int NULL,
    [BOMQuantity] numeric(10,3) NULL,
    [ActualQuantity] numeric(10,3) NULL,
    [WHID] int NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [BOMFormulaQuantity] numeric(14,5) NULL,
    [ReleaseOrderDetailID] int NULL,
    [MfgTrimmingPerDetail] numeric(18,3) NULL,
    [TrimDetail] numeric(18,3) NULL,
    [RawParty] int NULL
);
GO

CREATE TABLE [dbo].[data_ManufacturingDetailParams] (
    [ManufacturingDetailParamsID] int NOT NULL,
    [ManufacturingDetailID] int NOT NULL,
    [ManufacturingID] int NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_ManufacturingDetailParamsFG] (
    [ManufacturingFGParamsID] int NOT NULL,
    [ManufacturingID] int NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_ManufacturingFormulaDetail] (
    [ManufacturingFormulaDID] int NOT NULL,
    [ManufacturingID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [Rate] numeric(18,3) NULL,
    [NetAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_ManufacturingInfo] (
    [ManufacturingID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [ManufacturingNo] int NULL,
    [ItemId] int NULL,
    [ManufacturingDate] date NULL,
    [Quantity] numeric(18,3) NULL,
    [WHID] int NOT NULL,
    [Remarks] varchar(300) NULL,
    [AccountVoucherID] int NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [ManufacturingStyle] varchar(30) NULL,
    [BOMID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [ReformulationWorking] bit NOT NULL,
    [CartonQuantity] numeric(18,3) NOT NULL,
    [LooseQuantity] numeric(18,3) NOT NULL,
    [MfgOverHeadCost] numeric(18,3) NULL,
    [MfgOverHeadRate] numeric(18,3) NULL,
    [AutoCode] nvarchar(50) NULL,
    [ExpiryDate] date NULL,
    [ManualCode] nvarchar(50) NULL,
    [ReleaseOrderID] int NULL,
    [ReleaseNo] int NULL,
    [Hours] int NULL,
    [Minutes] int NULL,
    [MotorNumber] nvarchar(50) NULL,
    [MotorName] nvarchar(50) NULL,
    [HP] nvarchar(50) NULL,
    [Condition] nvarchar(50) NULL,
    [Shape] nvarchar(50) NULL,
    [Winding] nvarchar(50) NULL,
    [WindingCondition] nvarchar(50) NULL,
    [RotorSize] nvarchar(50) NULL,
    [Lead] nvarchar(50) NULL,
    [Ampare] nvarchar(50) NULL,
    [Bearing1] nvarchar(50) NULL,
    [Bearing2] nvarchar(50) NULL,
    [Impeller] nvarchar(50) NULL,
    [Khradiya] nvarchar(50) NULL,
    [InvoiceNo] nvarchar(50) NULL,
    [OldPic] varchar(300) NULL,
    [AfterMPic] varchar(300) NULL,
    [LabourContractor] int NULL,
    [PackingCharges] numeric(18,3) NULL,
    [PartyID] int NULL,
    [biltyno] nvarchar(50) NULL,
    [NetAmountformula] numeric(18,3) NULL,
    [khradiaId] int NULL,
    [KhradiaCost] numeric(18,3) NULL,
    [MfgTrimmingPercentage] numeric(18,3) NULL,
    [TrimmingQuantity] numeric(18,3) NULL,
    [FOH] int NULL,
    [MPartyID] int NULL
);
GO

CREATE TABLE [dbo].[data_ManufacturingOverheadDetail] (
    [ManufacturingOverheadDetailID] int NOT NULL,
    [ManufacturingOverheadID] int NOT NULL,
    [ItemId] int NULL,
    [Amount] numeric(14,3) NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL,
    [ItemId1] int NULL,
    [Amount1] numeric(14,3) NULL,
    [Param11] varchar(50) NULL,
    [Param21] varchar(50) NULL,
    [Param31] varchar(50) NULL,
    [WHID] int NULL,
    [Branchid] int NULL
);
GO

CREATE TABLE [dbo].[data_ManufacturingOverheadInfo] (
    [ManufacturingOverheadID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [ManufacturingOverheadNo] int NULL,
    [ManufacturingOverheadDate] date NULL,
    [ManufacturingID] int NULL,
    [Remarks] varchar(300) NULL,
    [AccountVoucherID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL
);
GO

CREATE TABLE [dbo].[data_MarksUploadDetailInfo] (
    [MarksUploadDetailID] int NOT NULL,
    [MarksUploadID] int NULL,
    [StudentID] int NULL,
    [TotalMarks] numeric(18,2) NULL,
    [ObtainedMarks] numeric(18,2) NULL,
    [Remarks] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_MarksUploadInfo] (
    [MarksUploadID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [Date] datetime NULL,
    [BranchID] int NULL,
    [ClassId] int NULL,
    [SubjectId] int NULL,
    [TestAssignId] int NULL
);
GO

CREATE TABLE [dbo].[data_MisplExchangeDetailInfo] (
    [MisplExchangeDetailId] int NOT NULL,
    [MisplExchangeId] int NULL,
    [Date] datetime NULL,
    [SIPaccount] nvarchar(50) NULL,
    [CallerId] nvarchar(50) NULL,
    [Number] nvarchar(50) NULL,
    [Destination] nvarchar(50) NULL,
    [Duration] nvarchar(50) NULL,
    [User] nvarchar(50) NULL,
    [Trunk] nvarchar(50) NULL,
    [Type] nvarchar(50) NULL,
    [Buycost] nvarchar(50) NULL,
    [Sell] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_MisplExchangeInfo] (
    [MisplExchangeId] int NOT NULL,
    [Date] datetime NULL
);
GO

CREATE TABLE [dbo].[data_MisplExchangeSaleInfo] (
    [ExchangeSaleId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [AccountVoucherID] int NULL,
    [SaleDate] date NULL,
    [BranchId] int NULL,
    [GLCAID] int NULL,
    [ExchangePartyType] int NULL
);
GO

CREATE TABLE [dbo].[data_MisplExchangeSaleInfoDetail] (
    [ExchangeDetailSaleId] int NOT NULL,
    [ExchangeSaleId] int NULL,
    [Date] datetime NULL,
    [SIPaccount] nvarchar(50) NULL,
    [CallerId] nvarchar(50) NULL,
    [Number] nvarchar(50) NULL,
    [Destination] nvarchar(50) NULL,
    [Duration] nvarchar(50) NULL,
    [User] nvarchar(50) NULL,
    [Trunk] nvarchar(50) NULL,
    [Type] nvarchar(50) NULL,
    [Buycost] nvarchar(50) NULL,
    [Sell] nvarchar(50) NULL,
    [Minutes] int NULL,
    [TotalBill] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_MisplPackages] (
    [PackageID] int NOT NULL,
    [PackageName] nvarchar(250) NULL,
    [FreeMinutes] numeric(18,3) NULL,
    [MobileCallRate] numeric(18,3) NULL,
    [LandCallsRate] numeric(18,3) NULL,
    [LineRent] numeric(18,3) NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL
);
GO

CREATE TABLE [dbo].[data_OrdersSendtoProductionUnit] (
    [SentID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SentDate] date NULL,
    [SentNo] int NULL,
    [SentFromWHID] int NULL,
    [IsTaxable] bit NOT NULL,
    [AccountVoucherID] int NULL,
    [Remarks] varchar(300) NULL,
    [TruckNumber] nvarchar(250) NULL,
    [DriverName] nvarchar(250) NULL,
    [DriverPhone] nvarchar(250) NULL,
    [TrasnferID] int NULL,
    [TransferType] int NULL,
    [MakeOrderID] int NULL,
    [MakeOrderWHID] int NULL,
    [OrderStatus] int NULL,
    [OrderReturnDate] date NULL,
    [CancelDate] date NULL
);
GO

CREATE TABLE [dbo].[data_ordersSendtoUnitDetail] (
    [OrderID] int NULL,
    [StatusChangeTime] datetime NULL,
    [StatusDate] datetime NULL,
    [CurrentStatus] int NULL,
    [Seriel] int NOT NULL,
    [WHID] int NULL
);
GO

CREATE TABLE [dbo].[data_OutletRecoveries] (
    [OutletRecoveryID] int NOT NULL,
    [CompanyID] int NULL,
    [WHID] int NULL,
    [UserID] int NULL,
    [CashDeposit] numeric(18,3) NULL,
    [DepositDate] datetime NULL,
    [RecoveryRemarks] nvarchar(MAX) NULL,
    [AccountVoucherID] int NULL,
    [IsPosted] int NULL,
    [CashOut] int NULL,
    [PostedDate] datetime NULL
);
GO

CREATE TABLE [dbo].[data_OutwardGatePassDetail] (
    [OutwardGatePassDetailID] int NOT NULL,
    [OutwardGatePassID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [SaleOrderDetailID] int NULL,
    [CartonQuantity] numeric(18,3) NOT NULL,
    [LooseQuantity] numeric(18,3) NOT NULL,
    [Remarks] nvarchar(MAX) NULL,
    [PackingDetail] nvarchar(MAX) NULL,
    [BagSize] numeric(18,3) NULL,
    [NoOfBags] numeric(18,3) NULL,
    [ScaleWeight] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_OutwardGatePassInfo] (
    [OutwardGatePassID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [OGPDate] date NULL,
    [OGPNo] int NULL,
    [PartyID] int NULL,
    [Remarks] varchar(300) NULL,
    [SaleOrderID] int NULL,
    [WHID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [BuiltyNo] nvarchar(50) NULL,
    [DriverName] nvarchar(50) NULL,
    [TransporterName] nvarchar(50) NULL,
    [SaleManInfoID] int NULL,
    [TruckNumber] nvarchar(50) NULL,
    [isTemparary] bit NULL,
    [VehicleDescription] nvarchar(MAX) NULL,
    [TimeOfSupply] datetime NULL,
    [CustomerReferenceNo] nvarchar(MAX) NULL,
    [CustomerOrderDate] datetime NULL,
    [FreightAmount] numeric(18,2) NULL,
    [FreightType] tinyint NULL,
    [TransporterFreightAmount] numeric(18,3) NULL,
    [Approved] bit NULL,
    [OutWardType] int NULL,
    [WeightID] int NULL,
    [WeightSerielNo] int NULL
);
GO

CREATE TABLE [dbo].[data_PaperProductionDetailInfo] (
    [PaperProductionDetailId] int NOT NULL,
    [PaperProductionId] int NULL,
    [ItemId] int NULL,
    [Qty] int NULL,
    [Remarks] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_PaperProductionInfo] (
    [PaperProductionId] int NOT NULL,
    [ProductionId] int NOT NULL,
    [ProductionDetailId] int NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [BranchID] int NULL,
    [Date] datetime NULL,
    [Remarks] nvarchar(50) NULL,
    [Quantity] int NULL
);
GO

CREATE TABLE [dbo].[data_PayRollDetail] (
    [PayrollDetailId] int NOT NULL,
    [PayrollinfoId] int NULL,
    [EmployeeID] int NULL,
    [TotalDays] numeric(8,2) NULL,
    [AbsentDays] numeric(8,2) NULL,
    [GrossSalery] numeric(8,2) NULL,
    [Advance] numeric(8,2) NULL,
    [Loan] numeric(8,2) NULL,
    [Salary] numeric(8,2) NULL,
    [Bonus] numeric(8,2) NULL,
    [NetSalery] numeric(8,2) NULL,
    [Payroll] bit NOT NULL,
    [Designation] nvarchar(50) NULL,
    [Department] nvarchar(50) NULL,
    [Tax] numeric(8,2) NULL,
    [OverTime] numeric(18,2) NULL,
    [OverTimeAmount] numeric(18,2) NULL,
    [EOBI] numeric(8,2) NULL,
    [arrears] numeric(8,2) NULL,
    [Deduction] numeric(18,2) NULL,
    [PerDaySalary] numeric(18,2) NULL,
    [OverTimeDays] int NULL,
    [SalaryTax] bit NOT NULL,
    [SalaryTaxID] int NULL
);
GO

CREATE TABLE [dbo].[data_PayRollInfo] (
    [PayrollinfoId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [FiscalID] int NULL,
    [CompanyID] int NULL,
    [PayrollMonth] date NULL,
    [BranchID] int NULL,
    [AccountVoucherId] int NULL,
    [WHID] int NULL,
    [PayrollDate] datetime NULL,
    [SalaryTaxID] int NULL
);
GO

CREATE TABLE [dbo].[data_PertaFormDetail] (
    [PertaDetailID] int NOT NULL,
    [ItemId] int NULL,
    [Selection] nvarchar(MAX) NULL,
    [Weight] nvarchar(MAX) NULL,
    [Quantity] numeric(18,2) NULL,
    [ItemRate] numeric(18,2) NULL,
    [NetAmount] numeric(18,2) NULL,
    [PertaInfoID] int NULL,
    [StockOutRate] numeric(18,2) NULL,
    [MakingCost] numeric(18,2) NULL,
    [NetMakingcost] numeric(18,2) NULL
);
GO

CREATE TABLE [dbo].[data_PertaFormInfo] (
    [PertaInfoID] int NOT NULL,
    [ItemIDOld] int NULL,
    [RateNew] numeric(18,3) NULL,
    [QuantityNew] numeric(18,3) NULL,
    [PartyID] int NULL,
    [NetAmountOld] numeric(18,3) NULL,
    [MakingCost] numeric(18,3) NULL,
    [RateOld] numeric(18,3) NULL,
    [PertaDate] datetime NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [AccountVoucherID] int NULL,
    [VoucherNo] int NULL,
    [IsTaxable] bit NULL,
    [BranchID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [WHID] int NULL,
    [ExchangeType] int NULL,
    [ItemIDNew] int NULL,
    [NetAmountNew] numeric(18,3) NULL,
    [NetAmount] numeric(18,3) NULL,
    [QuantityOld] numeric(18,3) NULL,
    [StockOutRate] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_Pes_GeneralVoucherDetail] (
    [GeneralVoucherDetailID] int NOT NULL,
    [GeneralVoucherID] int NOT NULL,
    [GlAccountID] int NOT NULL,
    [DTypeID] int NULL,
    [DvaluesID] int NULL,
    [ChequeNo] nvarchar(20) NULL,
    [ChequeDate] nvarchar(50) NULL,
    [dr] numeric(18,3) NOT NULL,
    [cr] numeric(18,3) NOT NULL,
    [DetailLog] int NULL,
    [Narration] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_Pes_GeneralVoucherInfo] (
    [GeneralVoucherID] int NOT NULL,
    [vType] int NOT NULL,
    [vNO] nvarchar(20) NULL,
    [vDate] date NULL,
    [ManualNumber] decimal(18,3) NULL,
    [PaymentMode] nvarchar(25) NULL,
    [SchemeID] int NULL,
    [SaleManInfoID] int NULL,
    [vremarks] nvarchar(300) NULL,
    [FiscalID] int NULL,
    [Comp_Id] int NOT NULL,
    [vUserID] int NULL,
    [vWorkStation] nvarchar(50) NULL,
    [vCancel] bit NOT NULL,
    [vPost] bit NOT NULL,
    [vPostedById] int NULL,
    [vPostedByDate] datetime NULL,
    [vPostedByWS] nvarchar(50) NULL,
    [vUserName] nvarchar(25) NULL,
    [vEnterDate] datetime NULL,
    [TotalCr] decimal(18,3) NULL,
    [TotalDr] decimal(18,3) NULL,
    [ReadOnly] bit NOT NULL,
    [AccountCategoryID] int NULL,
    [IsTaxable] bit NOT NULL,
    [BranchID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CashBankAccountID] int NULL,
    [AccountVoucherID] bigint NULL
);
GO

CREATE TABLE [dbo].[data_Pes_PRVoucherDetail] (
    [PrvoucherIdDetail] int NOT NULL,
    [PRVoucherId] int NULL,
    [SchemeId] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [ReceoverdAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_pes_PRVoucherInfo] (
    [PRVoucherId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchID] int NULL,
    [FiscalID] int NULL,
    [Date] datetime NULL,
    [VoucherNo] nvarchar(50) NULL,
    [ManualNo] numeric(18,0) NULL,
    [PaymentMode] int NULL,
    [SaleManInfoID] int NULL,
    [PartyGLID] int NULL,
    [SchemeTotal] numeric(18,2) NULL,
    [ReceiveAmount] numeric(18,2) NULL,
    [SchemeId] int NULL,
    [SNO] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [AccountVoucherID] int NULL,
    [DebitGliD] int NULL
);
GO

CREATE TABLE [dbo].[data_pes_SalesManExpense] (
    [ExpVoucherId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchID] int NULL,
    [FiscalID] int NULL,
    [Date] datetime NULL,
    [ExpMonth] datetime NULL,
    [NetAmount] numeric(18,2) NULL,
    [SNO] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [AccountVoucherID] int NULL
);
GO

CREATE TABLE [dbo].[data_pes_SalesManExpenseDetail] (
    [ExpVoucherIdDetail] int NOT NULL,
    [ExpVoucherId] int NULL,
    [SaleManId] int NULL,
    [VehcileNo] nvarchar(100) NULL,
    [ReadingStart] numeric(18,3) NULL,
    [ReadingEnd] numeric(18,3) NULL,
    [KMDriven] numeric(18,3) NULL,
    [Petrol] numeric(18,3) NULL,
    [OilMaint] numeric(18,3) NULL,
    [Repair] numeric(18,3) NULL,
    [MobileExp] numeric(18,3) NULL,
    [TollTax] numeric(18,3) NULL,
    [FaxBankCharges] numeric(18,3) NULL,
    [Others] numeric(18,3) NULL,
    [NetAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_pes_SalesManTargetDetail] (
    [TargetDetailID] int NOT NULL,
    [TargetID] int NULL,
    [ItemId] int NULL,
    [SchemId] int NULL,
    [ItemCategoryId] int NULL,
    [AvgSaleRate] numeric(18,3) NULL,
    [Value] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [TQty] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_pes_SalesManTargetInfo] (
    [TargetID] int NOT NULL,
    [TargetYear] datetime NULL,
    [TargetFrom] datetime NULL,
    [TargetTo] datetime NULL,
    [TargetType] int NULL,
    [TotalTarget] numeric(18,3) NULL,
    [SchemeName] nvarchar(100) NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [TargetNo] int NULL,
    [ManualNo] nvarchar(50) NULL,
    [TargetDate] datetime NULL,
    [BranchID] int NULL
);
GO

CREATE TABLE [dbo].[data_pes_TargetAssigningDetail] (
    [AssignDetailId] int NOT NULL,
    [AssignId] int NULL,
    [SaleManInfoID] int NULL,
    [ExtraBonus] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_pes_TargetAssigningInfo] (
    [AssignId] int NOT NULL,
    [AssigningDate] datetime NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [BranchID] int NULL,
    [TargetID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [AssignNo] int NULL
);
GO

CREATE TABLE [dbo].[data_PlotsBooking] (
    [BookingID] int NOT NULL,
    [RegistrationNo] nvarchar(150) NULL,
    [ApplicationNo] int NULL,
    [ProjectID] int NULL,
    [PhaseID] int NULL,
    [SizeID] int NULL,
    [PlotNoID] int NULL,
    [Category] nvarchar(50) NULL,
    [PartyID] int NULL,
    [FatherName] nvarchar(50) NULL,
    [AgentID] int NULL,
    [NomineeName] nvarchar(250) NULL,
    [NomineeAddress] nvarchar(250) NULL,
    [RelationshipID] int NULL,
    [NomineeNIC] nvarchar(100) NULL,
    [ProblemNarration] nvarchar(MAX) NULL,
    [BookingAmount] numeric(18,3) NULL,
    [ACSOWAmount] numeric(18,3) NULL,
    [SubAdvance] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NULL,
    [FixDiscountAmount] numeric(18,3) NULL,
    [CHQAmount] numeric(18,3) NULL,
    [DiscountonTotal] bit NULL,
    [FixDiscount] bit NULL,
    [isBooking] bit NULL,
    [ActualCost] numeric(18,3) NULL,
    [ParkFacingCost] numeric(18,3) NULL,
    [MBCost] numeric(18,3) NULL,
    [CornerCost] numeric(18,3) NULL,
    [SubTotal] numeric(18,3) NULL,
    [TotalCost] numeric(18,3) NULL,
    [TotalDiscount] numeric(18,3) NULL,
    [NetCost] numeric(18,3) NULL,
    [TotalAdvance] numeric(18,3) NULL,
    [TotalInstallmentsAmt] numeric(18,3) NULL,
    [CommPercentage] numeric(18,3) NULL,
    [CommAmount] numeric(18,3) NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [IsTaxable] bit NULL,
    [BranchId] int NULL,
    [DefineID] int NULL,
    [BookingDate] datetime NULL,
    [AccountVoucherID] int NULL,
    [BookingNo] int NULL,
    [DiscountType] int NULL,
    [AttachmentOne] nvarchar(MAX) NULL,
    [AttachmentTwo] nvarchar(MAX) NULL,
    [AttachmentThree] nvarchar(MAX) NULL,
    [AttachmentFour] nvarchar(MAX) NULL,
    [AttachmentFive] nvarchar(MAX) NULL,
    [AttachmentSix] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_PlotsBookingDetailAttachments] (
    [BookingDetailIDAttachment] int NOT NULL,
    [BookinID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [AttachmentUrl] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_PlotsBookingDetailOwners] (
    [CoOwnerDetailID] int NOT NULL,
    [BookingID] int NULL,
    [OwnerName] nvarchar(250) NULL,
    [PostalAddress] nvarchar(250) NULL,
    [PhoneNo] nvarchar(250) NULL,
    [MobileNo] nvarchar(50) NULL,
    [RelationshipId] int NULL,
    [Attachment] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_PlotsBookingDetailToken] (
    [BookingDetaillID] int NOT NULL,
    [BookingID] int NULL,
    [TokenID] int NULL,
    [TokenAmount] numeric(18,3) NULL,
    [TokenDate] datetime NULL
);
GO

CREATE TABLE [dbo].[data_PlotsDefine] (
    [DefineID] int NOT NULL,
    [ResidentialID] int NULL,
    [Kanal] numeric(18,5) NULL,
    [Marlas] numeric(18,5) NULL,
    [Front] numeric(18,5) NULL,
    [Depth] numeric(18,5) NULL,
    [InstallMentPeriod] int NULL,
    [TotalCost] numeric(18,5) NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SizeID] int NULL,
    [PlotSize] numeric(18,5) NULL,
    [ProjectID] int NULL,
    [PhaseID] int NULL,
    [PlotNoID] int NULL,
    [Block] nvarchar(50) NULL,
    [FrontDirection] int NULL,
    [DirectionName] nvarchar(50) NULL,
    [FrontSide] numeric(18,5) NULL,
    [BackSide] numeric(18,5) NULL,
    [LeftSide] numeric(18,5) NULL,
    [RightSide] numeric(18,5) NULL,
    [Corner] bit NULL,
    [ParkFacing] bit NULL,
    [MainBoulvard] bit NULL,
    [Alloted] bit NULL
);
GO

CREATE TABLE [dbo].[data_PlotsGenerate] (
    [GenerateID] int NOT NULL,
    [ResidentialID] int NULL,
    [GLRevenue] int NULL,
    [Kanal] numeric(18,5) NULL,
    [Marlas] numeric(18,5) NULL,
    [UpperFront] numeric(18,5) NULL,
    [upperDepth] numeric(18,5) NULL,
    [NoOfPlots] int NULL,
    [InstallMentPeriod] int NULL,
    [TotalCost] numeric(18,5) NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SizeID] int NULL,
    [PlotSize] numeric(18,5) NULL,
    [ProjectID] int NULL,
    [PhaseID] int NULL,
    [PlotNoFrom] int NULL,
    [PlotNoTo] int NULL
);
GO

CREATE TABLE [dbo].[data_PlotsGenerateDetail] (
    [GenerateDetailID] int NOT NULL,
    [GenerateID] int NULL,
    [PlotNumber] int NULL,
    [Kanal] numeric(18,5) NULL,
    [Marlas] numeric(18,5) NULL,
    [UpperFront] numeric(18,5) NULL,
    [upperDepth] numeric(18,5) NULL,
    [InstallMentPeriod] int NULL,
    [TotalCost] numeric(18,5) NULL,
    [isCorner] bit NULL,
    [CornerCost] numeric(18,5) NULL,
    [SizeID] int NULL
);
GO

CREATE TABLE [dbo].[data_PlotsInstallments] (
    [InstallMentID] int NOT NULL,
    [ScheduleDate] datetime NULL,
    [BookingID] int NULL,
    [ScheduleNo] int NULL,
    [ApplicationNo] int NULL,
    [ProjectID] int NULL,
    [PhaseID] int NULL,
    [PlotNoID] int NULL,
    [PartyID] int NULL,
    [TotalCost] numeric(18,3) NULL,
    [TotalDiscount] numeric(18,3) NULL,
    [NetCost] numeric(18,3) NULL,
    [TotalAdvance] numeric(18,3) NULL,
    [TotalInstallmentsAmt] numeric(18,3) NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [IsTaxable] bit NULL,
    [BranchId] int NULL,
    [InstallmentType] int NULL,
    [InstallmentPeriod] int NULL,
    [DuesType] int NULL,
    [DuesAmount] numeric(18,3) NULL,
    [StartDate] datetime NULL,
    [BarcodeNumber] nvarchar(100) NULL,
    [BarcodeImage] nvarchar(MAX) NULL,
    [PeriodAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_PlotsInstallmentsDetail] (
    [InstallmentDetailID] int NOT NULL,
    [InstallMentID] int NULL,
    [InstallmentDate] datetime NULL,
    [InstallmentNo] int NULL,
    [InstallmentAmount] numeric(18,5) NULL
);
GO

CREATE TABLE [dbo].[data_PlotsInstallmentsRecovery] (
    [RecoveryID] int NOT NULL,
    [InstallMentID] int NULL,
    [BankGlID] int NULL,
    [ReceiptDate] datetime NULL,
    [CheaqueDate] datetime NULL,
    [CheaqueNo] nvarchar(250) NULL,
    [ProjectID] int NULL,
    [PhaseID] int NULL,
    [PlotNoID] int NULL,
    [PartyID] int NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [IsTaxable] bit NULL,
    [BranchId] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [AccountVoucherID] int NULL,
    [BarcodeNumber] nvarchar(100) NULL,
    [RecoveryNo] int NULL,
    [TotalRecoverdAmount] numeric(18,3) NULL,
    [PaymentType] int NULL
);
GO

CREATE TABLE [dbo].[data_PlotsInstallmentsRecoveryDetail] (
    [RecoveryIDDetailID] int NOT NULL,
    [InstallmentDetailID] int NULL,
    [RecoveryID] int NULL,
    [InstallmentNo] int NULL,
    [RecoveredAmount] numeric(18,5) NULL
);
GO

CREATE TABLE [dbo].[data_PlotsSize] (
    [SizeID] int NOT NULL,
    [PlotSize] numeric(18,5) NULL,
    [ProjectID] int NULL,
    [PhaseID] int NULL,
    [ResidentialID] int NULL,
    [GLRevenue] int NULL,
    [Kanal] numeric(18,5) NULL,
    [Marlas] numeric(18,5) NULL,
    [UpperFront] numeric(18,5) NULL,
    [upperDepth] numeric(18,5) NULL,
    [NoOfPlots] int NULL,
    [InstallMentPeriod] int NULL,
    [TotalCost] numeric(18,5) NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL
);
GO

CREATE TABLE [dbo].[data_PlotsToken] (
    [TokenID] int NOT NULL,
    [TokenDate] datetime NULL,
    [PartyName] nvarchar(500) NULL,
    [FatherName] nvarchar(500) NULL,
    [PaymentMode] int NULL,
    [PaymentDate] datetime NULL,
    [ChequeNumber] int NULL,
    [DrawnOn] nvarchar(500) NULL,
    [TokenAmount] numeric(18,3) NULL,
    [BookingDate] datetime NULL,
    [ProjectID] int NULL,
    [PhaseID] int NULL,
    [SizeID] int NULL,
    [PlotDefineID] int NULL,
    [AdjustedinAdvance] bit NULL,
    [AccountVoucherID] int NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [TokenNumber] int NULL,
    [IsTaxable] bit NULL,
    [BranchId] int NULL
);
GO

CREATE TABLE [dbo].[data_PosClosing] (
    [ClosingID] int NOT NULL,
    [SourceID] int NULL,
    [ClosingDate] date NULL,
    [ClosedBy] int NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [ClosingAmount] numeric(18,3) NULL,
    [AccountVoucherID] int NULL
);
GO

CREATE TABLE [dbo].[data_ProductInflow] (
    [ProductInflowID] int NOT NULL,
    [ItemId] int NULL,
    [SourceID] int NULL,
    [SourceName] varchar(50) NULL,
    [WHID] int NULL,
    [StockDate] date NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [Quantity] numeric(10,2) NOT NULL,
    [QtyInStock] numeric(10,2) NOT NULL,
    [FiscalID] int NULL,
    [CompanyID] int NULL,
    [IsDeleted] bit NOT NULL,
    [IsTaxable] bit NOT NULL,
    [LocationId] int NULL,
    [FlockId] int NULL,
    [IssueWeight] numeric(18,3) NULL,
    [BranchID] int NULL,
    [ShedId] int NULL,
    [ExpiryDate] datetime NULL,
    [BatchNo] nvarchar(50) NULL,
    [PartyID] int NULL
);
GO

CREATE TABLE [dbo].[data_ProductInflowBatch] (
    [ProductInflowDetailID] int NOT NULL,
    [ProductInflowID] int NOT NULL,
    [SourceID] int NOT NULL,
    [SourceName] varchar(50) NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_ProductionForecasting] (
    [ProductionForecastingID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [LogSourceID] int NOT NULL,
    [ModifiedType] bit NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [PartyID] int NULL,
    [WHID] int NULL,
    [ForecastingDate] date NULL,
    [ForecastingNo] nvarchar(10) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL
);
GO

CREATE TABLE [dbo].[data_ProductionForecastingDetail] (
    [ProductionForecastingDetailID] int NOT NULL,
    [ProductionForecastingID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [IsLog] bit NOT NULL
);
GO

CREATE TABLE [dbo].[data_ProductOutflow] (
    [ProductOutflowID] int NOT NULL,
    [ProductInflowID] int NULL,
    [ItemId] int NULL,
    [SourceID] int NULL,
    [SourceName] varchar(50) NULL,
    [WHID] int NULL,
    [StockDate] date NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [Quantity] numeric(10,2) NULL,
    [FiscalID] int NULL,
    [CompanyID] int NULL,
    [IsTaxable] bit NOT NULL,
    [LocationId] int NULL,
    [FlockId] int NULL,
    [IssueWeight] numeric(18,3) NULL,
    [BranchID] int NULL,
    [ShedId] int NULL,
    [ExpiryDate] datetime NULL,
    [BatchNo] nvarchar(50) NULL,
    [PartyID] int NULL
);
GO

CREATE TABLE [dbo].[data_ProductOutflowBatch] (
    [ProductOutflowDetailID] int NOT NULL,
    [ProductOutflowID] int NOT NULL,
    [SourceID] int NOT NULL,
    [SourceName] varchar(50) NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_ProgramRegistration] (
    [ProjectID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [ProjectNo] int NULL,
    [ProjectDescription] nvarchar(MAX) NULL,
    [IsTaxable] bit NULL,
    [ProAwardDate] datetime NULL,
    [BranchId] int NULL,
    [ProjectCost] numeric(18,3) NULL,
    [ReferenceNo] nvarchar(250) NULL,
    [PartyID] int NULL,
    [IsCompeted] bit NULL,
    [IsCancle] bit NULL,
    [IsSelected] bit NULL,
    [ManualNo1] nvarchar(250) NULL,
    [ManualNo] nvarchar(250) NULL
);
GO

CREATE TABLE [dbo].[data_ProjectCosting] (
    [ProjectCostingId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [partyId] int NULL,
    [ProDescription] nvarchar(MAX) NULL,
    [IsTaxable] bit NULL,
    [PDate] datetime NULL,
    [BranchId] int NULL,
    [ProjectID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [ProjectNo] nvarchar(100) NULL,
    [ManualNo] nvarchar(150) NULL,
    [NetAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_ProjectCostingDetail] (
    [ProjectCostingDId] int NOT NULL,
    [GLCAID] int NULL,
    [Narration] nvarchar(MAX) NULL,
    [Amount] numeric(18,0) NULL,
    [ProjectCostingId] int NULL
);
GO

CREATE TABLE [dbo].[data_ProjectsPhases] (
    [PhaseID] int NOT NULL,
    [ProjectID] int NULL,
    [PhaseName] nvarchar(1000) NULL,
    [AddressOne] nvarchar(MAX) NULL,
    [AddressTwo] nvarchar(MAX) NULL,
    [CityName] nvarchar(250) NULL,
    [PhoneOne] nvarchar(100) NULL,
    [PhoneTwo] nvarchar(100) NULL,
    [FaxNumber] nvarchar(250) NULL,
    [Email] nvarchar(150) NULL,
    [WebURL] nvarchar(100) NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL
);
GO

CREATE TABLE [dbo].[data_ProjectsRegistration] (
    [ProjectID] int NOT NULL,
    [ProjectName] nvarchar(1000) NULL,
    [Abbrevation] nvarchar(50) NULL,
    [ProjectNumber] int NULL,
    [RegisterDate] datetime NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[data_PrReleaseOrder] (
    [ReleaseOrderID] int NOT NULL,
    [PlanningID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [PlanningNo] int NULL,
    [ReleaseNo] int NULL,
    [ReleaseDate] datetime NULL,
    [ItemId] int NULL,
    [WHID] int NOT NULL,
    [UOMId] int NULL,
    [BaseQuantity] numeric(10,3) NULL,
    [Remarks] varchar(300) NULL,
    [DefaultBOM] bit NOT NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NULL,
    [FiscalID] int NULL,
    [CartonQuantity] numeric(18,3) NOT NULL,
    [LooseQuantity] numeric(18,3) NOT NULL,
    [ManualCode] nvarchar(50) NULL,
    [AccountVoucherID] int NULL
);
GO

CREATE TABLE [dbo].[data_PrReleaseOrderDetail] (
    [ReleaseOrderIDDetailID] int NOT NULL,
    [PlanningDetailID] int NULL,
    [ReleaseOrderID] int NOT NULL,
    [ItemId] int NULL,
    [UOMId] int NULL,
    [PlanningQuantity] numeric(10,3) NULL,
    [IssuedQuantity] numeric(10,3) NULL,
    [Remarks] varchar(300) NULL,
    [WHID] int NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [RemainingQuantity] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseDetail] (
    [PurchaseDetailID] int NOT NULL,
    [PurchaseID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [InwardGatePassDetailID] int NULL,
    [PartyQuantity] numeric(18,3) NOT NULL,
    [BardanaDed] numeric(18,3) NOT NULL,
    [MoisDed] numeric(18,3) NOT NULL,
    [AshDed] numeric(18,3) NOT NULL,
    [FatDed] numeric(18,3) NOT NULL,
    [OtherDed] numeric(18,3) NOT NULL,
    [WeightID] int NULL,
    [ItemRate] numeric(18,5) NOT NULL,
    [ProductRemarks] nvarchar(200) NULL,
    [CartonQuantity] numeric(18,3) NOT NULL,
    [LooseQuantity] numeric(18,3) NOT NULL,
    [ActualQty] numeric(18,3) NULL,
    [Deduction] numeric(18,3) NULL,
    [ManualTaxInput] numeric(18,3) NULL,
    [ManualTaxAmount] numeric(18,3) NULL,
    [Weight] numeric(18,3) NULL,
    [For] tinyint NULL,
    [RatePerBag] numeric(18,3) NULL,
    [BagsQuantity] numeric(18,3) NULL,
    [VehicleNumber] nvarchar(120) NULL,
    [LocationId] int NULL,
    [BatchNumber] nvarchar(500) NULL,
    [DtNetDiscount] numeric(18,3) NULL,
    [BagsSize] numeric(18,3) NULL,
    [ItemSalesPrice] numeric(18,3) NOT NULL,
    [CalcRate] int NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseDetailLog] (
    [LPurchaseDetailID] int NOT NULL,
    [PurchaseDetailID] int NOT NULL,
    [PurchaseID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,10) NULL,
    [StockRate] numeric(18,11) NOT NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [InwardGatePassDetailID] int NULL,
    [PartyQuantity] numeric(18,3) NOT NULL,
    [BardanaDed] numeric(18,3) NOT NULL,
    [MoisDed] numeric(18,3) NOT NULL,
    [AshDed] numeric(18,3) NOT NULL,
    [FatDed] numeric(18,3) NOT NULL,
    [OtherDed] numeric(18,3) NOT NULL,
    [WeightID] int NULL,
    [ItemRate] numeric(18,11) NOT NULL,
    [ProductRemarks] nvarchar(200) NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [ActualQty] numeric(18,3) NULL,
    [Deduction] numeric(18,3) NULL,
    [ManualTaxInput] numeric(18,3) NULL,
    [ManualTaxAmount] numeric(18,3) NULL,
    [Weight] numeric(18,3) NULL,
    [For] tinyint NULL,
    [RatePerBag] numeric(18,3) NULL,
    [BagsQuantity] numeric(18,3) NULL,
    [VehicleNumber] nvarchar(120) NULL,
    [CalcRate] int NULL,
    [LocationId] int NULL,
    [BatchNumber] nvarchar(500) NULL,
    [DtNetDiscount] numeric(18,3) NULL,
    [BagsSize] numeric(18,3) NULL,
    [ItemSalesPrice] numeric(18,3) NOT NULL,
    [LogPurchaseID] int NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseDetailParams] (
    [PurchaseDetailParamsID] int NOT NULL,
    [PurchaseDetailID] int NOT NULL,
    [PurchaseID] int NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseDetailTax] (
    [PurchaseDetailTaxID] int NOT NULL,
    [PurchaseDetailID] int NULL,
    [PurchaseID] int NULL,
    [TaxID] int NULL,
    [TaxPercentage] decimal(18,3) NULL,
    [TaxAmountPerUnit] decimal(18,3) NULL,
    [TaxAmount] decimal(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseInfo] (
    [PurchaseID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [PurchaseDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [PurchaseVoucherNo] int NULL,
    [PurchaseOrderID] int NULL,
    [InwardGatePassID] int NULL,
    [WHID] int NULL,
    [AccountVoucherID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [PaymentTermID] int NULL,
    [DueDate] date NULL,
    [BillNumber] nvarchar(50) NULL,
    [BillDate] date NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [TransporterID] int NULL,
    [TransporterFreightAmount] numeric(18,2) NOT NULL,
    [Whitax] numeric(18,3) NULL,
    [PurchaseStyle] nvarchar(50) NULL,
    [FlockId] int NULL,
    [CargoNo] nvarchar(50) NULL,
    [CalcRate] int NULL,
    [For] int NULL,
    [Transporter] nvarchar(50) NULL,
    [PurchaseAttachment] nvarchar(MAX) NULL,
    [NetDiscount] numeric(18,3) NULL,
    [BuiltyNumber] nvarchar(100) NULL,
    [TruckNumber] nvarchar(100) NULL,
    [PurchasedParty] int NULL,
    [FBRInvoiceNumber] nvarchar(750) NULL,
    [FbrImagePath] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseInfoLog] (
    [LogPurchaseID] int NOT NULL,
    [PurchaseID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [PurchaseDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,10) NULL,
    [PurchaseVoucherNo] int NULL,
    [PurchaseOrderID] int NULL,
    [InwardGatePassID] int NULL,
    [WHID] int NULL,
    [AccountVoucherID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [PaymentTermID] int NULL,
    [DueDate] date NULL,
    [BillNumber] nvarchar(50) NULL,
    [BillDate] date NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [TransporterID] int NULL,
    [TransporterFreightAmount] numeric(18,2) NOT NULL,
    [Whitax] numeric(18,3) NULL,
    [PurchaseStyle] nvarchar(50) NULL,
    [FlockId] int NULL,
    [CargoNo] nvarchar(50) NULL,
    [CalcRate] int NULL,
    [For] int NULL,
    [Transporter] nvarchar(50) NULL,
    [PurchaseAttachment] nvarchar(MAX) NULL,
    [NetDiscount] numeric(18,3) NULL,
    [BuiltyNumber] nvarchar(100) NULL,
    [TruckNumber] nvarchar(100) NULL,
    [PurchasedParty] int NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseOrder] (
    [PurchaseOrderID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [OrderDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [PurchaseOrderNo] int NULL,
    [WHID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [PaymentTermID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [PurchaseReqID] int NULL,
    [AddressOfPlace] nvarchar(MAX) NULL,
    [SaleManInfoID] int NULL,
    [PurchaseReqNo] int NULL,
    [ReferenceNumber] nvarchar(500) NULL,
    [AdvanceAmount] numeric(18,3) NULL,
    [AccountVoucherID] int NULL,
    [BrokerID] int NULL,
    [BrokeryRate] numeric(18,3) NULL,
    [isCompleted] bit NULL,
    [For] int NULL,
    [SubjectLine] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseOrderDetail] (
    [PurchaseOrderDetailID] int NOT NULL,
    [PurchaseOrderID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,3) NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [PurchaseReqDetailID] int NULL,
    [DeductionPercentage] numeric(18,3) NULL,
    [DeductionQty] numeric(18,5) NULL,
    [DeductionStandard] numeric(18,3) NULL,
    [WagesStandard] numeric(18,3) NULL,
    [BardanaStandard] numeric(18,3) NULL,
    [BardanaId] int NULL,
    [For] tinyint NULL,
    [Remarks] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseOrderDetailTax] (
    [POTaxID] int NOT NULL,
    [PurchaseOrderID] int NULL,
    [PurchaseOrderDetailID] int NULL,
    [TaxID] int NULL,
    [TaxPercentage] decimal(18,3) NULL,
    [TaxAmountPerUnit] decimal(18,3) NULL,
    [TaxAmount] decimal(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseRequisition] (
    [PurchaseReqID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [RequisitionDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [PurchaseReqNo] int NULL,
    [WHID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [PaymentTermID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [ReqManualNumber] nvarchar(50) NULL,
    [IsActive] bit NULL,
    [isApproved] bit NULL,
    [TNumber] int NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseRequisitionDetail] (
    [PurchaseReqDetailID] int NOT NULL,
    [PurchaseReqID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,3) NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [For] int NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseReturnDetail] (
    [PurchaseReturnDetailID] int NOT NULL,
    [PurchaseReturnID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [PurchaseDetailId] int NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [CartonQuantity] decimal(18,3) NULL,
    [LooseQuantity] decimal(18,3) NULL,
    [VehicleNumber] nvarchar(MAX) NULL,
    [DiscountRate] numeric(18,3) NULL,
    [LocationID] int NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseReturnDetailTax] (
    [PRTaxID] int NOT NULL,
    [PurchaseReturnID] int NULL,
    [PurchaseReturnDetailID] int NULL,
    [TaxID] int NULL,
    [TaxPercentage] decimal(18,3) NULL,
    [TaxAmountPerUnit] decimal(18,3) NULL,
    [TaxAmount] decimal(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_PurchaseReturnInfo] (
    [PurchaseReturnID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [PurchaseReturnDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [PurchaseReturnNo] int NULL,
    [WHID] int NULL,
    [PurchaseID] int NULL,
    [AccountVoucherID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [ReturnType] int NULL,
    [PurchasedParty] int NULL
);
GO

CREATE TABLE [dbo].[data_QuotationDetail] (
    [QuotationDetailID] int NOT NULL,
    [QuotationID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,3) NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [Location] nvarchar(MAX) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [ConnectionQty] int NULL,
    [ConnectionType] nvarchar(50) NULL,
    [ConnectionUnit] int NULL
);
GO

CREATE TABLE [dbo].[data_QuotationInfo] (
    [QuotationID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [QuotationDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [QuotationNo] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [TransporterFreightAmount] numeric(18,2) NOT NULL,
    [SubPartyID] int NULL,
    [ManualPartyName] nvarchar(50) NULL,
    [ManualAdressOne] nvarchar(50) NULL,
    [ManualPhoneNumber] nvarchar(50) NULL,
    [ManualEmail] nvarchar(50) NULL,
    [ManualContactPerson] nvarchar(50) NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [ValidTill] nvarchar(MAX) NULL,
    [EmployeeReference] nvarchar(MAX) NULL,
    [SubjectLine] nvarchar(MAX) NULL,
    [TermsOfPayment] nvarchar(MAX) NULL,
    [Terms_Condition_1] nvarchar(MAX) NULL,
    [Attention] nvarchar(MAX) NULL,
    [PreviousQuotation] int NULL,
    [isOLd] bit NULL,
    [NextQuotation] int NULL,
    [isCopy] bit NULL
);
GO

CREATE TABLE [dbo].[data_RawStockTransfer] (
    [StockTransferID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [TransferDate] date NULL,
    [TransferNo] int NULL,
    [TransferFromWHID] int NULL,
    [TransferToWHID] int NULL,
    [FromBranchID] int NULL,
    [ToBranchID] int NULL,
    [IsTaxable] bit NULL,
    [AccountVoucherID] int NULL,
    [Remarks] varchar(300) NULL,
    [IsStockToShed] bit NULL,
    [TransferToShedId] int NULL,
    [TransferIDRef] int NULL
);
GO

CREATE TABLE [dbo].[data_ReelProductionDetailInfo] (
    [ProductionDetailId] int NOT NULL,
    [ProductionId] int NULL,
    [ItemId] int NULL,
    [Qty] int NULL,
    [Remarks] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_ReelProductionInfo] (
    [ProductionId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [BranchID] int NULL,
    [ManufacturingId] int NULL,
    [ProductionDate] datetime NULL,
    [Remarks] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_SaleAdjustmentDetail] (
    [AdjustmentDetailId] int NOT NULL,
    [AdjustmentID] int NULL,
    [SaleId] int NULL,
    [PartyId] int NULL,
    [AdjustMentAmount] numeric(18,3) NULL,
    [BuiltyNo] nvarchar(50) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [SaleAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SaleAdjustmentInfo] (
    [AdjustmentID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [AdjustmentNo] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [IsTaxable] bit NULL,
    [AdjustmentDate] datetime NULL,
    [AccountVoucherId] int NULL,
    [BranchId] int NULL,
    [NetAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SaleDetail] (
    [SaleDetailID] int NOT NULL,
    [SaleID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [OutwardGatePassDetailID] int NULL,
    [BatchNumber] nvarchar(100) NULL,
    [IncentivePerQuantityAmount] numeric(12,2) NOT NULL,
    [IncentivePercentageOnAmount] numeric(12,2) NOT NULL,
    [IncentiveFreightPerQuantityAmount] numeric(12,2) NOT NULL,
    [LoadingPerQuantityAmount] numeric(12,2) NOT NULL,
    [OtherServicesPerQuantityAmount] numeric(12,2) NOT NULL,
    [Remarks] nvarchar(300) NULL,
    [CartonQuantity] numeric(18,3) NOT NULL,
    [LooseQuantity] numeric(18,3) NOT NULL,
    [TradeDiscount] decimal(18,3) NULL,
    [SchemeDiscount] decimal(18,3) NULL,
    [CommissionDisc] decimal(18,3) NULL,
    [IncentiveDisc] decimal(18,3) NULL,
    [ScaleWeight] decimal(18,3) NULL,
    [SchemeID] int NULL,
    [MainWareHouseQty] numeric(18,3) NULL,
    [Bardana] numeric(18,3) NULL,
    [SchemePerDics] numeric(18,3) NULL,
    [SchemePeerQty] numeric(18,3) NULL,
    [BardanaID] int NULL,
    [BardanaRate] numeric(18,3) NULL,
    [BagsSize] numeric(18,3) NULL,
    [ItemBrandId] int NULL,
    [ItemVariantInfoId] int NULL,
    [WholeSaleRate] numeric(18,3) NULL,
    [VehicleNumber] nvarchar(100) NULL,
    [DiscountRate] numeric(18,3) NULL,
    [TypeIncentive] int NULL,
    [AddExtraAmount] numeric(12,2) NULL,
    [DtNetDiscount] numeric(18,3) NULL,
    [BagSize] numeric(18,3) NULL,
    [NoOfBags] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SaleDetailParams] (
    [SaleDetailParamsID] int NOT NULL,
    [SaleDetailID] int NOT NULL,
    [SaleID] int NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_SaleDetailTax] (
    [SaleDetailTaxID] int NOT NULL,
    [SaleDetailID] int NULL,
    [SaleID] int NULL,
    [TaxID] int NULL,
    [TaxPercentage] decimal(18,3) NULL,
    [TaxAmountPerUnit] decimal(18,3) NULL,
    [TaxAmount] decimal(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SaleDistributionRecoveryDetail] (
    [SaleRecoveryDetailId] int NOT NULL,
    [SaleRecoveyID] int NULL,
    [PartyId] int NULL,
    [TotalRecoverdAmount] numeric(18,3) NULL,
    [SaleDetailId] int NULL
);
GO

CREATE TABLE [dbo].[data_SaleDistributionRecoveryInfo] (
    [SaleRecoveyID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SaleRecoveryNo] int NULL,
    [SaleId] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [IsTaxable] bit NULL,
    [RecoveryDate] datetime NULL,
    [AccountVoucherId] int NULL,
    [BranchId] int NULL,
    [NetAmount] numeric(18,3) NULL,
    [BankId] int NULL
);
GO

CREATE TABLE [dbo].[data_SaleInfo] (
    [SaleID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SaleDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [SaleVoucherNo] int NULL,
    [SaleOrderID] int NULL,
    [OutwardGatePassID] int NULL,
    [WHID] int NULL,
    [AccountVoucherID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [PaymentTermID] int NULL,
    [DueDate] date NULL,
    [TransporterID] int NULL,
    [TransporterFreightAmount] numeric(18,2) NOT NULL,
    [SaleManInfoID] int NULL,
    [Remarks2] nvarchar(300) NULL,
    [SubPartyID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [FreightType] tinyint NOT NULL,
    [InvType] int NULL,
    [isPosted] bit NULL,
    [SaleSerielNo] int NULL,
    [isConsumer] bit NULL,
    [SchemeID] int NOT NULL,
    [StockOutId] int NULL,
    [ScrapItemID] int NULL,
    [ScrapQuantity] numeric(18,3) NULL,
    [ScrapValue] numeric(18,3) NULL,
    [ScrapRate] numeric(18,3) NULL,
    [ProductInflowID] int NULL,
    [DeliveryNo] nvarchar(50) NULL,
    [DeliveryDate] datetime NULL,
    [TermsOfPayment] nvarchar(MAX) NULL,
    [PrintTitle] nvarchar(50) NULL,
    [EmployeeImage] nvarchar(MAX) NULL,
    [SectorId] int NULL,
    [BillNu] nvarchar(300) NULL,
    [isAutoGenerated] bit NULL,
    [Destination] nvarchar(50) NULL,
    [ForwardFreight] numeric(18,3) NULL,
    [PerCartonFreight] numeric(18,3) NULL,
    [CashSaleAccount] int NULL,
    [UnloadingCharges] numeric(18,3) NULL,
    [DistributiveIncentiveRate] numeric(18,3) NULL,
    [DistributorIncentiveAmount] numeric(18,3) NULL,
    [UnloadingRate] numeric(18,3) NULL,
    [BankerCommission] numeric(18,3) NULL,
    [PartyIDSuplier] int NULL,
    [BrokerID] int NULL,
    [FlockID] int NULL,
    [NetDiscount] numeric(18,3) NULL,
    [SaleMode] varchar(50) NULL,
    [SaleType] nvarchar(100) NULL,
    [BuiltyNo] nvarchar(100) NULL,
    [TruckNumber] nvarchar(100) NULL,
    [FBRInvoiceNumber] nvarchar(750) NULL,
    [FbrImagePath] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_SaleOrderDetail] (
    [SaleOrderDetailID] int NOT NULL,
    [SaleOrderID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,3) NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [QuotationDetailID] int NULL,
    [BatchNumber] nvarchar(100) NULL,
    [IncentivePerQuantityAmount] numeric(12,2) NOT NULL,
    [IncentivePercentageOnAmount] numeric(12,2) NOT NULL,
    [IncentiveFreightPerQuantityAmount] numeric(12,2) NOT NULL,
    [LoadingPerQuantityAmount] numeric(12,2) NOT NULL,
    [OtherServicesPerQuantityAmount] numeric(12,2) NOT NULL,
    [Remarks] nvarchar(300) NULL,
    [MondRate] numeric(18,3) NULL,
    [BagSize] numeric(18,3) NULL,
    [NoOfBags] numeric(18,3) NULL,
    [TypeIncentive] int NULL,
    [AddExtraAmount] numeric(18,3) NULL,
    [DiscRatePerBag] numeric(18,3) NULL,
    [ItemStatus] int NOT NULL
);
GO

CREATE TABLE [dbo].[data_SaleOrderDetailTax] (
    [SOTaxID] int NOT NULL,
    [SaleOrderID] int NULL,
    [SaleOrderDetailID] int NULL,
    [TaxID] int NULL,
    [TaxPercentage] decimal(18,3) NULL,
    [TaxAmountPerUnit] decimal(18,3) NULL,
    [TaxAmount] decimal(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SaleOrderInfo] (
    [SaleOrderID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [OrderDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [WHID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [PaymentTermID] int NULL,
    [TransporterID] int NULL,
    [TransporterFreightAmount] numeric(18,2) NOT NULL,
    [SubscriptionOrder] bit NOT NULL,
    [OrderStatus] tinyint NULL,
    [SaleManInfoID] int NULL,
    [SaleOrderNo] nvarchar(10) NULL,
    [QuotationID] int NULL,
    [SubPartyID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [FreightType] tinyint NOT NULL,
    [isPosted] bit NULL,
    [ExpiryDate] datetime NULL,
    [SoManualNo] nvarchar(50) NULL,
    [MillName] nvarchar(MAX) NULL,
    [CustomerOrderRef] nvarchar(MAX) NULL,
    [DeliveryDate] date NULL,
    [TermsOfPayment] nvarchar(MAX) NULL,
    [EmployeeId] int NULL,
    [SaleOrderTitle] nvarchar(MAX) NULL,
    [Address] nvarchar(MAX) NULL,
    [SaleMode] varchar(50) NULL,
    [Approved] bit NULL,
    [SaleOrderSeriel] int NULL,
    [HoldOrder] int NOT NULL
);
GO

CREATE TABLE [dbo].[data_SalePosDetailServer] (
    [SalePosDetailID] bigint NULL,
    [SalePosID] bigint NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,2) NULL,
    [ItemRate] numeric(18,2) NULL,
    [TaxPercentage] numeric(18,2) NULL,
    [TaxAmount] numeric(18,2) NULL,
    [DiscountPercentage] numeric(18,2) NULL,
    [DiscountAmount] numeric(18,2) NULL,
    [TotalAmount] numeric(18,2) NULL,
    [ManaufacturingID] int NULL,
    [CartonSize] decimal(18,3) NULL,
    [Carton] decimal(18,3) NULL,
    [TotalQuantity] decimal(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SalePosInfo] (
    [SalePosID] bigint NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SalePosDate] date NULL,
    [WHID] int NULL,
    [TaxAmount] decimal(18,2) NULL,
    [GrossAmount] decimal(18,2) NULL,
    [DiscountPercentage] decimal(18,2) NULL,
    [DiscountAmount] decimal(18,2) NULL,
    [DiscountTotal] decimal(18,2) NULL,
    [OtherCharges] decimal(18,2) NULL,
    [NetAmount] decimal(18,2) NULL,
    [AmountReceive] decimal(18,2) NULL,
    [AmountReturn] float NULL,
    [SalePosReturnID] bigint NOT NULL,
    [AmountInAccount] decimal(18,2) NULL,
    [AmountReceivable] decimal(18,2) NULL,
    [AmountPayable] decimal(18,2) NULL,
    [DirectReturn] bit NULL,
    [MfgID] int NULL,
    [CustomerPhone] nvarchar(50) NULL,
    [CustomerName] nvarchar(50) NULL,
    [SalePOSNo] int NULL,
    [isTaxable] bit NULL
);
GO

CREATE TABLE [dbo].[data_SalePosInfoServer] (
    [SalePosID] bigint NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SalePosDate] date NULL,
    [WHID] int NULL,
    [TaxAmount] decimal(18,2) NULL,
    [GrossAmount] decimal(18,2) NULL,
    [DiscountPercentage] decimal(18,2) NULL,
    [DiscountAmount] decimal(18,2) NULL,
    [DiscountTotal] decimal(18,2) NULL,
    [OtherCharges] decimal(18,2) NULL,
    [NetAmount] decimal(18,2) NULL,
    [AmountReceive] decimal(18,2) NULL,
    [AmountReturn] float NULL,
    [SalePosReturnID] bigint NULL,
    [AmountInAccount] decimal(18,2) NULL,
    [AmountReceivable] decimal(18,2) NULL,
    [AmountPayable] decimal(18,2) NULL,
    [DirectReturn] bit NULL,
    [MfgID] int NULL,
    [CustomerPhone] nvarchar(50) NULL,
    [CustomerName] nvarchar(50) NULL,
    [SalePOSNo] int NULL,
    [isTaxable] bit NULL
);
GO

CREATE TABLE [dbo].[data_SalePosReturnDetail] (
    [SalePosReturnDetailID] bigint NOT NULL,
    [SalePosDetailID] bigint NULL,
    [SalePosReturnID] bigint NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,2) NULL,
    [ItemRate] numeric(18,2) NULL,
    [TaxPercentage] numeric(18,2) NULL,
    [TaxAmount] numeric(18,2) NULL,
    [DiscountPercentage] numeric(18,2) NULL,
    [DiscountAmount] numeric(18,2) NULL,
    [TotalAmount] numeric(18,2) NULL,
    [IsLog] bit NULL,
    [CartonSize] decimal(18,3) NULL,
    [Carton] decimal(18,3) NULL,
    [TotalQuantity] decimal(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SalePosReturnDetailServer] (
    [SalePosReturnDetailID] bigint NULL,
    [SalePosDetailID] bigint NULL,
    [SalePosReturnID] bigint NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,2) NULL,
    [ItemRate] numeric(18,2) NULL,
    [TaxPercentage] numeric(18,2) NULL,
    [TaxAmount] numeric(18,2) NULL,
    [DiscountPercentage] numeric(18,2) NULL,
    [DiscountAmount] numeric(18,2) NULL,
    [TotalAmount] numeric(18,2) NULL,
    [IsLog] bit NULL,
    [CartonSize] decimal(18,3) NULL,
    [Carton] decimal(18,3) NULL,
    [TotalQuantity] decimal(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SalePosReturnInfo] (
    [SalePosReturnID] bigint NOT NULL,
    [SalePosID] bigint NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SalePosReturnDate] date NULL,
    [WHID] int NULL,
    [TaxAmount] decimal(18,2) NULL,
    [GrossAmount] decimal(18,2) NULL,
    [DiscountPercentage] decimal(18,2) NULL,
    [DiscountAmount] decimal(18,2) NULL,
    [DiscountTotal] decimal(18,2) NULL,
    [OtherCharges] decimal(18,2) NULL,
    [NetAmount] decimal(18,2) NULL,
    [AmountReceive] decimal(18,2) NULL,
    [AmountReturn] decimal(18,2) NULL,
    [LogSourceID] bigint NOT NULL,
    [AmountInAccount] decimal(18,2) NULL,
    [AmountReceivable] decimal(18,2) NULL,
    [AmountPayable] decimal(18,2) NULL,
    [CustomerPhone] nvarchar(50) NULL,
    [CustomerName] nvarchar(50) NULL,
    [SalePOSNo] int NULL
);
GO

CREATE TABLE [dbo].[data_SalePosReturnInfoServer] (
    [SalePosReturnID] bigint NULL,
    [SalePosID] bigint NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SalePosReturnDate] date NULL,
    [WHID] int NULL,
    [TaxAmount] decimal(18,2) NULL,
    [GrossAmount] decimal(18,2) NULL,
    [DiscountPercentage] decimal(18,2) NULL,
    [DiscountAmount] decimal(18,2) NULL,
    [DiscountTotal] decimal(18,2) NULL,
    [OtherCharges] decimal(18,2) NULL,
    [NetAmount] decimal(18,2) NULL,
    [AmountReceive] decimal(18,2) NULL,
    [AmountReturn] decimal(18,2) NULL,
    [LogSourceID] bigint NULL,
    [AmountInAccount] decimal(18,2) NULL,
    [AmountReceivable] decimal(18,2) NULL,
    [AmountPayable] decimal(18,2) NULL,
    [CustomerPhone] nvarchar(50) NULL,
    [CustomerName] nvarchar(50) NULL,
    [SalePOSNo] int NULL
);
GO

CREATE TABLE [dbo].[data_SaleReturnDetail] (
    [SaleReturnDetailID] int NOT NULL,
    [SaleReturnID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [Brokerage] numeric(18,3) NOT NULL,
    [NetAmount] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [SaleDetailID] int NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [CartonQuantity] decimal(18,3) NULL,
    [LooseQuantity] decimal(18,3) NULL,
    [IncentivePerQuantityAmount] numeric(12,2) NULL,
    [IncentivePercentageOnAmount] numeric(12,2) NULL,
    [IncentiveFreightPerQuantityAmount] numeric(12,2) NULL,
    [LoadingPerQuantityAmount] numeric(12,2) NULL,
    [OtherServicesPerQuantityAmount] numeric(12,2) NULL,
    [SOQuantity] numeric(18,3) NULL,
    [SaleOrderDetailID] int NULL,
    [Bardana] numeric(18,3) NULL,
    [ScaleQuantity] numeric(18,3) NULL,
    [WeightedRate] numeric(18,3) NULL,
    [BagsSize] numeric(18,3) NULL,
    [BardanaID] int NULL,
    [VehicleNumber] nvarchar(100) NULL,
    [DiscountRate] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SaleReturnDetailParams] (
    [SaleReturnDetailParamsID] int NOT NULL,
    [SaleReturnDetailID] int NOT NULL,
    [SaleReturnID] int NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_SaleReturnDetailTax] (
    [SRTaxID] int NOT NULL,
    [SaleReturnID] int NULL,
    [SaleReturnDetailID] int NULL,
    [TaxID] int NULL,
    [TaxPercentage] decimal(18,3) NULL,
    [TaxAmountPerUnit] decimal(18,3) NULL,
    [TaxAmount] decimal(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SaleReturnInfo] (
    [SaleReturnID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SaleReturnDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [SaleReturnNo] int NULL,
    [WHID] int NULL,
    [SaleID] int NULL,
    [AccountVoucherID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [SaleOrderID] int NULL,
    [OutwardGatePassID] int NULL,
    [BuyerID] int NULL,
    [SaleOrderNo] nvarchar(50) NULL,
    [ReturnType] nvarchar(50) NULL,
    [StockOutId] int NULL,
    [NetScaleWeight] numeric(18,3) NULL,
    [ReturnInvoiceType] int NULL
);
GO

CREATE TABLE [dbo].[data_SalesManTargetDetail] (
    [SalesmanTargetDetailID] int NOT NULL,
    [SalesmanTargetID] int NULL,
    [ItemId] int NULL,
    [SectorID] int NULL,
    [ItemSalesRate] numeric(18,3) NULL,
    [CartonQty] numeric(18,3) NULL,
    [LooseQty] numeric(18,3) NULL,
    [TotalQty] numeric(18,3) NULL,
    [TargetAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SalesManTargetInfo] (
    [SalesmanTargetID] int NOT NULL,
    [SalesmanTargetDateFrom] datetime NULL,
    [SalesmanTargetDateTo] datetime NULL,
    [TargetName] varchar(100) NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SalesmanTargetNo] int NULL,
    [BranchID] int NULL,
    [ItemMainGroupID] int NULL,
    [SaleManInfoID] int NULL,
    [Remarks] varchar(100) NULL,
    [NetAmount] numeric(18,3) NULL,
    [ZoneID] int NULL,
    [StationID] int NULL
);
GO

CREATE TABLE [dbo].[data_SalesRecoveryBillWise] (
    [RecoveryID] int NOT NULL,
    [BankGlID] int NULL,
    [ReceiptDate] datetime NULL,
    [CheaqueDate] datetime NULL,
    [CheaqueNo] nvarchar(250) NULL,
    [PartyID] int NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [IsTaxable] bit NULL,
    [BranchId] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [AccountVoucherID] int NULL,
    [RecoveryNo] int NULL,
    [TotalRecoverdAmount] numeric(18,3) NULL,
    [PaymentType] int NULL,
    [ImageAttachment] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_SalesRecoveryBillWiseDetail] (
    [RecoveryDetailID] int NOT NULL,
    [SaleID] int NULL,
    [SaleDetailID] int NULL,
    [TaxID] int NULL,
    [TaxTwoID] int NULL,
    [BillRecoveryAmount] numeric(18,3) NULL,
    [TaxOneRecovery] numeric(18,3) NULL,
    [TaxTwoRecovery] numeric(18,3) NULL,
    [RecoveryAmount] numeric(18,3) NULL,
    [Remarks] nchar(10) NULL,
    [RecoveryID] int NULL,
    [Deduction] numeric(18,3) NULL,
    [RemainingAmount] numeric(18,2) NULL
);
GO

CREATE TABLE [dbo].[data_SaleTrackerDetail] (
    [SaleTrackerDetailID] int NOT NULL,
    [SaleTrackerID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [DiscountPercentage] numeric(18,3) NOT NULL,
    [DiscountAmount] numeric(18,3) NOT NULL,
    [ItemRate] numeric(18,3) NULL,
    [NetAmount] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [TaxOneID] int NULL,
    [TaxOneAmount] decimal(18,3) NOT NULL,
    [TaxTwoID] int NULL,
    [TaxTwoAmount] decimal(18,3) NOT NULL,
    [Remarks] nvarchar(300) NULL,
    [MohItemId] int NULL,
    [VehcileRegistrationId] int NULL,
    [VehcileRegistrationNo] nvarchar(150) NULL
);
GO

CREATE TABLE [dbo].[data_SaleTrackerDetailParams] (
    [SaleTrackerDetailParamsID] int NOT NULL,
    [SaleTrackerDetailID] int NOT NULL,
    [SaleTrackerID] int NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_SaleTrackerDetailTax] (
    [SaleTrackerDetailTaxID] int NOT NULL,
    [SaleTrackerDetailID] int NULL,
    [SaleTrackerID] int NULL,
    [TaxID] int NULL,
    [TaxPercentage] decimal(18,3) NULL,
    [TaxAmountPerUnit] decimal(18,3) NULL,
    [TaxAmount] decimal(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SaleTrackerInfo] (
    [SaleTrackerID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SaleTrackerDate] date NULL,
    [PartyID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [SaleTrackerVoucherNo] int NULL,
    [WHID] int NULL,
    [AccountVoucherID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL
);
GO

CREATE TABLE [dbo].[data_ShippingSaleInfo] (
    [ShippingID] int NOT NULL,
    [VehicleRegisterID] int NULL,
    [VehicleNumber] nvarchar(50) NULL,
    [ShippingLine] nvarchar(250) NULL,
    [PartyID] int NULL,
    [BuiltyNumber] int NULL,
    [ParchiNumber] int NULL,
    [VehicleFreight] numeric(18,3) NULL,
    [BillAmount] numeric(18,3) NULL,
    [PhoneNumber] nvarchar(250) NULL,
    [ShippingDate] datetime NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [AccountVoucherID] int NULL,
    [ShippingNumber] int NULL,
    [IsTaxable] bit NULL,
    [BranchID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [LoaderID] int NULL,
    [LoadingWages] numeric(18,3) NULL,
    [AdvanceDriver] numeric(18,3) NULL,
    [ContainerCharges] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_ShippingSaleInfoDetail] (
    [ShippingDetailID] int NOT NULL,
    [ShippingID] int NULL,
    [TaxID] int NULL,
    [TaxAmount] numeric(18,3) NULL,
    [TaxPercentage] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SODeductionDetail] (
    [SODeductionDetailID] int NOT NULL,
    [SODeductionID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [OutwardGatePassDetailID] int NULL,
    [CartonQuantity] numeric(18,3) NOT NULL,
    [LooseQuantity] numeric(18,3) NOT NULL,
    [FinalQuantity] numeric(18,3) NULL,
    [TruckNumber] nvarchar(50) NULL,
    [DriverName] nvarchar(200) NULL,
    [OGPNO] int NULL,
    [OutwardGatePassID] int NULL,
    [StockRate] numeric(18,3) NULL,
    [SaleRate] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_SODeductionInfo] (
    [SODeductionID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SODeductionDate] date NULL,
    [SODeductionNo] int NULL,
    [PartyID] int NULL,
    [Remarks] varchar(300) NULL,
    [SaleOrderID] int NULL,
    [WHID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [BuiltyNo] nvarchar(50) NULL,
    [DriverName] nvarchar(50) NULL,
    [TransporterName] nvarchar(50) NULL,
    [SaleManInfoID] int NULL,
    [OutwardGatePassID] int NULL,
    [AccountVoucherID] int NULL
);
GO

CREATE TABLE [dbo].[data_StockArrivalDetail] (
    [ArrivalIDDetailID] int NOT NULL,
    [ArrivalID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [TransferDetailID] int NULL
);
GO

CREATE TABLE [dbo].[data_StockArrivalInfo] (
    [ArrivalID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [ArrivalDate] date NULL,
    [ArrivalNo] int NULL,
    [ArrivalFromWHID] int NULL,
    [ArrivalToWHID] int NULL,
    [FromBranchID] int NULL,
    [ToBranchID] int NULL,
    [IsTaxable] bit NULL,
    [AccountVoucherID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [RefID] int NULL,
    [isManual] bit NULL,
    [VehicleNo] nvarchar(250) NULL,
    [ManualNo] nvarchar(250) NULL
);
GO

CREATE TABLE [dbo].[data_StockDispatchAgainstTransfer] (
    [StockDispatchID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [DispatchDate] date NULL,
    [DispatchNo] int NULL,
    [DispatchFromWHID] int NULL,
    [DispatchToWHID] int NULL,
    [FromBranchID] int NULL,
    [ToBranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [AccountVoucherID] int NULL,
    [Remarks] varchar(300) NULL,
    [TruckNumber] nvarchar(250) NULL,
    [DriverName] nvarchar(250) NULL,
    [DriverPhone] nvarchar(250) NULL,
    [StockTransferID] int NULL,
    [TransferType] int NULL,
    [MakeOrderID] int NULL
);
GO

CREATE TABLE [dbo].[data_StockDispatchAgainstTransferDetail] (
    [StockDispatchDetailID] int NOT NULL,
    [StockDispatchID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [ItemCode] nvarchar(250) NULL,
    [ItemName] nvarchar(250) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [TransferDetailID] int NULL,
    [TrackBranchID] int NULL,
    [OrderDetailID] int NULL,
    [OrderID] int NULL
);
GO

CREATE TABLE [dbo].[data_StockDispatchAgainstTransferDetailPOS] (
    [POSDispatchDetailID] int NOT NULL,
    [StockDispatchDetailID] int NULL,
    [StockDispatchID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [ItemCode] nvarchar(250) NULL,
    [ItemName] nvarchar(250) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [TransferDetailID] int NULL,
    [TrackBranchID] int NULL,
    [OrderDetailID] int NULL,
    [OrderID] int NULL,
    [DeliveryDate] nvarchar(250) NULL,
    [Rno] int NULL
);
GO

CREATE TABLE [dbo].[data_StockDispatchAgainstTransferPOS] (
    [PosDispatchID] int NOT NULL,
    [StockDispatchID] int NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [DispatchDate] date NULL,
    [DispatchNo] int NULL,
    [DispatchFromWHID] int NULL,
    [DispatchToWHID] int NULL,
    [FromBranchID] int NULL,
    [ToBranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [AccountVoucherID] int NULL,
    [Remarks] varchar(300) NULL,
    [TruckNumber] nvarchar(250) NULL,
    [DriverName] nvarchar(250) NULL,
    [DriverPhone] nvarchar(250) NULL,
    [StockTransferID] int NULL,
    [TransferType] int NULL,
    [MakeOrderID] int NULL,
    [FromLocation] nvarchar(250) NULL,
    [ToLocation] nvarchar(250) NULL,
    [TotalQuantity] numeric(18,3) NULL,
    [TotalAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_StockInOutDetail] (
    [StockIODetailID] int NOT NULL,
    [StockIOID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [ServerDetailID] int NULL,
    [LocationId] int NULL
);
GO

CREATE TABLE [dbo].[data_StockInOutDetailParams] (
    [StockIODetailParamsID] int NOT NULL,
    [StockIODetailID] int NOT NULL,
    [StockIOID] int NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_StockInOutInfo] (
    [StockIOID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [StockIODate] date NULL,
    [StockType] varchar(20) NULL,
    [Remarks] varchar(300) NULL,
    [StockIONo] int NULL,
    [WHID] int NULL,
    [AccountVoucherID] int NULL,
    [StockIOTypeID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [ReadOnly] bit NOT NULL,
    [IssuanceID] int NULL,
    [FromWHID] int NULL,
    [FlockId] int NULL,
    [PartyID] int NULL
);
GO

CREATE TABLE [dbo].[data_StockIssuancetoPosKitchen] (
    [IssuanceID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [IssuanceDate] date NULL,
    [IssuanceNo] int NULL,
    [FromWHID] int NULL,
    [LocationID] int NULL,
    [IsTaxable] bit NULL,
    [Remarks] nvarchar(MAX) NULL,
    [RefID] int NULL,
    [isManual] bit NULL,
    [IssuanceType] int NULL
);
GO

CREATE TABLE [dbo].[data_StockIssuancetoPosKitchenDetail] (
    [IssuanceDetailID] int NOT NULL,
    [IssuanceID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [TransferDetailID] int NULL
);
GO

CREATE TABLE [dbo].[data_StockIssuetoJobCard] (
    [StockIssueID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [IssueDate] date NULL,
    [IssueNo] int NULL,
    [IssueFromWHID] int NULL,
    [IssueBranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [AccountVoucherID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [SRNo] nvarchar(50) NULL,
    [SRDate] datetime NULL,
    [JobCardId] int NULL,
    [JobCardNo] nvarchar(50) NULL,
    [InvoiceNo] nvarchar(50) NULL,
    [SourceNo] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_StockIssuetoJobCardDetail] (
    [StockIssueDetailID] int NOT NULL,
    [StockIssueID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [ReqQuantity] numeric(18,3) NULL,
    [IssueQuantity] numeric(18,3) NULL,
    [TechnicainId] int NULL,
    [LocationID] int NULL,
    [TabId] nvarchar(150) NULL,
    [JobCardId] int NULL,
    [depriciation] numeric(18,3) NULL,
    [ItemRate] numeric(18,3) NOT NULL
);
GO

CREATE TABLE [dbo].[data_StockIssuetoJobCardDetailLog] (
    [StockIssueDetailLogID] int NOT NULL,
    [StockIssuelogID] int NULL,
    [StockIssueDetailID] int NULL,
    [StockIssueID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [ReqQuantity] numeric(18,3) NULL,
    [IssueQuantity] numeric(18,3) NULL,
    [TechnicainId] int NULL,
    [LocationID] int NULL,
    [JobCardId] int NULL,
    [TabId] nvarchar(150) NULL,
    [depriciation] numeric(18,3) NULL,
    [ItemRate] numeric(18,3) NOT NULL
);
GO

CREATE TABLE [dbo].[data_StockIssuetoJobCardLog] (
    [StockIssueLogID] int NOT NULL,
    [StockIssueID] int NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [IssueDate] date NULL,
    [IssueNo] int NULL,
    [IssueFromWHID] int NULL,
    [IssueBranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [AccountVoucherID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [SRNo] nvarchar(50) NULL,
    [SRDate] datetime NULL,
    [JobCardId] int NULL,
    [JobCardNo] nvarchar(50) NULL,
    [InvoiceNo] nvarchar(50) NULL,
    [SourceNo] nvarchar(50) NULL,
    [ModifiedType] int NULL
);
GO

CREATE TABLE [dbo].[data_StockTransferDetail] (
    [StockTransferDetailID] int NOT NULL,
    [StockTransferID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [ItemCode] nvarchar(250) NULL,
    [ItemName] nvarchar(250) NULL,
    [LocationFromID] int NULL,
    [LocationToID] int NULL
);
GO

CREATE TABLE [dbo].[data_StockTransferDetailParams] (
    [StockTransferDetailParamsID] int NOT NULL,
    [StockTransferDetailID] int NOT NULL,
    [StockTransferID] int NOT NULL,
    [ItemId] int NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[data_StockTransferInfo] (
    [StockTransferID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [TransferDate] date NULL,
    [TransferNo] int NULL,
    [TransferFromWHID] int NULL,
    [TransferToWHID] int NULL,
    [FromBranchID] int NULL,
    [ToBranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [AccountVoucherID] int NULL,
    [Remarks] varchar(300) NULL,
    [IsStockToShed] bit NULL,
    [TransferToShedId] int NULL,
    [TruckNumber] nvarchar(250) NULL,
    [DriverName] nvarchar(250) NULL,
    [DriverPhone] nvarchar(250) NULL,
    [LayerFlockiD] int NULL,
    [TransferFromParty] int NULL,
    [TransferToParty] int NULL
);
GO

CREATE TABLE [dbo].[data_StockTransferRawDetail] (
    [StockTransferDetailID] int NOT NULL,
    [StockTransferID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[data_StudentsAttendanceInfo] (
    [AttendanceID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [Date] datetime NULL,
    [BranchID] int NULL,
    [ClassId] int NULL
);
GO

CREATE TABLE [dbo].[data_StudentsAttendanceInfoDetail] (
    [AttendanceDetailID] int NOT NULL,
    [AttendanceID] int NOT NULL,
    [StudentID] int NOT NULL,
    [Status] nvarchar(50) NOT NULL
);
GO

CREATE TABLE [dbo].[data_TestAssignToClassInfo] (
    [TestAssignId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchId] int NULL,
    [ClassId] int NULL,
    [TestId] int NULL,
    [StartTime] datetime NULL,
    [EndTime] datetime NULL,
    [Remarks] nvarchar(MAX) NULL,
    [TestDate] datetime NULL,
    [TeacherId] int NULL,
    [Marks] numeric(18,2) NULL,
    [SubjectId] int NULL
);
GO

CREATE TABLE [dbo].[data_ToolsIssuence] (
    [ToolIssueId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [EmployeeID] int NULL,
    [partyId] int NULL,
    [ForProject] nvarchar(MAX) NULL,
    [IsTaxable] bit NULL,
    [ToolissueDate] datetime NULL,
    [BranchId] int NULL,
    [ProjectID] int NULL,
    [ExpectedReturnDate] datetime NULL,
    [ManualNo] nvarchar(150) NULL,
    [WHID] int NULL
);
GO

CREATE TABLE [dbo].[data_ToolsIssuenceDetail] (
    [ToolIssueDetailId] int NOT NULL,
    [ItemId] int NULL,
    [Status] nvarchar(MAX) NULL,
    [ToolIssueId] int NULL,
    [Quantity] numeric(18,2) NULL,
    [Accessories] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_ToolsReturnForm] (
    [ToolReturnId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [EmployeeID] int NULL,
    [IsTaxable] bit NULL,
    [ToolReturnDate] datetime NULL,
    [BranchId] int NULL,
    [WHID] int NULL
);
GO

CREATE TABLE [dbo].[data_ToolsReturnFormDetail] (
    [ToolReturnDetailId] int NOT NULL,
    [ItemId] int NULL,
    [Status] nvarchar(MAX) NULL,
    [ReturnStatus] nvarchar(MAX) NULL,
    [ToolReturnId] int NULL,
    [Quantity] numeric(18,2) NULL,
    [ToolIssueDetailId] int NULL,
    [Accessories] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[data_TrackerTransferDetail] (
    [MOHDetailId] int NULL,
    [TransferDetailId] int NOT NULL,
    [TransferId] int NOT NULL,
    [ItemId] int NULL,
    [Amount] numeric(14,3) NULL,
    [Param1] varchar(50) NULL,
    [Param2] varchar(50) NULL,
    [Param3] varchar(50) NULL,
    [ItemId1] int NULL,
    [Amount1] numeric(14,3) NULL,
    [Param11] varchar(50) NULL,
    [Param21] varchar(50) NULL,
    [Param31] varchar(50) NULL,
    [isTrasnfered] bit NULL
);
GO

CREATE TABLE [dbo].[data_TrackerTransferInffo] (
    [TransferId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [FromBranchId] int NULL,
    [TransferDate] date NULL,
    [Remarks] varchar(300) NULL,
    [TransferNo] int NULL,
    [toBranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [TransferFromWHID] int NULL,
    [TransferToWHID] int NULL
);
GO

CREATE TABLE [dbo].[data_TransporterFreightDetail] (
    [TransporterFreightDetailID] int NOT NULL,
    [TransporterFreightID] int NULL,
    [SectorID] int NULL,
    [FreightAmount] decimal(18,0) NULL
);
GO

CREATE TABLE [dbo].[data_TransporterFreightInfo] (
    [TransporterFreightID] int NOT NULL,
    [TransporterID] int NULL,
    [EffectiveDate] date NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[data_UserRegistration] (
    [RegisterationID] int NOT NULL,
    [RegistrationDate] datetime NULL,
    [RegisterEmail] nvarchar(500) NULL,
    [Password] nvarchar(250) NULL,
    [NoOfUsers] int NULL,
    [Companyid] int NULL,
    [CompanyTitle] nvarchar(100) NULL,
    [ShortTitle] nvarchar(10) NULL,
    [Email] nvarchar(50) NULL,
    [Address] nvarchar(500) NULL,
    [Phone] nvarchar(50) NULL,
    [website] nvarchar(100) NULL,
    [NTNNo] nvarchar(50) NULL,
    [St_Registration] nvarchar(50) NULL,
    [CompanyImage] nvarchar(100) NULL,
    [Inactive] bit NOT NULL,
    [SaleEmail] nvarchar(50) NULL,
    [VerificationNumber] int NULL,
    [UserID] int NULL,
    [CompanyCode] int NULL
);
GO

CREATE TABLE [dbo].[data_UserRegistrationDetail] (
    [DetailID] int NOT NULL,
    [RegistrationID] int NULL,
    [CompanyID] int NULL,
    [UserID] int NULL,
    [MenuID] int NULL,
    [TrialExpireDate] datetime NULL
);
GO

CREATE TABLE [dbo].[data_ZoneFreightDetail] (
    [ZoneFreightDetailID] int NOT NULL,
    [ZoneFreightID] int NULL,
    [ItemId] int NULL,
    [ItemRate] decimal(18,2) NULL
);
GO

CREATE TABLE [dbo].[data_ZoneFreightInfo] (
    [ZoneFreightID] int NOT NULL,
    [ZoneID] int NULL,
    [EffectiveDate] date NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[dataPOS_StockArrival] (
    [ArrivalID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [ArrivalDate] date NULL,
    [ArrivalNo] int NULL,
    [ArrivalFromWHID] int NULL,
    [ArrivalToWHID] int NULL,
    [FromBranchID] int NULL,
    [ToBranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [AccountVoucherID] int NULL,
    [Remarks] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[dimensionType] (
    [TypeID] int NOT NULL,
    [dimension] nvarchar(50) NULL,
    [Description] nvarchar(100) NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[dimensionValues] (
    [DValuesID] int NOT NULL,
    [TypeID] int NULL,
    [DValue] varchar(100) NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[Fbr_Configurations] (
    [ConfID] int NOT NULL,
    [POSID] int NULL,
    [SaleTypeCode] nvarchar(50) NULL,
    [PurchaseTypeCode] nvarchar(50) NULL,
    [SROCode] nvarchar(50) NULL,
    [CompanyID] int NULL,
    [AccessToken] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[Fbr_DigitalInvoicing] (
    [MasterID] int NOT NULL,
    [bposId] varchar(100) NULL,
    [invoiceType] int NOT NULL,
    [invoiceDate] datetime NOT NULL,
    [ntN_CNIC] varchar(20) NOT NULL,
    [buyerSellerName] varchar(255) NOT NULL,
    [destinationAddress] varchar(255) NOT NULL,
    [saleType] varchar(50) NOT NULL,
    [totalSalesTaxApplicable] decimal(18,2) NOT NULL,
    [totalRetailPrice] decimal(18,2) NOT NULL,
    [totalSTWithheldAtSource] decimal(18,2) NULL,
    [totalExtraTax] decimal(18,2) NULL,
    [totalFEDPayable] decimal(18,2) NULL,
    [totalWithheldIncomeTax] decimal(18,2) NULL,
    [totalCVT] decimal(18,2) NULL,
    [distributor_NTN_CNIC] varchar(20) NULL,
    [distributorName] varchar(255) NULL,
    [FbrInvoiceNumber] varchar(100) NULL,
    [imagePath] nvarchar(MAX) NULL,
    [totalDiscount] numeric(18,2) NULL
);
GO

CREATE TABLE [dbo].[Fbr_DigitalInvoicingDetail] (
    [DetailID] int NOT NULL,
    [MasterID] int NULL,
    [hsCode] varchar(10) NULL,
    [productCode] varchar(50) NOT NULL,
    [productDescription] varchar(255) NOT NULL,
    [rate] decimal(18,2) NOT NULL,
    [uoM] varchar(50) NOT NULL,
    [quantity] decimal(18,2) NOT NULL,
    [valueSalesExcludingST] decimal(18,2) NOT NULL,
    [salesTaxApplicable] decimal(18,2) NOT NULL,
    [retailPrice] decimal(18,2) NOT NULL,
    [stWithheldAtSource] decimal(18,2) NULL,
    [extraTax] decimal(18,2) NULL,
    [furtherTax] decimal(18,2) NULL,
    [sroScheduleNo] varchar(100) NULL,
    [fedPayable] decimal(18,2) NULL,
    [cvt] decimal(18,2) NOT NULL,
    [whiT_1] decimal(18,2) NULL,
    [whiT_2] decimal(18,2) NULL,
    [whiT_Section_1] varchar(100) NULL,
    [whiT_Section_2] varchar(100) NULL,
    [totalValues] decimal(18,2) NOT NULL,
    [Discount] numeric(18,2) NULL
);
GO

CREATE TABLE [dbo].[FBR_InvoiceDetail] (
    [SIDDetailID] int NOT NULL,
    [SID] int NULL,
    [ItemCode] varchar(50) NOT NULL,
    [ItemName] varchar(150) NULL,
    [PCTCode] varchar(8) NOT NULL,
    [Quantity] numeric(18,3) NOT NULL,
    [TaxRate] numeric(18,3) NOT NULL,
    [SaleValue] numeric(18,3) NULL,
    [Discount] numeric(18,3) NULL,
    [FurtherTax] numeric(18,3) NULL,
    [TaxCharged] numeric(18,3) NULL,
    [TotalAmount] numeric(18,3) NULL,
    [InvoiceType] int NULL,
    [RefUSIN] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[FBR_InvoiceMaster] (
    [SID] int NOT NULL,
    [SalePOSID] int NOT NULL,
    [InvoiceNumber] varchar(30) NULL,
    [POSID] bigint NOT NULL,
    [USIN] varchar(50) NOT NULL,
    [RefUSIN] varchar(50) NULL,
    [DateTime] datetime NOT NULL,
    [BuyerName] varchar(150) NULL,
    [BuyerNTN] varchar(9) NULL,
    [BuyerCNIC] varchar(13) NULL,
    [BuyerPhoneNumber] varchar(20) NULL,
    [TotalSaleValue] numeric(18,3) NOT NULL,
    [TotalTaxCharged] numeric(18,3) NOT NULL,
    [TotalQuantity] numeric(18,3) NOT NULL,
    [Discount] numeric(18,3) NULL,
    [FurtherTax] numeric(18,3) NULL,
    [TotalBillAmount] numeric(18,3) NOT NULL,
    [PaymentMode] int NOT NULL,
    [InvoiceType] int NULL,
    [isSynced] bit NULL,
    [FBRInvoiceNumber] nvarchar(MAX) NULL,
    [CreatedBy] int NULL,
    [CreatedDate] datetime NULL,
    [CounterID] int NULL,
    [CompanyID] int NULL,
    [WHID] int NULL,
    [SaleSerielNo] int NULL,
    [FISCALID] int NULL,
    [IsTaxable] bit NULL,
    [imagePath] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[Fbr_SaleTypesCodesList] (
    [ID] int NOT NULL,
    [TRANSACTION_Code] nvarchar(250) NULL,
    [Description] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[Fbr_UomCodes] (
    [ID] int NOT NULL,
    [UOM_Code] nvarchar(250) NULL,
    [UOM_Name] nvarchar(250) NULL
);
GO

CREATE TABLE [dbo].[gen_accountCategory] (
    [AccountCategoryID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [AccountCategoryName] varchar(50) NULL
);
GO

CREATE TABLE [dbo].[Gen_Agreement] (
    [AgreementID] int NOT NULL,
    [AgreementNo] int NULL,
    [ConnectivityLayerID] int NULL,
    [ConnectivityLayer] nvarchar(50) NULL,
    [ConnectivityID] int NULL,
    [Connectivity] nvarchar(50) NULL,
    [Bandwidth] nvarchar(50) NULL,
    [AgreementTerm] int NULL,
    [EquipmentId] int NULL,
    [EquipMentType] nvarchar(50) NULL,
    [P2PEquipment] bit NULL,
    [OfcEquipment] bit NULL,
    [VsatEquipment] bit NULL,
    [CIREquipment] bit NULL,
    [Invoicetypeid] int NULL,
    [InvoiceType] nvarchar(50) NULL,
    [Currency] nvarchar(50) NULL,
    [OTC] nvarchar(50) NULL,
    [MRC] nvarchar(50) NULL,
    [CommercialsEquipment] nvarchar(50) NULL,
    [CustomerName] nvarchar(50) NULL,
    [InstallationAddress] nvarchar(50) NULL,
    [BillingAddress] nvarchar(50) NULL,
    [SiteACoordinatesLongtude] nvarchar(50) NULL,
    [SiteACoordinatesLatitude] nvarchar(50) NULL,
    [SiteBCoordinatesLongtude] nvarchar(50) NULL,
    [SiteBCoordinatesLatitude] nvarchar(50) NULL,
    [IpsAlloted] nvarchar(350) NULL,
    [RelocationAddress] nvarchar(500) NULL,
    [UpgradedetailBwFrom] nvarchar(50) NULL,
    [UpgradedetailBwTo] nvarchar(50) NULL,
    [UpgradedetailPriceFrom] numeric(18,2) NULL,
    [UpgradedetailPriceTo] numeric(18,2) NULL,
    [DowngradedetailBwFrom] nvarchar(50) NULL,
    [DowngradedetailBwTo] nvarchar(50) NULL,
    [DowngradedetaiPriceFrom] numeric(18,2) NULL,
    [DowngradedetaiPriceTo] numeric(18,2) NULL,
    [PocDetailCompanyName] nvarchar(500) NULL,
    [PocDetailCell] nvarchar(50) NULL,
    [PocDetailDesig] nvarchar(50) NULL,
    [PocDetailEMail] nvarchar(50) NULL,
    [PocDetailInstallationAddressName] nvarchar(500) NULL,
    [PocDetailInstallationAddressCell] nvarchar(50) NULL,
    [PocDetailInstallationAddressDesig] nvarchar(50) NULL,
    [PocDetailInstallationAddressEMail] nvarchar(50) NULL,
    [CompanyName] nvarchar(500) NULL,
    [RegisteredADDRESS] nvarchar(500) NULL,
    [NationalTaxNumber] nvarchar(50) NULL,
    [DesignatedContact] nvarchar(50) NULL,
    [Designation] nvarchar(50) NULL,
    [CINIC] nvarchar(50) NULL,
    [CellPhone] nvarchar(50) NULL,
    [EMail] nvarchar(50) NULL,
    [CompanyId] int NULL,
    [FiscalId] int NULL,
    [UserID] int NULL,
    [EnteryDate] datetime NULL,
    [ModifyDate] datetime NULL,
    [ModifyUserID] int NULL,
    [IsTaxable] bit NULL,
    [AgreementDate] datetime NULL,
    [EquipmentRatio] nvarchar(50) NULL,
    [FilesAddress] nvarchar(1000) NULL,
    [ConnectionType] int NULL,
    [ConnectivityCIR] int NULL,
    [OwnerDesgination] nvarchar(200) NULL,
    [OwnerContact] nvarchar(200) NULL,
    [OwnerCnic] nvarchar(200) NULL,
    [OwnerEmail] nvarchar(200) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [OwnerDesignated] nvarchar(200) NULL
);
GO

CREATE TABLE [dbo].[gen_BankInformation] (
    [BankInfoID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BankAccountTitle] nvarchar(100) NULL,
    [GLCAID] int NULL,
    [BankAccountNumber] nvarchar(50) NULL,
    [BankName] nvarchar(50) NULL,
    [BankBranchCode] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[gen_BOMDetail] (
    [BOMDetailID] int NOT NULL,
    [BOMID] int NOT NULL,
    [ItemId] int NULL,
    [UOMId] int NULL,
    [Quantity] numeric(10,3) NULL,
    [Remarks] varchar(300) NULL
);
GO

CREATE TABLE [dbo].[gen_BOMInfo] (
    [BOMID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BOMNo] int NULL,
    [ItemId] int NULL,
    [UOMId] int NULL,
    [BaseQuantity] numeric(10,3) NULL,
    [Remarks] varchar(300) NULL,
    [DefaultBOM] bit NOT NULL,
    [BranchID] int NULL,
    [Hours] int NULL,
    [PerHourProduction] numeric(18,3) NULL,
    [WHID] int NOT NULL,
    [PartyID] int NULL
);
GO

CREATE TABLE [dbo].[gen_BOMPlanning] (
    [PlanningID] int NOT NULL,
    [BOMID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [PlanningNo] int NULL,
    [PlanningDate] datetime NULL,
    [ItemId] int NULL,
    [WHID] int NOT NULL,
    [UOMId] int NULL,
    [BaseQuantity] numeric(10,3) NULL,
    [Remarks] varchar(300) NULL,
    [DefaultBOM] bit NOT NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NULL,
    [FiscalID] int NULL,
    [CartonQuantity] numeric(18,3) NOT NULL,
    [LooseQuantity] numeric(18,3) NOT NULL,
    [ManualCode] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[gen_BOMPlanningDetail] (
    [PlanningDetailID] int NOT NULL,
    [PlanningID] int NOT NULL,
    [ItemId] int NULL,
    [UOMId] int NULL,
    [BOMQuantity] numeric(10,3) NULL,
    [PlanningQuantity] numeric(10,3) NULL,
    [Remarks] varchar(300) NULL,
    [WHID] int NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [BOMFormulaQuantity] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[gen_BranchInfo] (
    [BranchID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchName] nvarchar(100) NULL,
    [BranchCode] nvarchar(50) NULL,
    [BranchNumber] nvarchar(50) NULL,
    [BranchEmail] nvarchar(50) NULL,
    [BranchAddress] nvarchar(200) NULL,
    [BranchDescription] nvarchar(500) NULL
);
GO

CREATE TABLE [dbo].[gen_BrokerInformation] (
    [BrokerID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BrokerTitle] nvarchar(100) NULL,
    [GLCAID] int NULL,
    [MobileNumber] nvarchar(100) NULL
);
GO

CREATE TABLE [dbo].[gen_BusinessInfo] (
    [BusinessID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [BusinessName] nvarchar(50) NULL,
    [ShortName] nvarchar(50) NULL,
    [Logo] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[gen_CashFlowConfiguration] (
    [ID] int NOT NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [CashGroup] nvarchar(50) NULL,
    [Payable] nvarchar(50) NULL,
    [OtherAccurales] nvarchar(50) NULL,
    [StockInTrade] nvarchar(50) NULL,
    [Receivables] nvarchar(50) NULL,
    [AdvancesAndDeposits] nvarchar(50) NULL,
    [Style] nvarchar(50) NULL,
    [Investing] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[gen_CashInformation] (
    [CashInfoID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [AccountTitle] nvarchar(50) NULL,
    [CashAccount] int NULL,
    [BranchID] int NULL
);
GO

CREATE TABLE [dbo].[gen_CategoryLevel] (
    [CategoryLevelID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevel] varchar(100) NULL,
    [DateFrom] date NULL,
    [DateTo] date NULL,
    [NoOfUnits] numeric(12,0) NULL
);
GO

CREATE TABLE [dbo].[gen_CheckBookInfo] (
    [CheckBookID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BankId] int NULL,
    [SerialNoStart] numeric(18,0) NULL,
    [SerialNoEnd] numeric(18,0) NULL,
    [BranchID] int NULL,
    [IsActive] bit NOT NULL
);
GO

CREATE TABLE [dbo].[gen_CityInfo] (
    [CityID] int NOT NULL,
    [CityName] varchar(100) NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[gen_ClassAssignToTeacherdetail] (
    [ClassAssigntoTeacherDetailId] int NOT NULL,
    [ClassAssigntoTeacherId] int NULL,
    [SubjectId] int NULL,
    [TeacherId] nvarchar(MAX) NULL,
    [Remarks] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[gen_ClassAssignToTeacherInfo] (
    [ClassAssigntoTeacherId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchID] int NULL,
    [ClassId] int NULL,
    [Remarks] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[gen_ClassInfo] (
    [ClassID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [ClassTitle] varchar(50) NULL,
    [BranchId] int NULL,
    [AddmissionFees] numeric(18,2) NULL,
    [AnnualFees] numeric(18,2) NULL,
    [MonthlyFees] numeric(18,2) NULL,
    [OtherCharges] numeric(18,2) NULL
);
GO

CREATE TABLE [dbo].[gen_CustomerEquipmentInfo] (
    [CusEquipmentId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [EquipmentName] nvarchar(50) NULL,
    [ProcedureNo] nvarchar(50) NULL,
    [RevisionDate] datetime NULL
);
GO

CREATE TABLE [dbo].[gen_DepartmentInfo] (
    [DepartmentID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [DepartmentName] varchar(100) NULL,
    [DepartmentAbbreivation] varchar(50) NULL,
    [DepartmentAccountID] int NULL,
    [DutyHours] numeric(18,2) NULL,
    [TimeIn] datetime NULL,
    [TimeOut] datetime NULL
);
GO

CREATE TABLE [dbo].[gen_DesignationInfo] (
    [DesignationID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [DesignationName] varchar(100) NULL,
    [DesignationAbbreivation] varchar(50) NULL,
    [BasicSalary] numeric(8,2) NULL,
    [MedicalAllowance] numeric(8,2) NULL,
    [HouseRent] numeric(8,2) NULL,
    [Tax] numeric(18,2) NULL
);
GO

CREATE TABLE [dbo].[gen_DistributorClients] (
    [DisClientsID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [ClientsName] varchar(50) NULL,
    [FatherName] varchar(50) NULL,
    [CNICno] varchar(50) NULL,
    [PhoneNo] varchar(50) NULL,
    [MobileNo] nchar(20) NULL,
    [EmailAddress] nchar(20) NULL,
    [PermanentAddress] varchar(200) NULL,
    [TemporaryAddress] varchar(200) NULL,
    [DOB] datetime NULL,
    [Gender] varchar(50) NULL,
    [ClientImage] nvarchar(MAX) NULL,
    [ClientGLID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [ConnectionType] varchar(50) NULL,
    [IsActive] bit NULL,
    [CNICImageFront] nvarchar(MAX) NULL,
    [AccountVoucherID] int NULL,
    [RegisterDate] datetime NULL,
    [FiscalID] int NULL,
    [BranchID] int NULL,
    [alotphoneno] nvarchar(250) NULL,
    [password] nvarchar(250) NULL,
    [PartyID] int NULL,
    [PackageID] int NULL
);
GO

CREATE TABLE [dbo].[gen_EmployeeEducationDetail] (
    [EmployeeEducationDetailID] int NOT NULL,
    [EmployeeID] int NULL,
    [DegreeName] varchar(50) NULL,
    [TotalMarks] numeric(18,2) NULL,
    [ObtainMarks] numeric(18,2) NULL,
    [Institute] varchar(100) NULL,
    [PassingYear] varchar(10) NULL
);
GO

CREATE TABLE [dbo].[gen_EmployeeExperienceDetail] (
    [EmployeExperienceDetailID] int NOT NULL,
    [EmployeeID] int NULL,
    [CompanyName] varchar(50) NULL,
    [Designation] varchar(50) NULL,
    [FromDate] date NULL,
    [ToDate] date NULL
);
GO

CREATE TABLE [dbo].[gen_EmployeeIncrementDetail] (
    [EmployeeIncementDetailId] int NOT NULL,
    [EmployeeIncrementId] int NOT NULL,
    [EmployeeID] int NOT NULL,
    [BasicSalary] numeric(18,2) NULL,
    [IncrementPercentage] numeric(18,2) NULL,
    [IncrementAmount] numeric(18,2) NULL,
    [TotalAmount] numeric(18,2) NULL
);
GO

CREATE TABLE [dbo].[gen_EmployeeIncrementInfo] (
    [EmployeeIncrementId] int NOT NULL,
    [IncrementDate] datetime NULL,
    [EntryUserID] int NOT NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[gen_EmployeeInfo] (
    [EmployeeID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [DepartmentID] int NULL,
    [DesignationID] int NULL,
    [EmployeeName] varchar(50) NULL,
    [FatherName] varchar(50) NULL,
    [CNICno] varchar(50) NULL,
    [PhoneNo] varchar(20) NULL,
    [MobileNo] nchar(20) NULL,
    [EmailAddress] varchar(50) NULL,
    [PermanentAddress] varchar(200) NULL,
    [TemporaryAddress] varchar(200) NULL,
    [DOB] date NULL,
    [EmployeeGender] varchar(50) NULL,
    [JoiningDate] date NULL,
    [ResignDate] date NULL,
    [EmployeeImage] varchar(100) NULL,
    [BasicSalary] numeric(8,2) NULL,
    [MedicalAllowance] numeric(8,2) NULL,
    [HouseRent] numeric(8,2) NULL,
    [Tax] numeric(8,2) NULL,
    [EmployeeGLID] int NULL,
    [DepartmentAccountID] int NULL,
    [MachineId] int NULL,
    [EnrollmentNo] nvarchar(50) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [EOBI] numeric(8,2) NULL,
    [EmployeeNo] nvarchar(50) NULL,
    [WHID] int NULL
);
GO

CREATE TABLE [dbo].[gen_EmployeeLeaveDetail] (
    [LeaveDetailID] int NOT NULL,
    [LeavingID] int NULL,
    [LeaveTypeID] int NULL,
    [FromDate] date NULL,
    [ToDate] date NULL
);
GO

CREATE TABLE [dbo].[gen_EmployeeLeaveInfo] (
    [LeavingID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [EmployeeID] int NULL,
    [Date] date NULL,
    [LeavesofMonth] date NULL,
    [LeaveReason] nvarchar(MAX) NULL,
    [IsApprove] bit NULL,
    [LeaveAddress] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[gen_EmployeeLeaveTypeInfo] (
    [LeaveTypeID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [LeaveType] varchar(100) NULL,
    [IsAbsent] bit NOT NULL
);
GO

CREATE TABLE [dbo].[gen_Event] (
    [EventID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchId] int NULL,
    [EventTitle] nchar(50) NULL,
    [EventDescription] nchar(100) NULL
);
GO

CREATE TABLE [dbo].[gen_FlockPenDivision] (
    [PenID] int NOT NULL,
    [PenName] nvarchar(100) NULL,
    [LayerFlockID] int NULL
);
GO

CREATE TABLE [dbo].[gen_GradeDefine] (
    [GradeID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchId] int NULL,
    [Too] varchar(100) NULL,
    [Froom] varchar(20) NULL,
    [Grade] varchar(200) NULL
);
GO

CREATE TABLE [dbo].[gen_GroupLevel] (
    [GroupLevelID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [GroupLevel] varchar(100) NULL,
    [ContactPerson] varchar(100) NULL,
    [MobileNo] varchar(20) NULL,
    [Address] varchar(200) NULL
);
GO

CREATE TABLE [dbo].[gen_IncentiveDetail] (
    [IncentiveDetailID] int NOT NULL,
    [IncentiveID] int NULL,
    [PartyID] int NULL,
    [PerQuantity] numeric(10,2) NOT NULL,
    [PercentageOnAmount] numeric(7,2) NOT NULL,
    [FreightPerQuantity] numeric(10,2) NOT NULL,
    [LoadingPerQuantity] numeric(10,2) NULL,
    [OtherServicesPerQuantity] numeric(10,2) NULL,
    [AddExtraAmount] numeric(10,2) NULL
);
GO

CREATE TABLE [dbo].[gen_IncentiveInformation] (
    [IncentiveID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [EffectiveDate] date NULL
);
GO

CREATE TABLE [dbo].[gen_ItemAttributeInfo] (
    [AttributeId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [AttribDescription] nvarchar(500) NULL
);
GO

CREATE TABLE [dbo].[gen_ItemMainGroupInfo] (
    [ItemMainGroupID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [ItemMainGroupName] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[gen_ItemsLocation] (
    [LocationID] int NOT NULL,
    [SNO] int NULL,
    [LocCode] nvarchar(50) NULL,
    [CellDescription] nvarchar(500) NULL,
    [UserId] int NULL,
    [EnteryBy] nvarchar(50) NULL,
    [CompanyId] int NULL,
    [EnteryDate] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyDate] datetime NULL,
    [WHID] int NULL,
    [BranchID] int NULL
);
GO

CREATE TABLE [dbo].[gen_ItemSubCategoryInfo] (
    [SubCategoryId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [SubCatDescription] nvarchar(500) NULL
);
GO

CREATE TABLE [dbo].[gen_ItemVariantInfo] (
    [ItemVariantInfoId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [VariantDescription] nvarchar(500) NULL,
    [avc] int NULL
);
GO

CREATE TABLE [dbo].[gen_JobCardType] (
    [JobCardTypeId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [CardCode] nvarchar(50) NULL,
    [Title] nvarchar(300) NULL,
    [Description] nvarchar(300) NULL,
    [Status] bit NULL,
    [SNo] int NULL,
    [JobRevenueAccount] int NULL,
    [PartsRevenueAccount] int NULL,
    [ReceivableAccount] int NULL
);
GO

CREATE TABLE [dbo].[gen_JobInfo] (
    [JobInfoId] int NOT NULL,
    [JobCode] nvarchar(50) NULL,
    [Title] nvarchar(300) NULL,
    [Description] nvarchar(300) NULL,
    [CompanyId] int NULL,
    [Status] bit NULL,
    [EntryBy] nvarchar(50) NULL,
    [UserId] int NULL,
    [EntryDate] datetime NULL,
    [ModifyDate] datetime NULL,
    [ModifyUserId] int NULL,
    [BranchId] int NULL,
    [SerialNo] int NULL,
    [LobourRate] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[gen_JobType] (
    [JobId] int NOT NULL,
    [JobCode] nvarchar(50) NULL,
    [Title] nvarchar(300) NULL,
    [Description] nvarchar(300) NULL,
    [Companyid] int NULL,
    [Status] bit NULL,
    [EntryBy] nvarchar(50) NULL,
    [UserID] int NULL,
    [EnteryDate] datetime NULL,
    [ModifyDate] datetime NULL,
    [ModifyUserId] int NULL,
    [SNO] int NULL,
    [InvoiceCalculationType] tinyint NOT NULL
);
GO

CREATE TABLE [dbo].[gen_MachineAttdendanceInfo] (
    [MachineAttendanceId] int NOT NULL,
    [MachineId] int NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[gen_MachineAttendanceInfoDetail] (
    [MachineAttendenceDetailId] int NOT NULL,
    [MachineAttendanceId] int NULL,
    [EnrollmentNo] nvarchar(50) NULL,
    [TimeIn] datetime NULL,
    [TimeOut] datetime NULL,
    [DateIn] datetime NULL,
    [DateOut] datetime NULL,
    [InOutMode] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[gen_MasterEquipmentInfo] (
    [EquipmentId] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchID] int NULL,
    [EquipmentName] nvarchar(50) NULL,
    [Model] nvarchar(50) NULL,
    [SerialNo] nvarchar(50) NULL,
    [IdNo] nvarchar(50) NULL,
    [Traciability] nvarchar(50) NULL,
    [CalibDate] datetime NULL,
    [CalibDueDate] datetime NULL
);
GO

CREATE TABLE [dbo].[gen_ParentsInfo] (
    [ParentsID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchId] int NULL,
    [FirstName] nvarchar(50) NULL,
    [LastName] nvarchar(50) NULL,
    [CNIC] nvarchar(50) NULL,
    [PhoneNo] nvarchar(50) NULL,
    [Email] nvarchar(50) NULL,
    [Picture] nvarchar(50) NULL,
    [Attachments] nvarchar(MAX) NULL,
    [Address] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[gen_PartiesInfo] (
    [PartyID] int NOT NULL,
    [SectorID] int NULL,
    [PartyName] varchar(100) NULL,
    [PartyGLID] int NULL,
    [AddressOne] varchar(300) NULL,
    [AddressTwo] varchar(300) NULL,
    [CreditLimit] decimal(18,0) NULL,
    [PhoneOne] varchar(50) NULL,
    [PhoneTwo] varchar(50) NULL,
    [Fax] varchar(100) NULL,
    [Email] nvarchar(200) NULL,
    [CNIC] varchar(20) NULL,
    [SaleTaxRegNo] varchar(30) NULL,
    [NTNNO] varchar(30) NULL,
    [ContactPerson] varchar(100) NULL,
    [ContactPersonMobile] nvarchar(150) NULL,
    [ContactPersonEmail] varchar(20) NULL,
    [CompanyID] int NULL,
    [PartyGroupID] int NULL,
    [ReadOnly] bit NOT NULL,
    [Remarks] nvarchar(500) NULL,
    [TermsandCondition] nvarchar(1000) NULL,
    [SaleManInfoID] int NULL,
    [PartyWeightCode] int NULL,
    [UrduParty] nvarchar(50) NULL,
    [LicenseNo] nvarchar(200) NULL,
    [LicenseExpiryDate] datetime NULL,
    [DealerName] nvarchar(100) NULL,
    [LoginUserName] nvarchar(50) NULL,
    [LoginPasswords] nvarchar(50) NULL,
    [FatherName] nvarchar(250) NULL,
    [CityNameManual] nvarchar(1000) NULL,
    [NamesofWeek] varchar(20) NULL,
    [CityID] int NULL
);
GO

CREATE TABLE [dbo].[gen_PartyGroup] (
    [PartyGroupID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [GroupName] varchar(100) NULL,
    [PartyGroupAccountID] int NULL,
    [PartyType] tinyint NULL
);
GO

CREATE TABLE [dbo].[gen_PaymentMode] (
    [PaymentModeID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [PaymentModeTitle] nvarchar(100) NULL
);
GO

CREATE TABLE [dbo].[gen_PaymentTerm] (
    [PaymentTermID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [Name] varchar(100) NULL,
    [NoOfDays] int NULL
);
GO

CREATE TABLE [dbo].[gen_PendingPaymentRecordsDetail] (
    [vDetailID] int NOT NULL,
    [PendingPaymentId] int NOT NULL,
    [GlAccountID] int NOT NULL,
    [DTypeID] int NULL,
    [DvaluesID] int NULL,
    [ChequeNo] nvarchar(20) NULL,
    [ChequeDate] nvarchar(50) NULL,
    [dr] numeric(18,3) NOT NULL,
    [cr] numeric(18,3) NOT NULL,
    [DetailLog] int NULL,
    [Narration] nvarchar(MAX) NULL,
    [HoldingTax] numeric(18,3) NULL,
    [WHRate] numeric(18,3) NULL,
    [GSTHRate] numeric(18,3) NULL,
    [GSTHAmount] numeric(18,3) NULL,
    [NetAmount] numeric(18,3) NULL,
    [ActualAmount] numeric(18,3) NULL,
    [WholdingGL] int NULL,
    [GSTHoldingGL] int NULL,
    [PartyName] nvarchar(500) NULL,
    [WHID] int NULL,
    [LayerFlockID] int NULL
);
GO

CREATE TABLE [dbo].[gen_PendingPaymentRecordsInfo] (
    [PendingPaymentId] int NOT NULL,
    [vType] int NOT NULL,
    [vNO] nvarchar(20) NULL,
    [vDate] date NULL,
    [vCheqNo] nvarchar(15) NULL,
    [vCheqDate] datetime NULL,
    [vcheqtype] varchar(25) NULL,
    [VSTaxRate] smallint NULL,
    [vExcRate] money NULL,
    [vremarks] nvarchar(300) NULL,
    [FiscalID] int NULL,
    [Comp_Id] int NOT NULL,
    [vUserID] int NULL,
    [vWorkStation] nvarchar(50) NULL,
    [vCancel] bit NOT NULL,
    [vPost] bit NOT NULL,
    [vPostedById] int NULL,
    [vPostedByDate] datetime NULL,
    [vPostedByWS] nvarchar(50) NULL,
    [vUserName] nvarchar(25) NULL,
    [vEnterDate] datetime NULL,
    [TotalCr] decimal(18,3) NULL,
    [TotalDr] decimal(18,3) NULL,
    [ReadOnly] bit NOT NULL,
    [AccountCategoryID] int NULL,
    [IsTaxable] bit NOT NULL,
    [BranchID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CashBankAccountID] int NULL,
    [vNO2] nvarchar(50) NULL,
    [CheckBookID] int NULL,
    [Status] int NULL,
    [SNO] int NULL,
    [AccountVoucherID] int NULL,
    [Image] varchar(MAX) NULL,
    [InvoiceNumber] int NULL,
    [ReceiptNo] nvarchar(50) NULL,
    [PhoneNumber] nvarchar(100) NULL
);
GO

CREATE TABLE [dbo].[gen_Pes_SaleManInfo] (
    [SaleManID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [SaleManInfoID] int NULL,
    [SerialNoStart] numeric(18,0) NULL,
    [SerialNoEnd] numeric(18,0) NULL,
    [BranchID] int NULL,
    [IsActive] bit NOT NULL
);
GO

CREATE TABLE [dbo].[gen_PosConfiguration] (
    [ConfigID] int NOT NULL,
    [CompanyID] int NULL,
    [WHID] int NULL,
    [FiscalID] int NULL,
    [AppID] int NULL,
    [ClosingType] int NULL,
    [ClosinngSource] int NULL,
    [RevenueAccountPOS] int NULL,
    [BranchID] int NULL,
    [CashAccountPos] int NULL,
    [LocationID] int NULL,
    [DiscountGL] int NULL,
    [CostAcccount] int NULL,
    [ExpenseAccount] int NULL
);
GO

CREATE TABLE [dbo].[gen_SalaryTaxDetail] (
    [TaxDetailID] int NOT NULL,
    [SalaryTaxID] int NULL,
    [FromDate] date NULL,
    [ToDate] date NULL,
    [TaxPercentage] numeric(6,3) NULL,
    [TaxAmount] numeric(10,3) NULL,
    [SalaryLimitFrom] int NULL,
    [SalaryLimitTo] int NULL,
    [FixedAmount] int NULL
);
GO

CREATE TABLE [dbo].[gen_SalaryTaxInfo] (
    [SalaryTaxID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [SalaryTaxName] varchar(100) NULL,
    [GLCAID] int NULL,
    [Date] datetime NULL,
    [SalaryLimit] numeric(8,2) NULL
);
GO

CREATE TABLE [dbo].[gen_SaleDeliveryDetail] (
    [DeliveryDetailId] int NOT NULL,
    [DeliveryID] int NULL,
    [SaleId] int NULL,
    [PartyId] int NULL,
    [TotalSaleAmount] numeric(18,3) NULL,
    [TotalRecoverdAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[gen_SaleDeliveryInfo] (
    [DeliveryID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [DeliveryNo] int NULL,
    [DeliveryManId] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [IsTaxable] bit NULL,
    [DeliveryDate] datetime NULL,
    [AccountVoucherId] int NULL,
    [BranchId] int NULL,
    [NetAmount] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[gen_SaleManInfo] (
    [SaleManInfoID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [StationID] int NULL,
    [SaleManName] nvarchar(50) NULL,
    [TargetAmount] int NULL,
    [SalesPersonGlId] int NULL,
    [DOB] datetime NULL,
    [DateOfJoin] datetime NULL,
    [FatherName] nvarchar(200) NULL,
    [CNIC] nvarchar(200) NULL,
    [RegionalManager] nvarchar(200) NULL,
    [RegionName] nvarchar(200) NULL,
    [ResignDate] datetime NULL,
    [isLeft] bit NULL,
    [PhoneNo] nvarchar(100) NULL,
    [SalesPersonEmail] nvarchar(100) NULL,
    [SaleManUrduName] nvarchar(200) NULL,
    [WHID] int NULL,
    [SectorID] int NULL
);
GO

CREATE TABLE [dbo].[gen_SaleRecoveryDetail] (
    [RecoveryDetailId] int NOT NULL,
    [RecoveryID] int NULL,
    [SaleId] int NULL,
    [PartyId] int NULL,
    [TotalSaleAmount] numeric(18,3) NULL,
    [TotalRecoverdAmount] numeric(18,3) NULL,
    [DeliveryDetailId] int NULL,
    [PreRecoverd] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[gen_SaleRecoveryInfo] (
    [RecoveryID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [RecoveryNo] int NULL,
    [DeliveryManId] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [IsTaxable] bit NULL,
    [RecoveryDate] datetime NULL,
    [AccountVoucherId] int NULL,
    [BranchId] int NULL,
    [NetAmount] numeric(18,3) NULL,
    [DeliveryID] int NULL
);
GO

CREATE TABLE [dbo].[gen_SchemeDetailInfo] (
    [SchemeDetailID] int NOT NULL,
    [SchemeID] int NULL,
    [DiscountOneType] tinyint NULL,
    [DiscountTwoType] tinyint NULL,
    [DiscountThreeType] tinyint NULL,
    [DiscountFourType] tinyint NULL,
    [DiscountOneTypeAmount] numeric(18,2) NULL,
    [DiscountTwoTypeAmount] numeric(18,2) NULL,
    [DiscountThreeTypeAmount] numeric(18,2) NULL,
    [DiscountFourTypeAmount] numeric(18,2) NULL,
    [ItemId] int NULL
);
GO

CREATE TABLE [dbo].[gen_SchemeInfo] (
    [SchemeID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [EffectiveDate] date NULL
);
GO

CREATE TABLE [dbo].[gen_SectorInfo] (
    [SectorID] int NOT NULL,
    [StationID] int NULL,
    [SectorName] varchar(100) NULL,
    [SectorAbbreviation] varchar(50) NULL,
    [CompanyID] int NULL,
    [SaleManInfoID] int NULL
);
GO

CREATE TABLE [dbo].[gen_ShedInfo] (
    [ShedId] int NOT NULL,
    [Title] nvarchar(50) NULL,
    [GLCAID] int NULL,
    [CompanyID] int NULL,
    [BranchID] int NULL
);
GO

CREATE TABLE [dbo].[gen_SMSApiInfo] (
    [ApiId] int NOT NULL,
    [ApiUserId] nvarchar(MAX) NULL,
    [Key] nvarchar(MAX) NULL,
    [ApiUrl] nvarchar(MAX) NULL,
    [ApiType] nvarchar(MAX) NULL,
    [Mask] nvarchar(MAX) NULL,
    [CompanyId] int NULL,
    [OwnerNumbers] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[gen_StakeHolder] (
    [StakeHoldersID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [StationID] int NULL,
    [FiscalId] int NULL,
    [UserId] int NULL,
    [StakeHoldersName] nvarchar(50) NULL,
    [TargetAmount] int NULL,
    [StakeHoldersGlId] nchar(10) NULL,
    [DOB] datetime NULL,
    [DateOfJoin] datetime NULL,
    [FatherName] nvarchar(200) NULL,
    [CNIC] nvarchar(200) NULL,
    [RegionalManager] nvarchar(200) NULL,
    [RegionName] nvarchar(200) NULL,
    [ResignDate] datetime NULL,
    [isLeft] bit NULL,
    [PhoneNo] nvarchar(200) NULL,
    [StakeHolderEmail] nvarchar(200) NULL,
    [StakeHolderUrduName] nvarchar(200) NULL
);
GO

CREATE TABLE [dbo].[gen_StationInfo] (
    [StationID] int NOT NULL,
    [ZoneID] int NULL,
    [StationName] varchar(100) NULL,
    [StationAbbreviation] varchar(50) NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[gen_StockInOutType] (
    [StockIOTypeID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [StockType] varchar(20) NULL,
    [StockInOutType] varchar(50) NULL,
    [StockTypeAccountID] int NOT NULL
);
GO

CREATE TABLE [dbo].[gen_StudentInfo] (
    [StudentID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchId] int NULL,
    [FirstName] nvarchar(50) NULL,
    [LastName] nvarchar(50) NULL,
    [CNIC] nvarchar(50) NULL,
    [PhoneNo] nvarchar(50) NULL,
    [ParentId] int NULL,
    [Address] nvarchar(MAX) NULL,
    [DateOfBirth] datetime NULL,
    [ClassId] int NULL,
    [Picture] nvarchar(50) NULL,
    [Attachments] nvarchar(50) NULL,
    [AdmissionFees] numeric(18,2) NULL,
    [AnnualFees] numeric(18,2) NULL,
    [MonthlyFees] numeric(18,2) NULL,
    [OtherCharges] numeric(18,2) NULL,
    [Discount] numeric(18,2) NULL,
    [NetFees] numeric(18,2) NULL,
    [Email] nvarchar(50) NULL,
    [StudentNo] nvarchar(50) NULL,
    [BarcodeImage] nvarchar(MAX) NULL,
    [Active] bit NULL,
    [ChartOfAccountID] int NULL
);
GO

CREATE TABLE [dbo].[gen_SubjectAssignDetail] (
    [SubAClassDetailID] int NOT NULL,
    [SubAClassID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [SubjectID] int NULL
);
GO

CREATE TABLE [dbo].[gen_SubjectAssignInfo] (
    [SubAClassID] int NOT NULL,
    [ClassID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchId] int NULL
);
GO

CREATE TABLE [dbo].[gen_SubjectInfo] (
    [SubjectID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchId] int NULL,
    [SubjectTitle] nchar(50) NULL
);
GO

CREATE TABLE [dbo].[gen_SubPartiesInfo] (
    [SubPartyID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [PartyID] int NULL,
    [SectorID] int NULL,
    [SubPartyName] nvarchar(300) NULL,
    [AddressOne] varchar(300) NULL,
    [AddressTwo] varchar(300) NULL,
    [CreditLimit] decimal(18,0) NULL,
    [PhoneOne] varchar(50) NULL,
    [PhoneTwo] varchar(50) NULL,
    [Fax] varchar(100) NULL,
    [Email] varchar(20) NULL,
    [CNIC] varchar(20) NULL,
    [SaleTaxRegNo] varchar(30) NULL,
    [NTNNO] varchar(30) NULL,
    [ContactPerson] varchar(100) NULL,
    [ContactPersonMobile] varchar(20) NULL,
    [ContactPersonEmail] varchar(20) NULL
);
GO

CREATE TABLE [dbo].[gen_SystemConfiguration] (
    [ConfigurationID] int NOT NULL,
    [CompanyID] int NULL,
    [AccountLevel] tinyint NULL,
    [TransporterGroupAccount] int NULL,
    [ApplyZoneRates] bit NOT NULL,
    [StockGroupAccount] int NULL,
    [BrokerageAccount] int NULL,
    [FreightAccount] int NULL,
    [PurchaseVoucherTypeID] int NULL,
    [PurchaseReturnVoucherTypeID] int NULL,
    [SaleVoucherTypeID] int NULL,
    [SaleReturnVoucherTypeID] int NULL,
    [RoundingAccount] int NULL,
    [StockAdjustmentAccount] int NULL,
    [CGSAccount] int NULL,
    [SaleAccount] int NULL,
    [SaleReturnAccount] int NULL,
    [LevelOneCount] int NOT NULL,
    [LevelTwoCount] int NOT NULL,
    [LevelThreeCount] int NOT NULL,
    [LevelFourCount] int NOT NULL,
    [LevelFiveCount] int NOT NULL,
    [LevelSixCount] int NOT NULL,
    [LevelSevenCount] int NOT NULL,
    [LevelEightCount] int NOT NULL,
    [LevelNineCount] int NOT NULL,
    [LevelTenCount] int NOT NULL,
    [ManufacturingVoucherTypeID] int NULL,
    [StockInVoucherTypeID] int NULL,
    [StockOutVoucherTypeID] int NULL,
    [GroupLevelTitle] varchar(100) NULL,
    [CategoryLevelTitle] varchar(100) NULL,
    [GroupLevelAllowed] bit NOT NULL,
    [CategoryLevelAllowed] bit NOT NULL,
    [PurchaseExpenseAccount] int NULL,
    [Signature_1] nvarchar(100) NULL,
    [Signature_2] nvarchar(100) NULL,
    [Signature_3] nvarchar(100) NULL,
    [BankGroupCode] int NULL,
    [VehicleReceivePartyID] int NULL,
    [VehicleReceiveAssetAc] int NULL,
    [SaleServiceAccountID] int NULL,
    [VehicleTransferVoucherTypeID] int NULL,
    [VehicleReceiveVoucherTypeID] int NULL,
    [Zone] nvarchar(50) NULL,
    [Station] nvarchar(50) NULL,
    [Sector] nvarchar(50) NULL,
    [AutoSaleVoucherTypeID] int NULL,
    [RecoveryVoucherTypeID] int NULL,
    [PaymentVoucherTypeID] int NULL,
    [AutoSaleCGSAccount] int NULL,
    [VehicleSaleAccount] int NULL,
    [CashAccount] int NULL,
    [AssetAccount] int NULL,
    [LiabilityAccount] int NULL,
    [CapitalAccount] int NULL,
    [RevenueAccount] int NULL,
    [ExpenseAccount] int NULL,
    [ShowSidebar] bit NOT NULL,
    [BrokerGroupAccountID] int NULL,
    [SalePrint] int NULL,
    [ShowSubPartySale] bit NOT NULL,
    [PurchaseStyle] varchar(50) NULL,
    [CGSEntry] bit NOT NULL,
    [AllowNegativeStock] bit NOT NULL,
    [GainLossAccount] int NULL,
    [AccountPrintStyle] varchar(30) NULL,
    [SaleStyle] varchar(50) NULL,
    [FreightAc] int NULL,
    [OtherDiscountAccount] int NULL,
    [TradeDiscountAccount] int NULL,
    [FreightDiscountAccount] int NULL,
    [LoadingUnloadingAccount] int NULL,
    [OtherServicesAccount] int NULL,
    [ChequeAccount] int NULL,
    [AfterRecoveryVoucherTypeID] int NULL,
    [PSTWithHeldAccount] int NULL,
    [ChartOfAccountView] tinyint NOT NULL,
    [AccountCategoryAccount] int NULL,
    [AccountCategoryAd] int NULL,
    [StockConfig] tinyint NOT NULL,
    [ManufacturingStyle] varchar(50) NULL,
    [PayrollPrintStyle] varchar(50) NULL,
    [AssemblyExpenseAccount] int NULL,
    [ManufacturingOverheadTypeID] int NULL,
    [IsTaxableMode] bit NOT NULL,
    [IsVoucherNoMonthly] bit NOT NULL,
    [PurchasePrint] int NULL,
    [IncomeAccount] int NULL,
    [ClosingVoucherType] int NULL,
    [QuotationPrintStyle] int NULL,
    [DescriptionStyle] nvarchar(50) NULL,
    [HideGlCode] bit NOT NULL,
    [TrackerVehicle] int NULL,
    [TrackerVehicleIn] int NULL,
    [AssetGroupsCode] nvarchar(50) NULL,
    [LibalityGroupsCode] nvarchar(50) NULL,
    [CapitalGroupsCode] nvarchar(50) NULL,
    [RevenueGroupsCode] nvarchar(50) NULL,
    [ExpenceGroupsCode] nvarchar(50) NULL,
    [StockTransferVoucherType] int NULL,
    [TaxMode] nvarchar(50) NOT NULL,
    [DisassembleVoucherTypeID] int NULL,
    [FreightExpenseAccount] int NULL,
    [FreightIncomeAccount] int NULL,
    [SaleOrderStyle] nvarchar(50) NULL,
    [ManufacturingStyleTwo] varchar(50) NULL,
    [CashReceiveVoucherType] int NULL,
    [CashPaymentVoucherType] int NULL,
    [BankReceiveVoucherType] int NULL,
    [BankPaymentVoucherType] int NULL,
    [ApplyLooseRate] bit NOT NULL,
    [InwardGatePassStyle] nvarchar(50) NULL,
    [DepricaitionDeductionAccount] int NULL,
    [SalvageAccount] int NULL,
    [IncomeTaxLabourAccount] int NULL,
    [IncomeTaxPartsAccount] int NULL,
    [blimit] int NOT NULL,
    [SchemeAccount] int NULL,
    [SchemeCommission] int NULL,
    [SchemeIncentive] int NULL,
    [Scheme3Piece] int NULL,
    [PurFreightAccount] int NULL,
    [TechnicianExp] int NULL,
    [WHItax] int NULL,
    [SaleServiceGroup] int NULL,
    [vehicleDiscount] int NULL,
    [SalesManExp] int NULL,
    [BikeDiscount] int NULL,
    [UnPaidLeaveTypeId] int NULL,
    [VPostingStyle] nvarchar(100) NULL,
    [FinishGoodsGroup] int NULL,
    [SuppressCorbisTag] bit NULL,
    [ApiConnection] bit NULL,
    [BikeGroupId] int NULL,
    [HidePurchaseStyle5] bit NULL,
    [SimItemGroup] int NULL,
    [TrackerItemGroup] int NULL,
    [BOMIDForTracker] int NULL,
    [Email] nvarchar(50) NULL,
    [Password] nvarchar(50) NULL,
    [PortNumber] nvarchar(50) NULL,
    [Server] nvarchar(50) NULL,
    [MaskTitle] nvarchar(50) NULL,
    [Subject] nvarchar(1000) NULL,
    [Body] nvarchar(MAX) NULL,
    [EnableSsl] bit NULL,
    [SMSEnable] bit NULL,
    [EmailEnable] bit NULL,
    [TWoVehicleSale] int NULL,
    [TWoVehiclePayable] int NULL,
    [LubricantsGroup] int NULL,
    [ItemPartsGroup] int NULL,
    [TechnicianGroupAccount] int NULL,
    [AdvisorGroupAccount] int NULL,
    [SaleReturnStyle] nvarchar(50) NULL,
    [AccessoriesGroup] int NULL,
    [InsuranceCompaniesGroup] int NULL,
    [IsLogActive] bit NULL,
    [SaleType] int NULL,
    [ExchangeGroupsCode] nvarchar(50) NULL,
    [SalesReportHeader] nvarchar(50) NULL,
    [SaleInvoicePosting] bit NULL,
    [CurrentAsset] int NULL,
    [CurrentLiability] int NULL,
    [MisplExhcahnge] bit NULL,
    [PurchaseOrderStyle] nvarchar(50) NULL,
    [AddNewCompany] bit NULL,
    [DeleteMenuQuery] nvarchar(MAX) NULL,
    [BankAccount] int NULL,
    [LanguageSelection] int NULL,
    [PrBookAuto] bit NULL,
    [GeneralPrVoucherType] int NULL,
    [sysFieldGlAdmin] int NULL,
    [SaleManLiability] int NULL,
    [JournalVoucherType] int NULL,
    [SalesPersonLedger] bit NULL,
    [SalesPersonGlGroup] int NULL,
    [SalePackingExpense] int NULL,
    [BardanaItem] int NULL,
    [BardanaWareHouse] int NULL,
    [SysFieldDeductionExpense] int NULL,
    [SysFieldStockOutType] int NULL,
    [isAddresswithGL] bit NULL,
    [isPestiSideSoftware] bit NULL,
    [isNarrationLedger] bit NULL,
    [SysFieldStockInType] int NULL,
    [CashFlowOperations] nvarchar(100) NULL,
    [CashFlowInvesting] nvarchar(100) NULL,
    [CashFlowFinancing] nvarchar(100) NULL,
    [PurchaseReturnStyle] varchar(50) NULL,
    [JointVendors] bit NULL,
    [VendorsName] nvarchar(MAX) NULL,
    [POSDealsCategory] int NULL,
    [ClientCompanyId] int NULL,
    [isPartyLogin] bit NULL,
    [SysBuiltyAdjustmentGL] int NULL,
    [QuotationFormStyle] int NULL,
    [VoucherApprovalID] nvarchar(100) NULL,
    [isApprovalActivate] bit NULL,
    [isDashBoardActivate] bit NULL,
    [SaleOrderPrintStyle] nvarchar(50) NULL,
    [NavStyle] int NULL,
    [sale_DistributionInfoStyle] int NULL,
    [CcMail] nvarchar(50) NULL,
    [OutwardFormStyle] int NULL,
    [OutwardPrintStyle] int NULL,
    [InwardGatePassPrintStyle] int NULL,
    [Signature_4] nvarchar(100) NULL,
    [VehicleSalePlusAccount] int NULL,
    [DistributiveRevenue] int NULL,
    [DistirbutorGroupCode] int NULL,
    [BardanaCategoryID] int NULL,
    [DriverGroupCode] int NULL,
    [ShedGroupAccount] int NULL,
    [ActivateShedTransfer] bit NULL,
    [StockFlokConsumption] int NULL,
    [AgentGroupCode] int NULL,
    [TokenGLCode] int NULL,
    [AgentCommison] int NULL,
    [AdvanceOnPlots] int NULL,
    [StockMainAtInward] bit NULL,
    [PurchDiscountRevenue] int NULL,
    [PlotsRecoveryVouhcer] int NULL,
    [WholdingGL] int NULL,
    [GSTHoldingGL] int NULL,
    [StudentGroupAccount] int NULL,
    [PayableWHGL] int NULL,
    [PayableGSTGL] int NULL,
    [EggsIncubatorSoft] int NULL,
    [IsStakeHolderActive] bit NULL,
    [RawItemID] int NULL,
    [FinishItemID] int NULL,
    [isMisplSoftware] bit NULL,
    [MaleChicksID] int NULL,
    [SchemeStyle] nvarchar(100) NULL,
    [isVouchersDaily] bit NULL,
    [DefaultVoucherJV] int NULL,
    [MakingCostExpence] int NULL,
    [RevenueFromMakingCost] int NULL,
    [IsCityActive] bit NULL,
    [isStoreWiseRights] bit NULL,
    [isShedLedgerActive] bit NULL,
    [isLayerSoft] bit NULL,
    [StockIssueStyle] nvarchar(100) NULL,
    [PackingCostHead] int NULL,
    [POSCashVoucher] int NULL,
    [FertilizersCat] nvarchar(250) NULL,
    [FungicideCat] nvarchar(250) NULL,
    [HerbicideCat] nvarchar(250) NULL,
    [SeedCat] nvarchar(250) NULL,
    [isKhaakiSoft] bit NULL,
    [IsReload] bit NULL,
    [DefaultWHID] int NULL,
    [FinishUomId] int NULL,
    [isbhawalpurunique] bit NULL,
    [JobRevenueAccount] int NULL,
    [LastUpdatedVersion] nvarchar(250) NULL,
    [khradiaExpence] int NULL,
    [LayerActivityStyle] nvarchar(MAX) NULL,
    [HatchFlockStyle] nvarchar(MAX) NULL,
    [FlockDefineStyle] nvarchar(MAX) NULL,
    [IsPoultrySoft] bit NULL,
    [TrimLossGlAccount] int NULL,
    [LockBackDateVouchers] bit NULL,
    [LockAfterDays] int NULL,
    [expiredate] datetime NULL,
    [PayrollStyle] nvarchar(MAX) NULL,
    [JamboEggsID] int NULL,
    [MarketEggsID] int NULL,
    [ExportedEggsID] int NULL,
    [DEggsID] int NULL,
    [AccountHitPayroll] bit NULL,
    [BreederActivityVouhcerType] int NULL,
    [taxaccount] int NULL,
    [hitseperatesalaries] bit NULL,
    [FeedCategoryID] int NULL,
    [EggsCategoryID] int NULL,
    [IsPosCounter] bit NULL,
    [FemaleFeedCategoryID] int NULL,
    [MaleFeedCategoryID] int NULL,
    [MarekEggsCategoryID] int NULL,
    [IsUnitedVehari] bit NULL,
    [SubletJobPartyGroup] int NULL,
    [SubletJobExpenseAccount] int NULL,
    [SubletJobSaleAccount] int NULL,
    [CounterSalesVoucherTypeID] int NULL,
    [CounterSalesReturnVoucherTypeID] int NULL,
    [AfterRecoveryVoucherTypeIDDMIS] int NULL,
    [PSTWithHeldAccountDMIS] int NULL,
    [SalvageAccountDMIS] int NULL,
    [IncomeTaxLabourAccountDMIS] int NULL,
    [IncomeTaxPartsAccountDMIS] int NULL,
    [CashAccountDMIS] int NULL,
    [ChequeAccountDMIS] int NULL,
    [AccountCategoryDMIS] int NULL,
    [PriceDifferenceAccountDMIS] int NULL,
    [RegisterBarCodeStyle] nvarchar(50) NULL,
    [AdvancePaymentVoucherTypeIDDMIS] int NULL,
    [JobCardType] nvarchar(MAX) NULL,
    [PFFIReceivableID] int NULL,
    [EWReceivableID] int NULL,
    [FSPReceivableID] int NULL,
    [WReceivableID] int NULL,
    [SFIReceivableID] int NULL,
    [FSLReceivableID] int NULL,
    [LaborBillingVoucherType] int NULL,
    [PromotionalTaxID] int NULL,
    [SFIEWReceivableID] int NULL,
    [FSLID] int NULL,
    [SFIID] int NULL,
    [EWID] int NULL,
    [FSPID] int NULL,
    [WID] int NULL,
    [SFIEWID] int NULL,
    [ItemCategoryForSales] bit NULL,
    [IsMobileView] bit NOT NULL,
    [AdvancePaymentAccountDMIS] int NULL,
    [Signature_5] nvarchar(50) NULL,
    [IsSessionCurrentDate] bit NOT NULL,
    [PackWiseReports] bit NULL,
    [PFFIJobRevenueAccount] int NULL,
    [JobCardBillingRecoveryVoucherType] int NULL,
    [IsAutoWorkShopSoftware] bit NOT NULL,
    [AllowSessionClosing] bit NULL,
    [FSCampaign] int NULL,
    [IsFBR] bit NOT NULL,
    [POSID] int NULL,
    [AGChicks] int NULL,
    [BGChicks] int NULL,
    [USChicks] int NULL,
    [SmallChicks] int NULL,
    [StartChicks] int NULL,
    [ExtraTwoPercentChicks] int NULL,
    [CChicks] int NULL,
    [IsLog] bit NOT NULL,
    [SysLoginBackground] nvarchar(MAX) NULL,
    [CssStyleColor] nvarchar(MAX) NULL,
    [IsMMCProduction] bit NOT NULL,
    [VehicleStockConfig] bit NOT NULL,
    [isSuzukiBWP] bit NOT NULL,
    [VehicleReceiveBookingTypeID] int NULL,
    [IsManufacurerFBR] bit NULL,
    [AllowItemDuplication] bit NOT NULL
);
GO

CREATE TABLE [dbo].[gen_TaxDetailInfo] (
    [TaxDetailID] int NOT NULL,
    [TaxID] int NULL,
    [FromDate] date NULL,
    [ToDate] date NULL,
    [TaxPercentage] numeric(6,3) NULL,
    [TaxAmount] numeric(10,3) NULL
);
GO

CREATE TABLE [dbo].[gen_TaxGroupDetail] (
    [TaxGroupDetailID] int NOT NULL,
    [TaxGroupID] int NULL,
    [TaxID] int NULL
);
GO

CREATE TABLE [dbo].[gen_TaxGroupInfo] (
    [TaxGroupID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [TaxGroupName] varchar(100) NULL
);
GO

CREATE TABLE [dbo].[gen_TaxInfo] (
    [TaxID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [TaxName] varchar(100) NULL,
    [GLCAID] int NULL,
    [TaxType] int NOT NULL,
    [TaxOn] int NULL
);
GO

CREATE TABLE [dbo].[gen_TemporaryPromoGroup] (
    [PGID] int NOT NULL,
    [PGName] varchar(100) NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[gen_TemporaryPromoGroupDetail] (
    [PGDetailID] int NOT NULL,
    [PGID] int NULL,
    [ItemId] int NULL,
    [ItemCode] int NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[gen_TestInfo] (
    [TestID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [BranchId] int NULL,
    [TestName] nchar(50) NULL,
    [TestCode] nchar(100) NULL,
    [Description] nchar(100) NULL
);
GO

CREATE TABLE [dbo].[gen_TransporterInformation] (
    [TransporterID] int NOT NULL,
    [CompanyID] int NULL,
    [GLCAID] int NULL,
    [TransporterName] varchar(100) NULL,
    [Address] varchar(200) NULL,
    [PhoneNo] varchar(20) NULL
);
GO

CREATE TABLE [dbo].[gen_ZoneInfo] (
    [ZoneID] int NOT NULL,
    [ZoneName] varchar(100) NULL,
    [ZoneAbbreivation] varchar(50) NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[GLAccontType] (
    [AccountTypeID] int NOT NULL,
    [Title] varchar(100) NULL
);
GO

CREATE TABLE [dbo].[GLBalanceSheetHead] (
    [GLBSid] int NOT NULL,
    [code] int NULL,
    [Description] varchar(100) NULL,
    [companyid] int NULL
);
GO

CREATE TABLE [dbo].[GLChartOFAccount] (
    [GLCAID] int NOT NULL,
    [GLCode] nvarchar(20) NULL,
    [GLTitle] nvarchar(500) NULL,
    [GLType] int NULL,
    [isParent] int NULL,
    [GLNature] tinyint NULL,
    [Fiscalid] int NULL,
    [GLBSid] int NULL,
    [GLPLid] int NULL,
    [Companyid] int NULL,
    [Status] bit NOT NULL,
    [EntryBy] varchar(50) NULL,
    [UserID] int NULL,
    [AccountLevelOne] varchar(10) NOT NULL,
    [AccountLevelTwo] varchar(10) NULL,
    [AccountlevelThree] varchar(10) NULL,
    [AccountLevelFour] varchar(10) NULL,
    [AccountLevelFive] varchar(10) NULL,
    [AccountLevelSix] varchar(10) NULL,
    [AccountLevelSeven] varchar(10) NULL,
    [AccountLevelEight] varchar(10) NULL,
    [AccountLevelNine] varchar(10) NULL,
    [AccountLevelTen] varchar(10) NULL,
    [GLLevel] tinyint NULL,
    [ReadOnly] bit NOT NULL
);
GO

CREATE TABLE [dbo].[GLChartOfAccountBranchDetail] (
    [GLCABranchDetailID] int NOT NULL,
    [GLCAID] int NULL,
    [BranchID] int NULL
);
GO

CREATE TABLE [dbo].[GLCompany] (
    [Companyid] int NOT NULL,
    [Title] varchar(100) NOT NULL,
    [ShortTitle] varchar(10) NOT NULL,
    [Email] nvarchar(50) NULL,
    [Address] nvarchar(500) NULL,
    [Phone] nvarchar(50) NULL,
    [website] nvarchar(100) NULL,
    [NTNNo] nvarchar(50) NULL,
    [Terms_Condition_1] nvarchar(4000) NULL,
    [Terms_Condition_2] nvarchar(4000) NULL,
    [St_Registration] nvarchar(50) NULL,
    [CompanyImage] nvarchar(100) NULL,
    [Inactive] bit NOT NULL,
    [SaleEmail] nvarchar(50) NULL,
    [Terms_Condition_3] nvarchar(MAX) NULL,
    [LoginBackground] nvarchar(MAX) NULL,
    [CssStyleColor] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[GLConfigLevels] (
    [id] int NOT NULL,
    [CompanyID] int NULL,
    [L1] varchar(10) NULL,
    [L2] varchar(10) NULL,
    [L3] varchar(10) NULL,
    [L4] varchar(10) NULL,
    [L5] varchar(10) NULL,
    [L6] varchar(10) NULL,
    [L7] varchar(10) NULL,
    [L8] varchar(10) NULL,
    [L9] varchar(10) NULL,
    [L10] varchar(10) NULL
);
GO

CREATE TABLE [dbo].[GLFiscalYear] (
    [Fiscalid] int NOT NULL,
    [StartYear] date NOT NULL,
    [EndYear] date NOT NULL,
    [Companyid] int NULL,
    [UserID] int NULL,
    [TimeStamp] datetime NULL,
    [EntryBy] nvarchar(50) NULL,
    [Status] bit NULL,
    [AccountVoucherID] int NULL
);
GO

CREATE TABLE [dbo].[GLPeriods] (
    [PeriodID] int NOT NULL,
    [Month] nvarchar(20) NULL,
    [fromdate] date NULL,
    [todate] date NULL,
    [compid] int NOT NULL,
    [isopenclose] bit NOT NULL,
    [Fiscalid] int NOT NULL
);
GO

CREATE TABLE [dbo].[GLProfitLoss] (
    [GLPLid] int NOT NULL,
    [code] int NULL,
    [Description] varchar(100) NULL,
    [companyid] int NULL
);
GO

CREATE TABLE [dbo].[GLUser] (
    [Userid] int NOT NULL,
    [UserName] varchar(100) NULL,
    [UserPassword] nvarchar(MAX) NULL,
    [GroupID] int NULL,
    [Type] bit NOT NULL,
    [Entryby] nvarchar(50) NULL,
    [TimeStamp] datetime NULL,
    [Active] bit NOT NULL,
    [CompanyID] int NULL,
    [AccountTitle] nvarchar(50) NULL,
    [Taxmode] nvarchar(50) NULL,
    [AllowDbBackup] bit NULL,
    [RequisitionApprove] bit NULL,
    [LeaveApprove] bit NULL,
    [VouchersRestriction] nvarchar(250) NULL,
    [FirstName] nvarchar(250) NULL,
    [LastName] nvarchar(250) NULL,
    [RegisterDate] datetime NULL,
    [ModifyDate] datetime NULL,
    [PhoneNumber] nvarchar(150) NULL,
    [EmailAddress] nvarchar(250) NULL,
    [ProfileImage] nvarchar(250) NULL,
    [ShowDashBoard] bit NULL,
    [CashAccount] int NULL,
    [ShopUserType] int NULL,
    [Fiscalid] int NULL,
    [SaleManInfoID] int NULL
);
GO

CREATE TABLE [dbo].[GLUserBranchDetail] (
    [UserBranchDetailID] int NOT NULL,
    [Userid] int NULL,
    [BranchID] int NULL
);
GO

CREATE TABLE [dbo].[GluserDetailWhid] (
    [Seriel] int NOT NULL,
    [Userid] int NULL,
    [WHID] int NULL
);
GO

CREATE TABLE [dbo].[GLUserGroup] (
    [GroupID] int NOT NULL,
    [GroupTitle] varchar(100) NULL,
    [Description] nvarchar(500) NULL,
    [Inactive] bit NULL,
    [Entryby] nvarchar(50) NOT NULL,
    [TimeStamp] datetime NULL,
    [UserID] int NULL,
    [Companyid] int NULL,
    [ParentCompanyId] int NULL,
    [ParentUserId] int NULL
);
GO

CREATE TABLE [dbo].[GLUserGroupDetail] (
    [UserGroupDetailID] int NOT NULL,
    [UserGroupID] int NULL,
    [FormsID] int NULL,
    [Assign] bit NULL,
    [IsEdit] bit NULL,
    [IsDelete] bit NULL,
    [IsPrint] bit NULL,
    [IsNew] bit NULL
);
GO

CREATE TABLE [dbo].[GLvDetail] (
    [vDetailID] int NOT NULL,
    [vID] int NOT NULL,
    [GlAccountID] int NOT NULL,
    [DTypeID] int NULL,
    [DvaluesID] int NULL,
    [ChequeNo] nvarchar(20) NULL,
    [ChequeDate] nvarchar(50) NULL,
    [DetailLog] int NULL,
    [Narration] nvarchar(MAX) NULL,
    [SchemeId] int NULL,
    [WHRate] numeric(18,3) NULL,
    [WHAmount] numeric(18,3) NULL,
    [GSTHRate] numeric(18,3) NULL,
    [GSTHAmount] numeric(18,3) NULL,
    [NetAmount] numeric(18,3) NULL,
    [WHID] int NULL,
    [LayerFlockID] int NULL,
    [dr] numeric(25,10) NOT NULL,
    [cr] numeric(25,10) NOT NULL
);
GO

CREATE TABLE [dbo].[GLvDetail_Log] (
    [vDetailLogID] int NOT NULL,
    [vLogID] int NOT NULL,
    [GlAccountID] int NOT NULL,
    [DTypeID] int NULL,
    [DvaluesID] int NULL,
    [ChequeNo] nvarchar(20) NULL,
    [ChequeDate] nvarchar(50) NULL,
    [DetailLog] int NULL,
    [Narration] nvarchar(MAX) NULL,
    [LogSourceDetailID] int NOT NULL,
    [dr] numeric(25,10) NOT NULL,
    [cr] numeric(25,10) NOT NULL
);
GO

CREATE TABLE [dbo].[GLvMAIN] (
    [vID] int NOT NULL,
    [vType] int NOT NULL,
    [vNO] nvarchar(20) NULL,
    [vDate] date NULL,
    [vCheqNo] nvarchar(15) NULL,
    [vCheqDate] datetime NULL,
    [vcheqtype] varchar(25) NULL,
    [VSTaxRate] smallint NULL,
    [vExcRate] money NULL,
    [vremarks] nvarchar(300) NULL,
    [FiscalID] int NULL,
    [Comp_Id] int NOT NULL,
    [vUserID] int NULL,
    [vWorkStation] nvarchar(50) NULL,
    [vCancel] bit NOT NULL,
    [vPost] bit NOT NULL,
    [vPostedById] int NULL,
    [vPostedByDate] datetime NULL,
    [vPostedByWS] nvarchar(50) NULL,
    [vUserName] nvarchar(25) NULL,
    [vEnterDate] datetime NULL,
    [ReadOnly] bit NOT NULL,
    [AccountCategoryID] int NULL,
    [IsTaxable] bit NOT NULL,
    [BranchID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CashBankAccountID] int NULL,
    [ManualNo] nvarchar(50) NULL,
    [FirstApproval] bit NULL,
    [FirstApprovedBy] int NULL,
    [FirstApprovalDate] datetime NULL,
    [FirstUserName] nvarchar(50) NULL,
    [ProjectID] int NULL,
    [TotalDr] numeric(25,10) NULL,
    [TotalCr] numeric(25,10) NULL,
    [ChasisNo] nvarchar(50) NULL,
    [ReceiveID] int NOT NULL
);
GO

CREATE TABLE [dbo].[GLvMain_Log] (
    [vLogID] int NOT NULL,
    [vType] int NOT NULL,
    [vNO] nvarchar(20) NULL,
    [vDate] date NULL,
    [vCheqNo] nvarchar(15) NULL,
    [vCheqDate] datetime NULL,
    [vcheqtype] varchar(25) NULL,
    [VSTaxRate] smallint NULL,
    [vExcRate] money NULL,
    [vremarks] nvarchar(300) NULL,
    [FiscalID] int NULL,
    [Comp_Id] int NOT NULL,
    [vUserID] int NULL,
    [vWorkStation] nvarchar(50) NULL,
    [vCancel] bit NOT NULL,
    [vPost] bit NOT NULL,
    [vPostedById] int NULL,
    [vPostedByDate] datetime NULL,
    [vPostedByWS] nvarchar(50) NULL,
    [vUserName] nvarchar(25) NULL,
    [vEnterDate] datetime NULL,
    [ReadOnly] bit NOT NULL,
    [AccountCategoryID] int NULL,
    [IsTaxable] bit NOT NULL,
    [BranchID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CashBankAccountID] int NULL,
    [LogSourceID] int NULL,
    [ModifiedType] bit NOT NULL,
    [TimeStamp] datetime NULL,
    [VModifiedby] int NULL,
    [TotalDr] numeric(25,10) NULL,
    [TotalCr] numeric(25,10) NULL
);
GO

CREATE TABLE [dbo].[GLVoucherType] (
    [Voucherid] int NOT NULL,
    [Title] varchar(50) NULL,
    [Description] varchar(100) NULL,
    [Companyid] int NULL,
    [Status] bit NOT NULL,
    [EntryBy] varchar(50) NULL,
    [UserID] int NULL,
    [ShowBankAndChequeDate] bit NOT NULL,
    [SystemType] bit NOT NULL
);
GO

CREATE TABLE [dbo].[InventCategory] (
    [CategoryID] int NOT NULL,
    [CategoryName] nvarchar(300) NULL,
    [ItemGroupID] int NULL,
    [CompanyID] int NULL,
    [StockAccount] int NULL,
    [SaleAccount] int NULL,
    [CGSAccount] int NULL,
    [MainCategory] bit NULL,
    [Description] nvarchar(MAX) NULL,
    [ItemNature] tinyint NOT NULL,
    [PostCostEntries] bit NULL,
    [CHSCode] nchar(8) NULL,
    [CSROCode] nchar(8) NULL
);
GO

CREATE TABLE [dbo].[InventItemBrands] (
    [ItemBrandId] int NOT NULL,
    [BrandName] nvarchar(50) NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[InventItemGroup] (
    [ItemGroupID] int NOT NULL,
    [ItemGroupName] nvarchar(50) NULL,
    [CompanyID] int NULL,
    [ItemMainGroupID] int NULL
);
GO

CREATE TABLE [dbo].[InventItems] (
    [ItemId] int NOT NULL,
    [CategoryID] int NULL,
    [ItemNumber] bigint NULL,
    [ItenName] nvarchar(MAX) NULL,
    [UOMId] int NULL,
    [ItemBrandId] int NULL,
    [MaintainInventory] bit NULL,
    [ItemPacking] int NULL,
    [ItemSalesPrice] decimal(18,3) NULL,
    [ItemPurchasePrice] decimal(18,3) NULL,
    [ItemStatus] bit NULL,
    [ItemPurchaseGL] int NULL,
    [ItemPurReturnGL] int NULL,
    [ItemSalesGL] int NULL,
    [ItemSaleReturnGL] int NULL,
    [ItemImage] nvarchar(MAX) NULL,
    [CompanyID] int NULL,
    [TaxGroupID] int NULL,
    [WeightedRate] numeric(14,5) NOT NULL,
    [WHID] int NULL,
    [ItemType] varchar(10) NULL,
    [ManualNumber] nvarchar(100) NULL,
    [CartonSize] numeric(10,5) NOT NULL,
    [ProductWeightCode] int NULL,
    [MainItem] bit NULL,
    [Remarks] nvarchar(500) NULL,
    [ItemVarientId] int NULL,
    [ColorID] int NULL,
    [UrduName] nvarchar(1000) NULL,
    [BardanaID] int NULL,
    [Make] nvarchar(50) NULL,
    [ItemModel] nvarchar(50) NULL,
    [Range] nvarchar(50) NULL,
    [SerialNo] nvarchar(50) NULL,
    [Accessories] nvarchar(MAX) NULL,
    [Property] nvarchar(50) NULL,
    [FixAsset] bit NULL,
    [CompanyName] int NULL,
    [WholeSaleRate] numeric(18,3) NULL,
    [ReOrderLevel] int NULL,
    [ItemGroupID] int NULL,
    [ItemMainGroupID] int NULL,
    [SubCategoryID] int NULL,
    [AttributeId] int NULL,
    [SeasonType] int NULL,
    [RegisterInevntoryDate] datetime NULL,
    [isFinish] bit NULL,
    [IsQuotation] bit NOT NULL,
    [HSCode] nchar(8) NULL,
    [SROCode] nchar(8) NULL
);
GO

CREATE TABLE [dbo].[InventUOM] (
    [UOMId] int NOT NULL,
    [UOMName] nvarchar(50) NULL,
    [Scale] decimal(9,4) NULL,
    [CompanyID] int NULL,
    [FBR_UomCodes] nvarchar(250) NULL,
    [FBR_Descrption] nvarchar(250) NULL
);
GO

CREATE TABLE [dbo].[InventWareHouse] (
    [WHID] int NOT NULL,
    [WHDesc] nvarchar(50) NULL,
    [GLCAID] int NULL,
    [CompanyID] int NULL,
    [BranchID] int NULL,
    [PhoneNo] nvarchar(250) NULL,
    [LocationAddress] nvarchar(250) NULL,
    [CityId] int NULL,
    [Email] nvarchar(250) NULL,
    [AreaName] nvarchar(250) NULL,
    [WhCode] nvarchar(250) NULL,
    [SNo] int NULL,
    [CityNameManual] nvarchar(1000) NULL,
    [InActive] bit NOT NULL,
    [IsFarm] bit NOT NULL
);
GO

CREATE TABLE [dbo].[LData_DefineTest] (
    [LTestId] int NOT NULL,
    [LTestName] nvarchar(MAX) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [CompanyID] int NULL,
    [IsCommonTest] bit NULL,
    [TestType] int NULL,
    [PriorityPrint] int NULL
);
GO

CREATE TABLE [dbo].[Ldata_InspectionResult] (
    [LabResultID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [ResultDate] date NULL,
    [ResultNo] int NULL,
    [PartyID] int NULL,
    [Remarks] varchar(300) NULL,
    [LInwardGatePassID] int NULL,
    [WHID] int NULL,
    [TruckNumber] nvarchar(50) NULL,
    [BuiltyNumber] nvarchar(50) NULL,
    [DriverName] nvarchar(50) NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [AttachmentPath] nvarchar(MAX) NULL,
    [ResultStatus] int NULL,
    [IsFinishProduct] bit NULL,
    [ManufacturingID] int NULL,
    [ManufacturingBatch] nvarchar(500) NULL,
    [FItemID] int NULL
);
GO

CREATE TABLE [dbo].[Ldata_InspectionResultDetail] (
    [LabResultDetailID] int NOT NULL,
    [LabResultID] int NULL,
    [ItemId] int NULL,
    [LInwardGatePassDetailID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [LTestId] int NULL,
    [FirstResult] numeric(18,3) NULL,
    [SecondResult] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[Ldata_InwardGatePassDetail] (
    [LInwardGatePassDetailID] int NOT NULL,
    [LInwardGatePassID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [PurchaseOrderDetailID] int NULL,
    [PolythenBags] nvarchar(50) NULL,
    [JuteBags] nvarchar(50) NULL,
    [FirstWeight] numeric(18,3) NULL,
    [SecondWeight] numeric(18,3) NULL,
    [Deduction] numeric(18,3) NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [LocationId] int NULL,
    [ReceivedQty] numeric(18,3) NULL,
    [AcceptedQty] numeric(18,3) NULL,
    [PurchaseOrderId] int NULL
);
GO

CREATE TABLE [dbo].[Ldata_InwardGatePassInfo] (
    [LInwardGatePassID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [LIGPDate] date NULL,
    [LIGPNo] int NULL,
    [PartyID] int NULL,
    [Remarks] varchar(300) NULL,
    [PurchaseOrderID] int NULL,
    [WHID] int NULL,
    [TruckNumber] nvarchar(50) NULL,
    [BuiltyNumber] nvarchar(50) NULL,
    [DriverName] nvarchar(50) NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [GrnType] nvarchar(50) NULL,
    [LInwardGatePassStyle] nvarchar(50) NULL,
    [AttachmentPath] nvarchar(MAX) NULL,
    [IsAccepted] int NULL
);
GO

CREATE TABLE [dbo].[Mdata_SurveyInfo] (
    [SurveyID] int NOT NULL,
    [SurveyNo] int NULL,
    [CustomerName] nvarchar(MAX) NULL,
    [InstallationAddress] nvarchar(MAX) NULL,
    [BillingAddress] nvarchar(MAX) NULL,
    [ContactPerson] nvarchar(500) NULL,
    [ContactPersonPhone] nvarchar(250) NULL,
    [NTNNo] nvarchar(150) NULL,
    [CNICNo] nvarchar(150) NULL,
    [Latitude] nvarchar(250) NULL,
    [Logitude] nvarchar(250) NULL,
    [CompanyId] int NULL,
    [FiscalId] int NULL,
    [UserID] int NULL,
    [EnteryDate] datetime NULL,
    [ModifyDate] datetime NULL,
    [ModifyUserID] int NULL,
    [IsTaxable] bit NULL,
    [SurveyDate] datetime NULL,
    [ServeyCreatedBy] nvarchar(250) NULL,
    [NOCApprovalID] int NULL,
    [NocRemakrs] nvarchar(MAX) NULL,
    [DeploymentApproval] int NULL,
    [DeploymentRemarks] nvarchar(MAX) NULL,
    [ManagerRemarks] nvarchar(MAX) NULL,
    [ManagerApprovalID] int NULL,
    [ManagerApproved] bit NULL,
    [DeploymentApproved] bit NULL,
    [NOCApproved] bit NULL,
    [BranchID] int NULL
);
GO

CREATE TABLE [dbo].[Pdata_EggsSetting] (
    [EggSettingID] int NOT NULL,
    [SettingNo] int NULL,
    [SettingDate] date NULL,
    [HatcheryID] int NULL,
    [MachineID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [isHatched] bit NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [WHID] int NULL,
    [IsTaxable] bit NULL
);
GO

CREATE TABLE [dbo].[Pdata_EggsSettingDetail] (
    [EggSettingDetailID] int NOT NULL,
    [EggSettingID] int NULL,
    [LayerFlockID] int NULL,
    [BoxType] int NULL,
    [NoOfTray] int NULL,
    [SettingEggs] int NULL,
    [MarketSetting] int NULL,
    [CrackEggs] int NULL,
    [DestroyedEggs] int NULL,
    [TotalSettings] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [TotalReceivedEggs] int NULL,
    [EggsBoxes] numeric(14,2) NULL
);
GO

CREATE TABLE [dbo].[Pdata_FlockDef] (
    [SrNo] int NOT NULL,
    [Date] datetime NULL,
    [Id] int NULL,
    [EntryUserID] int NULL,
    [ModifyUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [FlockNo] nvarchar(50) NULL,
    [Location] nvarchar(100) NULL,
    [WareHouseNo] int NULL,
    [CategoryId] int NULL,
    [FlockName] nvarchar(100) NULL,
    [ChicksQuantity] numeric(18,0) NULL,
    [StartDate] datetime NULL,
    [EndDate] datetime NULL,
    [Remarks] nvarchar(MAX) NULL,
    [isCompleted] bit NULL,
    [EggsQuantity] numeric(18,0) NULL
);
GO

CREATE TABLE [dbo].[Pdata_FlockShedLayer] (
    [LayerFlockiD] int NOT NULL,
    [LayerFloackNo] int NULL,
    [ShedId] int NULL,
    [Description] nvarchar(MAX) NULL,
    [BirdsAge] int NULL,
    [StartDate] datetime NULL,
    [DefineDate] datetime NULL,
    [ENDDate] datetime NULL,
    [isEnded] bit NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [BranchID] int NULL,
    [FromWHID] int NULL,
    [toWHID] int NULL,
    [CHICKSID] int NULL,
    [Weight] numeric(18,3) NULL,
    [isTaxable] bit NULL,
    [BirdsQuantity] numeric(18,3) NULL,
    [FemaleChicks] int NULL,
    [MaleChicks] int NULL,
    [FWeight] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[Pdata_FlockShedLayerDetail] (
    [LayerFlockDetailID] int NOT NULL,
    [LayerFlockID] int NULL,
    [ShedId] int NULL,
    [FemaleChicks] int NULL,
    [MaleChicks] int NULL,
    [PenID] int NULL,
    [PenName] nvarchar(200) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [IsEnabled] bit NULL
);
GO

CREATE TABLE [dbo].[PData_Hatchery] (
    [HatchId] int NOT NULL,
    [ItemID] int NULL,
    [HatchDate] datetime NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [AccountVoucherID] int NULL,
    [HatchNo] int NULL,
    [IsTaxable] bit NULL,
    [BranchID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [WHID] int NULL,
    [EggsQuantity] int NULL,
    [FlockID] int NULL,
    [FinishQuantity] int NULL,
    [Wastedeggs] int NULL,
    [PDataHachMacineID] int NULL,
    [FinishWHID] int NULL,
    [FinishItemID] int NULL,
    [StockRate] numeric(18,3) NULL,
    [CostRate] numeric(18,3) NULL,
    [FemaleChicks] int NULL,
    [MaleChicks] int NULL,
    [AGChicks] int NULL,
    [BG] int NULL,
    [US] int NULL,
    [ST] int NULL,
    [CC] int NULL,
    [Extratwo] numeric(18,0) NULL,
    [TotalSaleable] int NULL,
    [EggSettingID] int NULL,
    [SettingNo] int NULL
);
GO

CREATE TABLE [dbo].[pdata_HatcheryDetail] (
    [HatcheryDetailID] int NOT NULL,
    [EggSettingDetailID] int NULL,
    [HatchId] int NULL,
    [EggSettingID] int NULL,
    [WastedEggs] int NULL,
    [TotalSettings] int NULL,
    [Production] int NULL,
    [LayerFlockID] int NULL,
    [AG] int NOT NULL,
    [US] int NOT NULL,
    [BG] int NOT NULL,
    [ExtraTwoPercent] int NOT NULL,
    [CC] int NOT NULL,
    [TotalSaleable] int NOT NULL,
    [AgeProduced] numeric(14,2) NOT NULL
);
GO

CREATE TABLE [dbo].[Pdata_HatcheryMachineInfo] (
    [PDataHachMacineID] int NOT NULL,
    [RegisrationDate] datetime NULL,
    [EntryUserID] int NULL,
    [ModifyUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [HatchCapacity] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [MachineName] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[pdata_inwardGatePassDetail] (
    [InGatePDetailID] int NOT NULL,
    [InGatePID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [VehcleNo] nvarchar(250) NULL
);
GO

CREATE TABLE [dbo].[pdata_inwardGatePassInfo] (
    [InGatePID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [InGatePDate] date NULL,
    [FormType] varchar(50) NULL,
    [Remarks] varchar(300) NULL,
    [InGatePNo] int NULL,
    [WHID] int NULL,
    [ShedID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NULL
);
GO

CREATE TABLE [dbo].[Pdata_LayerActivitiesDetail] (
    [ActivityDetailID] int NOT NULL,
    [ActivityID] int NULL,
    [ItemID] int NULL,
    [Quantity] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [Bags] numeric(18,3) NULL,
    [Kgs] numeric(18,3) NULL,
    [Shedid] int NULL,
    [ShedNo] nvarchar(150) NULL,
    [Penid] int NULL,
    [Pen] nvarchar(150) NULL,
    [BihF] int NULL,
    [BihM] int NULL,
    [MorF] int NULL,
    [MorM] int NULL,
    [CullF] int NULL,
    [CullM] int NULL,
    [FeedF] numeric(18,3) NULL,
    [FeedM] numeric(18,3) NULL,
    [TFeedF] numeric(18,3) NULL,
    [TFeedM] numeric(18,3) NULL,
    [Production] int NULL,
    [TMorM] bigint NULL,
    [TCullM] bigint NULL,
    [TMorF] bigint NULL,
    [TCull] bigint NULL,
    [LayerFlockDetailID] int NULL,
    [StockRate] numeric(18,3) NULL,
    [FeedFGrams] numeric(18,3) NULL,
    [FeedMGrams] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[Pdata_LayerActivitiesDetailEggstoHatchery] (
    [HatchDetailID] int NOT NULL,
    [ActivityID] int NULL,
    [HWHID] int NULL,
    [Quantity] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [StockRate] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[Pdata_LayerActivitiesDetailMedicineMedicine] (
    [MedicineDetailID] int NOT NULL,
    [ActivityID] int NULL,
    [ItemID] int NULL,
    [Quantity] numeric(18,3) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [Bags] numeric(18,3) NULL,
    [Kgs] numeric(18,3) NULL,
    [StockRate] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[Pdata_LayerActivitiesInfo] (
    [ActivityID] int NOT NULL,
    [ActivityNo] int NULL,
    [ActivityDate] date NULL,
    [LayerFlockiD] int NULL,
    [ShedId] int NULL,
    [WHID] int NULL,
    [CurrentAge] int NULL,
    [CurrentAvgWeight] numeric(18,3) NULL,
    [Mortality] int NULL,
    [Crate] numeric(18,0) NULL,
    [Trey] numeric(18,0) NULL,
    [Eggs] numeric(18,0) NULL,
    [FeedBags] numeric(18,0) NULL,
    [PerBirdFeed] numeric(18,3) NULL,
    [WaterLtr] numeric(18,0) NULL,
    [ProductionRate] numeric(18,3) NULL,
    [LightHours] numeric(18,3) NULL,
    [MedicationRemarks] nvarchar(MAX) NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [BranchID] int NULL,
    [TotalEggs] numeric(18,0) NULL,
    [isTaxable] bit NULL,
    [Temperature] decimal(18,3) NULL,
    [Culling] int NULL,
    [FMortality] int NULL,
    [MMortality] int NULL,
    [FCulling] int NULL,
    [MCulling] int NULL,
    [JEggs] int NULL,
    [CEggs] int NULL,
    [MEggs] int NULL,
    [DEggs] int NULL,
    [EggsMess] int NULL,
    [EggsWeightAvg] numeric(18,3) NULL,
    [ExportedEggs] int NULL,
    [AccountVoucherID] int NULL,
    [TotalSaleBirds] int NULL
);
GO

CREATE TABLE [dbo].[Pdata_LogActivityDetail] (
    [LogActivityDetailId] int NOT NULL,
    [LogActivityId] int NULL,
    [Date] datetime NULL,
    [Flock] nvarchar(100) NULL,
    [ActivityType] nvarchar(100) NULL,
    [Quantity] numeric(18,0) NULL,
    [Remarks] nvarchar(MAX) NULL,
    [Weight] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[Pdata_LogActivityInfo] (
    [LogActivityId] int NOT NULL,
    [EntryUserID] int NULL,
    [ModifyUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [FlockNo] int NULL,
    [ChicksQuantity] numeric(18,0) NULL,
    [ActivityDate] datetime NULL,
    [FlockId] int NULL
);
GO

CREATE TABLE [dbo].[pdata_outwardGatePassDetail] (
    [OutGatePDetailID] int NOT NULL,
    [OutGatePID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [VehcleNo] nvarchar(250) NULL,
    [Crate] int NULL,
    [Tray] int NULL,
    [TQty] int NULL
);
GO

CREATE TABLE [dbo].[pdata_outwardGatePassInfo] (
    [OutGatePID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [OutGatePDate] date NULL,
    [FormType] varchar(50) NULL,
    [Remarks] varchar(300) NULL,
    [OutGatePNo] int NULL,
    [WHID] int NULL,
    [ShedID] int NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NULL
);
GO

CREATE TABLE [dbo].[PData_PurchaseInfo] (
    [PDataPurID] int NOT NULL,
    [ItemID] int NULL,
    [SerielNo] nvarchar(500) NULL,
    [PartyID] int NULL,
    [BuiltyNumber] int NULL,
    [VehicleFreight] numeric(18,3) NULL,
    [ItemRate] numeric(18,3) NULL,
    [PhoneNumber] nvarchar(250) NULL,
    [PurchaseDate] datetime NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [AccountVoucherID] int NULL,
    [PurVoucherNo] int NULL,
    [IsTaxable] bit NULL,
    [BranchID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [WHID] int NULL,
    [Quantity] numeric(18,3) NULL,
    [FlockID] int NULL,
    [NetAmount] numeric(18,3) NULL,
    [PurchaseType] int NULL
);
GO

CREATE TABLE [dbo].[Pdata_SaleDetail] (
    [DetailId] int NOT NULL,
    [SaleId] int NULL,
    [PartyId] int NULL,
    [VehicleNumber] nvarchar(50) NULL,
    [FirstWeight] numeric(18,3) NULL,
    [SecondWeight] numeric(18,3) NULL,
    [NetWeight] numeric(18,3) NULL,
    [ItemRate] numeric(18,3) NULL,
    [DiscPercentage] numeric(18,3) NULL,
    [DiscAmount] numeric(18,3) NULL,
    [TaxOneId] int NULL,
    [TaxOneAmount] numeric(18,3) NULL,
    [TaxTwoId] int NULL,
    [TaxTwoAmount] numeric(18,3) NULL,
    [TotalTax] numeric(18,3) NULL,
    [Brokerage] numeric(18,3) NULL,
    [NetAmount] numeric(18,3) NULL,
    [CustomerName] nvarchar(MAX) NULL
);
GO

CREATE TABLE [dbo].[Pdata_SaleInfo] (
    [SaleID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [SaleDate] date NULL,
    [ItemID] int NULL,
    [DiscountType] tinyint NULL,
    [DiscountPercent] numeric(8,3) NULL,
    [DiscountAmount] numeric(10,2) NULL,
    [Remarks] varchar(300) NULL,
    [FreightAmount] numeric(18,2) NOT NULL,
    [NetAmount] numeric(18,2) NULL,
    [SaleVoucherNo] int NULL,
    [FlockId] int NULL,
    [WHID] int NULL,
    [AccountVoucherID] int NULL,
    [GroupLevelID] int NULL,
    [CategoryLevelID] int NULL,
    [PaymentTermID] int NULL,
    [DueDate] date NULL,
    [TransporterID] int NULL,
    [TransporterFreightAmount] numeric(18,2) NOT NULL,
    [SaleManInfoID] int NULL,
    [ItemRate] numeric(18,3) NULL,
    [BranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [FreightType] tinyint NOT NULL,
    [InvType] int NULL,
    [Qty] numeric(18,2) NULL,
    [ManualNo] nvarchar(50) NULL,
    [QtyDivisble] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[pdata_shedDataInflow] (
    [shedInflowID] int NOT NULL,
    [ItemId] int NULL,
    [SourceID] int NULL,
    [SourceName] varchar(50) NULL,
    [WHID] int NULL,
    [StockDate] date NULL,
    [StockRate] numeric(14,5) NULL,
    [Quantity] numeric(10,2) NOT NULL,
    [QtyInStock] numeric(10,2) NOT NULL,
    [FiscalID] int NULL,
    [CompanyID] int NULL,
    [IsDeleted] bit NOT NULL,
    [IsTaxable] bit NOT NULL,
    [LocationId] int NULL,
    [FlockId] int NULL,
    [IssueWeight] numeric(18,3) NULL,
    [ExpiryDate] date NULL,
    [BatchNo] nvarchar(50) NULL,
    [BranchID] int NULL,
    [ShedId] int NULL
);
GO

CREATE TABLE [dbo].[pdata_shedDataOutflow] (
    [ShedOutFlowID] int NOT NULL,
    [shedInflowID] int NULL,
    [ItemId] int NULL,
    [SourceID] int NULL,
    [SourceName] varchar(50) NULL,
    [WHID] int NULL,
    [StockDate] date NULL,
    [StockRate] numeric(14,5) NULL,
    [Quantity] numeric(10,2) NULL,
    [FiscalID] int NULL,
    [CompanyID] int NULL,
    [IsTaxable] bit NOT NULL,
    [LocationId] int NULL,
    [FlockId] int NULL,
    [IssueWeight] numeric(18,3) NULL,
    [ExpiryDate] date NULL,
    [BatchNo] nvarchar(50) NULL,
    [BranchID] int NULL,
    [ShedId] int NULL
);
GO

CREATE TABLE [dbo].[Pdata_StockFlockTransferDetail] (
    [StockTransferDetailID] int NOT NULL,
    [StockTransferID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [IssueWeight] numeric(18,3) NULL
);
GO

CREATE TABLE [dbo].[Pdata_StockFlockTransferInfo] (
    [StockTransferID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [TransferDate] date NULL,
    [TransferNo] int NULL,
    [TransferFromWHID] int NULL,
    [TransferToFlockID] int NULL,
    [FromBranchID] int NULL,
    [ToBranchID] int NULL,
    [IsTaxable] bit NOT NULL,
    [AccountVoucherID] int NULL,
    [TranscationType] int NULL,
    [Remarks] varchar(300) NULL,
    [OpeningWeight] numeric(18,3) NULL,
    [OpQuantity] numeric(18,3) NULL,
    [StockRate] numeric(18,3) NULL,
    [IsStockToShed] bit NULL,
    [TransferToShedId] int NULL
);
GO

CREATE TABLE [dbo].[pos_ServerVouchers] (
    [VoucherID] int NOT NULL,
    [WHID] int NULL,
    [AccountVoucherID] int NULL,
    [VoucherDate] datetime NULL,
    [VoucherSource] nvarchar(350) NULL
);
GO

CREATE TABLE [dbo].[POSdata_StockArrivalDetailServer] (
    [ArrivalIDDetailID] int NOT NULL,
    [ArrivalID] int NULL,
    [ItemId] int NULL,
    [Quantity] numeric(18,3) NULL,
    [StockRate] numeric(14,5) NOT NULL,
    [CartonQuantity] numeric(18,3) NULL,
    [LooseQuantity] numeric(18,3) NULL,
    [TransferDetailID] int NULL
);
GO

CREATE TABLE [dbo].[POSdata_StockArrivalInfoServer] (
    [ArrivalID] int NOT NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL,
    [FiscalID] int NULL,
    [ArrivalDate] date NULL,
    [ArrivalNo] int NULL,
    [ArrivalFromWHID] int NULL,
    [ArrivalToWHID] int NULL,
    [FromBranchID] int NULL,
    [ToBranchID] int NULL,
    [IsTaxable] bit NULL,
    [AccountVoucherID] int NULL,
    [Remarks] nvarchar(MAX) NULL,
    [RefID] int NULL,
    [isManual] bit NULL,
    [VehicleNo] nvarchar(250) NULL,
    [ManualNo] nvarchar(250) NULL
);
GO

CREATE TABLE [dbo].[SchemeDetailWhid] (
    [Seriel] int NOT NULL,
    [SchemeID] int NULL,
    [WHID] int NULL
);
GO

CREATE TABLE [dbo].[tbl_MachineUserDetail] (
    [MachineUserDetailId] int NOT NULL,
    [SerialNo] int NULL,
    [EnrollmentNo] nvarchar(50) NULL,
    [Name] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[tblMachineConfig] (
    [Seriel] int NOT NULL,
    [MachineId] int NOT NULL,
    [MachineName] nvarchar(150) NULL,
    [MachineIp] nvarchar(50) NULL,
    [MachinePort] nvarchar(50) NULL,
    [MachineNo] int NULL,
    [CompanyId] int NULL,
    [FiscalId] int NULL,
    [UserId] int NULL
);
GO

CREATE TABLE [dbo].[tblMachineUsers] (
    [SerialNO] int NOT NULL,
    [MachineId] int NULL,
    [EntryUserID] int NULL,
    [EntryUserDateTime] datetime NULL,
    [ModifyUserID] int NULL,
    [ModifyUserDateTime] datetime NULL,
    [CompanyID] int NULL
);
GO

CREATE TABLE [dbo].[tempInflowDataTable] (
    [GUID] uniqueidentifier NOT NULL,
    [ProductInflowID] int NOT NULL,
    [SourceName] varchar(50) NOT NULL
);
GO

CREATE TABLE [dbo].[tempOutflowDataTable] (
    [GUID] uniqueidentifier NOT NULL,
    [ProductOutflowID] int NOT NULL,
    [SourceName] varchar(50) NOT NULL
);
GO

CREATE TABLE [dbo].[TempStockdate] (
    [id] int NOT NULL,
    [SDate] date NULL
);
GO

CREATE TABLE [dbo].[UserForms] (
    [Formid] int NOT NULL,
    [FormTitle] nvarchar(50) NULL,
    [ParentId] int NULL,
    [Controller] nvarchar(50) NULL,
    [Action] nvarchar(50) NULL,
    [MainParentID] int NULL,
    [Sequence] int NULL
);
GO

CREATE TABLE [dbo].[weight_tblPartyInfo] (
    [party_code] int NULL,
    [party_name] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[weight_tblProductInfo] (
    [product_code] int NULL,
    [product_name] nvarchar(50) NULL
);
GO

CREATE TABLE [dbo].[weight_tblWeightInfo] (
    [WeightId] int NOT NULL,
    [vehicle_no] nvarchar(50) NULL,
    [Container_No] nvarchar(50) NULL,
    [Seal_No] nvarchar(50) NULL,
    [party_code] int NULL,
    [Broker_Code] int NULL,
    [first_weight] numeric(18,3) NULL,
    [first_date] datetime NULL,
    [first_time] datetime NULL,
    [second_weight] numeric(18,3) NULL,
    [second_date] datetime NULL,
    [second_time] datetime NULL,
    [net_weight] numeric(18,3) NULL,
    [cash_receipt] numeric(18,3) NULL,
    [bilty_no] int NULL,
    [AvgWeight] numeric(18,3) NULL,
    [BagsType] int NULL,
    [ContractNo] nvarchar(50) NULL,
    [BuiltyNo] nvarchar(50) NULL,
    [product_code] int NULL,
    [Quantity] int NULL,
    [sr_no] int NULL
);
GO

