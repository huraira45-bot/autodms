# Car Dealership Operations: Database Dictionary

This document maps out the specific tables and workflows used by a modern **Automotive Dealership** within the ERP. While the database schema supports other industries, the dealership leverages a very specific subset of these 400+ tables to handle everything from showroom sales to workshop servicing and spare parts inventory.

---

## 1. Showroom & Vehicle Procurement (Buying & Selling Cars)
*Handling the supply chain of vehicles arriving from the manufacturer and being sold to end-users.*

* **Procurement:** `data_PurchaseOrder` & `data_PurchaseInfo` 
  * The dealership uses this to order specific vehicle variants or spare parts batches from the manufacturer.
* **Vehicle Arrival & Tracking:** `addata_DispatchInformation` & `data_StockArrivalInfo`
  * Logs the exact `EngineNo`, `ChassisNo`, and `ColorID` of the vehicles arriving on the transport trucks.
* **Vehicle Definition / Inventory:** `InventItems` & `gen_ItemVariantInfo`
  * The master list of car models, editions, colors, and SKUs for spare parts.
* **Showroom Sales:** `addata_SaleInfo` & `addata_SaleDetail`
  * Represents generating the sale receipt for the vehicle or over-the-counter spare parts.

---

## 2. Customer Relationship & Vehicle Registry (CRM)
*Tracking who bought what, and who is bringing a car into the shop.*

* **The Customer Directory:** `gen_PartiesInfo`
  * The central ledger of all clients that interact with the dealership.
* **Vehicle Owner Registration:** `addata_CustomerInfo`
  * The most critical table for Service Advisors. It binds a `PartyID` to a specific `ChassisNo` and `RegistrationNo`, creating a customer profile for that specific car. It also logs `InsurancePolicyNo` for claims.

---

## 3. After-Sales: Workshop & Service Flow
*The heaviest usage of the system occurs in the mechanic bays and service advisor desks.*

* **The Job Card (Repair Ticket):** `Addata_JobCardInfo`
  * The heart of the workshop. When a vehicle drives in, a Job Card is opened here tracking `KiloMeter` (millage in), `ReceiptTime`, and `PromisedDate`.
* **Job Card Details (The Bill of Materials):**
  * `Addata_JobCardInfoPartsDetail`: Spare parts requested by the mechanic.
  * `Addata_JobCardInfolubricantDetail`: Oil and coolants flushed or added.
  * `Addata_JobCardInfoSubletJobDetail`: Jobs sent to outside vendors (like a specialized lathe workshop).
* **Inventory Depletion:** `addata_StockIssuetoJobCard` & `addata_StockReturnFromJobCardInfo`
  * When mechanics pull an oil filter from the warehouse, it enters here. If they don't use it, it’s returned. This ensures spare parts inventory is perfectly accurate.

---

## 4. Dealership Finance & Accounts Receivable
*Translating grease and engines into cash flow.*

* **Generating the Bill:** `addata_CustomerInvoiceInfo` & `addata_CustomerInvoiceDetailInfo`
  * Once the mechanic clicks "Complete" on the Job Card, the advisor generates this invoice. It splits the bill computationally into `PaidByCustomer` (Out of pocket) vs `PaidByInsurance` (If it’s an accident repair claim).
* **Payment Recovery:** `addata_CustomerInvoiceRecovery` & `addata_RecoveryDetail`
  * When the customer goes to the cashier desk and swipes their card or hands over cash, the invoice is marked as paid/closed here.
* **General Ledger (Final Post):** `GLvMAIN` & `GLvDetail`
  * Every single receipt of cash, sale of a car, or purchase of an oil filter posts debit/credit entries to the dealership's core trial balance.

---

## 5. Staffing & Performance (HR & Techs)
*Managing the dealership workforce.*

* **Employees & Mechanics:** `gen_EmployeeInfo`
  * Tracks every salesperson, service advisor, and mechanic.
* **Performance Logs:** `Addata_JobCardInfoLog` & `addata_SalesManTargetInfo`
  * Dealerships run on commissions. The system tracks how many jobs a technician finished and how many sales targets the showroom floor hit.
