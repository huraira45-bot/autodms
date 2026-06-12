# Comprehensive Business Data Dictionary (433 Tables)

The ERP database represents a **multi-industry conglomerate system** (often seen in customized instances of SAGE ERP or local heavy-duty ERPs in South Asia, indicated by the FBR tables). It is designed to run isolated business units all feeding into a master General Ledger and Inventory system.

Instead of navigating all 400+ tables alphabetically, they are strictly grouped by **Business Aspect/Prefix**. Here is the exhaustive explanation of every table's purpose in the business ecosystem.

---

## 1. Automotive Dealership & Workshop Modules (`addata_` prefix)
*Used by service advisors, mechanics, fleet managers, and customer support to handle the end-to-end lifecycle of vehicle repairs and warranty.*

* **Customer & Vehicle Master**: `addata_CustomerInfo`, `addata_CustomerEquipmentInfo` (Registers vehicle chassis/engine logic and insurance info).
* **Job Cards (The core of workshop)**: `Addata_JobCardInfo` (The actual repair ticket), `Addata_JobCardInfoDetail`, `Addata_JobCardInfoPartsDetail`, `Addata_JobCardInfolubricantDetail` (What parts/lubricants were swallowed by the job), `Addata_JobCardInfoSubletJobDetail` (When you send a part out to a 3rd party machinist).
* **Invoicing & Billing**: `addata_CustomerInvoiceInfo`, `addata_CustomerInvoiceDetailInfo` (The financial bill showing taxes and salvage), `addata_CustomerInvoiceSubletJobDetail`.
* **Revenue Recovery**: `addata_CustomerInvoiceRecovery`, `addata_CustomerInvoiceRecoveryDetail`, `addata_RecoveryInfo` (Cashiers use these to log cash/bank deposits redeeming the invoices).
* **Automotive Sales**: `addata_SaleInfo`, `addata_SaleDetail` (For over-the-counter spare parts sale), `addata_SaleReturnInfo` (When a customer refunds a spare part).
* **Tracking Subscriptions**: `addata_TrackerAssigmentinfo`, `addata_TrackerRedoInfo`, `addata_TrackerAssigmentDetail` (If the dealership leases vehicles or installs GPS trackers, this manages the hardware assignments).
* **Logistics & Delivery**: `addata_VehicleDeliveryInfo`, `addata_DispatchInformation` (Tracks the actual vehicle leaving the lot).
* **Internal Stock (Workshop Level)**: `addata_StockIssuancetoPosKitchen`, `addata_StockIssuetoJobCard`, `addata_StockReturnFromJobCardInfo` (Transfer of parts from the main warehouse specifically to a mechanic's bay/job card).

---

## 2. Poultry & Agriculture Operations (`Pdata_` prefix)
*Used by farm managers, veterinarians, and hatchery supervisors. This proves the company runs a massive biological/agricultural division.*

* **Breeding & Hatchery Phase**: `PData_Hatchery` (Location of incubation), `Pdata_EggsSetting` (Tracking eggs placed in incubators), `Pdata_HatcheryMachineInfo` (Temperature/cycle logging).
* **Flock & Shed Management**: `Pdata_FlockDef` (Defining a specific batch of birds), `Pdata_FlockShedLayer` (Assigning flocks to specific farm sheds), `pdata_shedDataInflow`, `pdata_shedDataOutflow` (Birds entering/dying/leaving the shed).
* **Veterinary & Care**: `Pdata_LayerActivitiesInfo`, `Pdata_LayerActivitiesDetailMedicineMedicine` (Logging vaccinations, feed consumption, and medicine drops).
* **Movement & Sales**: `Pdata_StockFlockTransferInfo` (Moving birds between farms), `PData_PurchaseInfo` (Buying chicks from vendors), `Pdata_SaleInfo`, `Pdata_SaleDetail` (Exporting meat/eggs to market).

---

## 3. Real Estate & Land Development (`data_Plots` tables)
*Used by property brokers, society management, and real estate agents.*

* **Land Registry**: `data_PlotsDefine`, `data_PlotsSize` (Master data plotting out the coordinates, size, and category of the land).
* **Project Phasing**: `data_ProjectsRegistration`, `data_ProjectsPhases`, `data_ProjectCosting` (Used by developers to calculate the ROI and construction phase of building societies or commercial buildings).
* **Customer Bookings**: `data_PlotsBooking`, `data_PlotsBookingDetailOwners` (Who currently owns the file/plot), `data_PlotsBookingDetailToken` (Initial down-payments to lock in the plot).
* **Installment Tracking**: `data_PlotsGenerateDetail`, `data_PlotsInstallments`, `data_PlotsInstallmentsRecovery` (Handles 3-year or 5-year payment plans for the land block, tracking defaults and paid months).

---

## 4. Supply Chain, Procurement & Operations (`data_` prefix)
*Used by supply chain directors, warehouse managers, and procurement officers.*

* **Forecasting & Requisitions**: `data_ProductionForecasting` (Predicting what to build), `data_PurchaseRequisition` (Staff formally requesting a purchase).
* **Procurement**: `data_PurchaseOrder` (The legal document sent to suppliers), `data_PurchaseInfo`, `data_PurchaseDetailTax` (The actual receiving of goods and matching against invoices).
* **Stock Movement**: `data_StockArrivalInfo`, `data_StockTransferInfo`, `data_StockDispatchAgainstTransfer`, `data_StockInOutInfo` (The vascular system of the business. Moving items from Vendor → Warehouse A → Retail Store).
* **Tools Management**: `data_ToolsIssuence`, `data_ToolsReturnForm` (Used for heavy machinery/tooling checked out by employees so they don't get stolen).

---

## 5. Master Data, HR, & Reference Logic (`gen_` prefix)
*Used by System Admins and HR. If data exists here, it automatically populates dropdowns across all other modules.*

* **Party Registry (CRM)**: `gen_PartiesInfo`, `gen_PartyGroup`, `gen_SubPartiesInfo`, `gen_StakeHolder` (The ultimate address book. Customers, vendors, employees, investors are all parties).
* **Human Resources (HR)**: `gen_EmployeeInfo`, `gen_EmployeeLeaveTypeInfo`, `gen_EmployeeLeaveDetail`, `gen_EmployeeIncrementDetail`, `gen_DesignationInfo` (Full suite of HR. Tracking salaries, promotions, and time off).
* **Education & Training**: `gen_StudentInfo`, `gen_ParentsInfo`, `gen_ClassInfo`, `gen_SubjectAssignInfo` (Implies the conglomerate either runs a training division or handles educational stipends/academies).
* **Taxation Logic**: `gen_TaxInfo`, `gen_SalaryTaxInfo`, `gen_TaxGroupDetail` (The master logic defining GST%, Withholding Tax, and Salary brackets).

---

## 6. General Ledger & Financials (`GL` prefix)
*Used strictly by the CFO, Accountants, and Auditors.*

* **Chart of Accounts (COA)**: `GLChartOFAccount`, `GLAccontType`, `GLBalanceSheetHead`, `GLProfitLoss` (Every business asset, liability, equity, and expense sits here. It allows the conglomerate to run a combined Trial Balance).
* **The Voucher System**: `GLvMAIN`, `GLvDetail` (These two tables process thousands of requests. Whenever a plot is sold, a car is serviced, or eggs are sold, an accounting "Voucher" is written here).
* **Financial Boundaries**: `GLFiscalYear`, `GLPeriods` (Locks out data modification so staff cannot write new entries into closed fiscal months like 2024 once audits wrap up).
* **User Constraints**: `GLUser`, `GLUserGroup`, `GLUserBranchDetail` (Ensures that an accountant in the Poultry farm cannot view the data in the Automotive dealership).

---

## 7. Compliance & External Systems
*Used for auditing and connecting to government gateways.*

* **Point of Sale (POS)**: `pos_ServerVouchers`, `POSdata_StockArrivalInfoServer`, `gen_PosConfiguration` (Decentralized cash registers hitting the system from retail stores).
* **Federal Board of Revenue (FBR)**: `Fbr_Configurations`, `FBR_InvoiceMaster`, `Fbr_DigitalInvoicing` (Ties directly to the Pakistan Tax Authority API. Every invoice generated automatically logs to the FBR server for live tax evaluation).
* **Quality Control**: `Ldata_InspectionResult`, `LData_DefineTest` (Quality assurance tests performed on incoming goods or outgoing products).

## Architecture Summary
By understanding these namespaces, navigating the 433 tables becomes trivial. A developer building a new application merely needs to ask **"Which division is this for?"**
* Does it trace cash? → Query `GL tables`.
* Does it involve building a house/plot? → Query `data_Plots`.
* Is a customer buying a car service? → Cross join `addata_` with `gen_PartiesInfo` and `InventItems`.
