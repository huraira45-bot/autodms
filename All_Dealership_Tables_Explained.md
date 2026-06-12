# Complete Dealership Database Dictionary

This document covers **all** the 150+ tables utilized specifically by the Car Dealership, completely filtering out unused modules (like Real Estate and Poultry). 

Every table below is defined solely by its role in operating a modern Automotive Sales, Service, and Spare Parts dealership.

---

## 1. Automotive Service & Workshop (`addata_` prefix)
These tables govern the physical cars, the customers who own them, the workshop bays, and the invoicing.

| Table Name | Dealership Business Purpose |
|------------|---------------------------|
| `addata_CustomerInfo` | Master registry of vehicles (Chassis/Engine No.) mapped to vehicle owners. |
| `addata_CustomerEquipmentInfo` | Specifications of the physical car/equipment owned by the customer. |
| `addata_CustomerAdvPayment` | Logs advances paid by customers before parts are ordered or repairs begin. |
| `Addata_JobCardInfo` | The primary Repair Ticket. Tracks receipt time, promised time, and odometer/kilometers. |
| `Addata_JobCardInfoDetail` | Master detail log for tasks and components attached to the main Job Card. |
| `Addata_JobCardInfoPartsDetail` | Logs spare parts consumed during the specific repair job. |
| `Addata_JobCardInfolubricantDetail` | Logs oils, coolants, and fluids used during the repair. |
| `Addata_JobCardInfosubjobDetail` | Logs internal mechanic labor tasks assigned to the repair. |
| `Addata_JobCardInfoSubletJobDetail` | Logs 3rd-party vendor work (e.g., sending an engine block out for machining). |
| `Addata_JobCardInfoLog` | Audit trail of edits made to Job Cards (e.g., changes to promised delivery time). |
| `addata_JobStatusInfo` | Status configuration (e.g., "In Queue", "Waiting on Parts", "Ready"). |
| `addata_CustomerInvoiceInfo` | The final Customer Bill generated from a completed Job Card. Splits cash vs. insurance. |
| `addata_CustomerInvoiceDetailInfo` | Line-by-line financial breakdown of the invoice (Tax, salvage, parts price). |
| `addata_CustomerInvoiceRecovery` | Cashier receipt logging the actual physical payment from the customer against the invoice. |
| `addata_CustomerInvoiceRecoveryDetail` | Links the payment to the exact invoice lines being settled. |
| `addata_RecoveryInfo` / `addata_RecoveryDetail` | Broad recovery logs for general dealership debt collection (outside of standard job cards). |
| `addata_SaleInfo` / `addata_SaleDetail` | Point of Sale records for over-the-counter spare parts sold without a mechanic/Job Card. |
| `addata_SaleReturnInfo` / `addata_SaleReturnDetail` | Logs refunds issued when a customer returns a spare part. |
| `addata_StockIssuancetoPosKitchen` | Requesting spare parts from the main warehouse to the workshop floor or retail counter. |
| `addata_StockIssuetoJobCard` | The actual deduction of physical inventory from the warehouse assigned to a mechanic's bay. |
| `addata_StockReturnFromJobCardInfo` | Re-stocking spare parts that a mechanic checked out but didn't end up needing for the repair. |
| `addata_DispatchInformation` | Logistics tracking for new cars being dispatched from the factory/transport to the dealership lot. |
| `addata_VehicleDeliveryInfo` | The gate-pass handing over the keys of the repaired/new car to the customer. |
| `addata_TrackerAssigmentinfo` / `Detail` | Used to manage and map GPS/Security trackers installed into dealership vehicles. |
| `addata_TrackerRedoInfo` / `Detail` | Logs tracker replacements or reinstallations due to defects. |

---

## 2. Inventory & Warehouse Logistics (`Invent_` & `data_Stock_`)
These tables control the flow of cars and spare parts strictly from a supply chain perspective.

| Table Name | Dealership Business Purpose |
|------------|---------------------------|
| `InventItems` | Master catalog of every car model, spare part, screw, and oil bottle the dealership sells. |
| `InventCategory` / `InventItemGroup` | Grouping parts (e.g., "Brake Pads", "Body Panels", "Sedans", "SUVs"). |
| `InventItemBrands` | E.g., OEM parts vs Aftermarket. |
| `InventWareHouse` | Defines the specific storage locations (e.g., Main Parts Room, Forecourt, Showroom). |
| `InventUOM` | Unit of Measurement (e.g., Liters of oil, Units of cars). |
| `data_StockArrivalInfo` / `Detail` | Logs semi-trucks dropping off spare parts or new cars from Toyota/Honda/OEM. |
| `data_StockTransferInfo` / `Detail` | Moving parts from the Main Dealership to a branch/satellite dealership. |
| `data_StockDispatchAgainstTransfer` | Validates that items transferred actually left the building. |
| `data_StockInOutInfo` | Final adjustment logs when inventory physically enters or leaves the shelves. |
| `data_generalGatePassInfo` | Security logging to prevent theft when parts/cars leave the main gate. |

---

## 3. Procurement & Purchase Orders (`data_Purchase_`)
The purchasing department uses this to replenish stock from the manufacturer.

| Table Name | Dealership Business Purpose |
|------------|---------------------------|
| `data_PurchaseRequisition` / `Detail` | A mechanic or manager internally requesting new parts to be ordered. |
| `data_PurchaseOrder` / `Detail` | The legal order sent to the OEM Manufacturer for parts/cars. |
| `data_PurchaseInfo` / `Detail` | Receiving the parts based on the Purchase Order. |
| `data_PurchaseReturnInfo` / `Detail` | Sending defective warranty parts back to the OEM manufacturer. |

---

## 4. Master Configurations & HR (`gen_`)
The central rules, employee records, and tax limits applied universally across the dealership.

| Table Name | Dealership Business Purpose |
|------------|---------------------------|
| `gen_CompanyInfo` / `gen_BranchInfo` | For dealership conglomerates operating across multiple cities. |
| `gen_PartiesInfo` | The Rolodex. Contains every customer, vendor, OEM supplier, and insurer. |
| `gen_EmployeeInfo` | Master record of every Salesperson, Service Advisor, Mechanic, and Cashier. |
| `gen_DesignationInfo` | HR job titles (e.g., Level 1 Tech, Floor Manager). |
| `gen_TaxInfo` / `gen_TaxGroupDetail` | Configures GST percentages for parts sales vs. labor tax. |
| `gen_ItemVariantInfo` | Different car variants strictly (e.g., Corolla Altis vs GLi). |
| `gen_ColorInfo` `gen_SectorInfo` | Colors of the cars arriving, geographic sectors of customers. |
| `gen_BankInformation` / `gen_CheckBookInfo` | Corporate bank accounts used to deposit customer payments. |
| `gen_SystemConfiguration` | Admin toggles (e.g., "Allow invoices to be printed twice?", "Enable SMS?"). |

---

## 5. Dealership Finance & Accounting (`GL_`)
All activity, from selling an oil filter to a brand new car, creates a voucher here.

| Table Name | Dealership Business Purpose |
|------------|---------------------------|
| `GLChartOFAccount` | The full accounting tree (Assets, Liabilities, Equity, Revenue, Expense). |
| `GLAccontType` / `GLBalanceSheetHead` | Grouping accounts for P&L and Balance Sheet reports. |
| `GLFiscalYear` / `GLPeriods` | Monthly/Yearly locks so accountants can securely close the dealership's books. |
| `GLVoucherType` | E.g., Bank Payment, Cash Receipt, Journal Entry. |
| `GLvMAIN` | The Master transaction header for every financial entry generated in the dealership. |
| `GLvDetail` | The Debits and Credits line items. (E.g., Debit Cash Account, Credit Sales Revenue Account). |
| `GLUser` / `GLUserGroup` | Security rules preventing a cashier from viewing the dealership's Profit/Loss. |
