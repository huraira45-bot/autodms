# Core Database Relationship Mapping (PK/FK Paths)

With over 1,200 foreign key relationships, mapping every single line would create a massive web. However, 90% of the daily business operations flow through **5 core relationship pathways**. 

Below is the definitive guide on how the Primary Keys (PK) and Foreign Keys (FK) link these tables together. You can use these exact paths when writing `SQL JOIN` statements.

---

## 1. The Global Master Data Pathway (The Hub)
*Almost every transaction table links back to these two tables to identify "Who is the person?" and "What is the physical item?"*

* **The People / Companies (`gen_PartiesInfo`)**
  * **(PK)** `PartyID`
  * **Links out to (FK):** `addata_CustomerInfo.PartyID`, `Addata_JobCardInfo.PartyID`, `data_PurchaseOrder.PartyID`, `addata_SaleInfo.PartyID`.
* **The Physical Goods (`InventItems`)**
  * **(PK)** `ItemId`
  * **Links out to (FK):** `Addata_JobCardInfoPartsDetail.PartsId`, `data_PurchaseOrderDetail.ItemId`, `addata_SaleDetail.ItemId`, `data_StockInOutDetail.ItemId`.

*(If you ever need a Customer Name or a Part Name, you must `JOIN` back to these tables using PartyID or ItemId).*

---

## 2. The Dealership "Job Card" Lifecycle
*How a broken car turns into a paid invoice.*

* **Step 1: Vehicle & Owner Registration**
  * Table: `addata_CustomerInfo` 
  * **(PK)** `ProfileID` (or `CustomerId`) | **(FK)** `PartyID` -> Links to `gen_PartiesInfo`.
* **Step 2: The Service Ticket**
  * Table: `Addata_JobCardInfo`
  * **(PK)** `JobCardId`
  * **(FK)** `PartyID` (Points to customer), `VehicleCode/ChasisNo` (Points to the car).
* **Step 3: Parts & Labor (The details)**
  * Tables: `Addata_JobCardInfoPartsDetail`, `Addata_JobCardInfosubjobDetail`
  * **(FK)** `JobCardId` -> Must exactly match `Addata_JobCardInfo.JobCardId`.
  * **(FK)** `PartsId` -> Links to `InventItems.ItemId`.
  * **(FK)** `TechnicianId` -> Links to `gen_EmployeeInfo.EmployeeID`.
* **Step 4: The Final Bill**
  * Table: `addata_CustomerInvoiceInfo`
  * **(PK)** `CustomerInvoiceId`
  * **(FK)** `JobCardId` -> This rigidly ties the invoice to the original Job Card.
* **Step 5: The Payment Receipt**
  * Table: `addata_CustomerInvoiceRecoveryDetail`
  * **(FK)** `CustomerInvoiceId` -> Maps the cash received directly to the invoice generated in Step 4.

---

## 3. The Inventory & Procurement Flow
*How parts enter the building and are consumed.*

* **Step 1: Arriving from Manufacturer**
  * Table: `data_StockArrivalInfo` (Header) **(PK)** `ArrivalID`
  * Table: `data_StockArrivalDetail` (Lines) **(FK)** `ArrivalID` -> Links to Header. **(FK)** `ItemId` -> Links to actual part.
* **Step 2: Storing in the Warehouse**
  * Table: `InventWareHouse` 
  * **(PK)** `WHID` -> Whenever stock arrives freely or is issued to a Job Card, it is deducted/added to a specific `WHID`.
* **Step 3: Consumed by a Mechanic**
  * Table: `addata_StockIssuetoJobCard`
  * **(FK)** `JobCardId` -> Links to the mechanic's repair job.
  * **(FK)** `WHID` -> Deducts from the specific inventory room.

---

## 4. The Financial "Funnel" (General Ledger)
*Every single flow above terminates here. When an Invoice is generated or Stock arrives, money must be tracked.*

* **The Ledger Header**
  * Table: `GLvMAIN`
  * **(PK)** `VoucherID`
  * **(FK)** `VoucherType` (E.g., "Cash Receipt", "Journal Entry").
* **The Ledger Lines (Debits and Credits)**
  * Table: `GLvDetail`
  * **(FK)** `VoucherID` -> Links all Debits and Credits logically together under one transaction.
  * **(FK)** `AccountID` -> Links out to `GLChartOFAccount` (e.g., Asset Account, Revenue Account).
* **Cross-Module Linkage**
  * Transaction headers (like `addata_CustomerInvoiceInfo` or `addata_CustomerInvoiceRecovery`) almost always contain an `AccountVoucherID` column. This is the **critical bridge (FK)** linking the Dealership system to the Accounting system (`GLvMAIN.VoucherID`).

---

## Technical Summary of Primary Links
If you are writing SQL logic, these are your golden rules:
1. `JobCardId` is the universal thread across all Automotive tables.
2. `PartyID` is the universal thread across all Customer/Vendor tables.
3. `ItemId` is the universal thread across all Parts/Stock tables.
4. `AccountVoucherID` is the universal thread bridging module data into pure Accounting/GL data.
