# Master Data (`gen_`) Module: System Design & Architecture

## 1. Understanding Summary
*   **What is being built:** A complete, production-ready Dealership Management System (DMS). We are rolling out sequentially, starting with **Module 1: Master Configurations & HR (`gen_` tables)** (Employees, Customers, Branches).
*   **Why it exists:** To modernize the dealership workflow while leveraging the massive existing legacy database (`db1`). Master Data must be built first, as it is the foundation for all job cards, invoices, and accounting.
*   **Who it is for:** All dealership staff (HR, Service Advisors, Showroom, Accounting).
*   **Key Constraints:** 
    *   Strict MVC Architecture.
    *   "Fat Database / Thin Client" model: Heavy business logic, validation, and cascading rules are completely locked inside SQL Server Stored Procedures and Triggers.
    *   Node.js acts purely as a routing Controller layer.
    *   Local SQL Server database environment.
*   **Explicit Non-Goals:** We are not building out other modules (like Workshop or Sales) until this module is fully complete. We are not writing data-processing business logic inside Node.js.

## 2. Assumptions
*   **Scale & Reliability:** On-premise deployment handling 10-50 concurrent staff. Must operate fully without external internet access.
*   **Security:** Role-Based Access Control (RBAC).
*   **Database Engine:** Microsoft SQL Server (MSSQL).
*   **View Layer:** A decoupled modern frontend (e.g., React or standard JS) communicating with the Node.js REST API.

## 3. Decision Log
1.  **Module Focus:** Decided to build the Master Data (`gen_`) module first. 
    *   *Why:* Required foundation for all other transactions in the system.
2.  **Backend Architecture:** Decided on a Hybrid "View & Procedure" approach. 
    *   *Alternatives:* Stored Procedure Only, Generic Gateway. 
    *   *Why:* Balances the "Fat DB" requirement with faster development speed for simple Read queries.
3.  **Deletion Strategy:** Decided to enforce strict Soft Deletes via SQL updates. 
    *   *Why:* Hard deletes risk corrupting the dealership's financial ledger if a master record is tied to past invoices.

## 4. Final Architecture Design

### A. The Read Pathway (SQL Views)
For reading data (e.g., getting a list of employees), we bypass complex Node.js logic and rely on SQL Views.
*   **Database:** We will create dedicated, flat SQL Views (e.g., `vw_ActiveEmployees`). These views execute all complex `JOIN` logic internally (e.g., joining Branch Names or Designations).
*   **Node.js (Controller):** When `GET /api/employees` is called, Node.js executes a parameterized `SELECT` against the view. Node handles pagination (`OFFSET/FETCH`) and basic search filters, but performs zero data mapping in memory. It directly returns the SQL rows to the frontend.

### B. The Write Pathway (Stored Procedures)
For writing data (Create, Update, Delete), we strictly enforce the Fat DB constraint.
*   **Node.js (Controller):** When `POST /api/employees` is called, Node.js performs basic authentication and immediately executes `EXEC sp_InsertEmployee @EmployeeData`.
*   **Database:** The Stored Procedure takes full responsibility for:
    *   Validation (e.g., duplicate phone number checks).
    *   Foreign Key integrity.
    *   Executing the Insert/Update.

### C. Error Handling & Edge Cases
*   **SQL-Level Error Translation:** Stored Procedures use `BEGIN TRY... BEGIN CATCH` blocks. Instead of crashing Node.js with raw SQL exceptions, the procedure catches errors and outputs a clean JSON response (e.g., `{ "Status": 400, "Message": "Duplicate Email" }`). Node simply forwards this to the frontend.
*   **Audit Stamping:** Every write procedure requires Node.js to pass the logged-in user's token ID (`@ActionUserID`). SQL Server enforces stamping this ID into the `EntryUserID` or `ModifyUserID` columns for an unbreakable audit trail.

## 5. Full Product Implementation Roadmap

To build the entire Dealership Management System logically—respecting all database foreign key dependencies—we will follow this strict sequential path:

### Phase 1: Master Configurations & HR (`gen_`) **[CURRENT]**
*   **What we build:** Companies, Branches, Employees, System Configs, and `gen_PartiesInfo` (the master directory for customers/vendors).
*   **Why it's first:** Every single transaction in the database requires an `EmployeeID` or `PartyID`. Nothing else can exist without this foundation.

### Phase 2: Inventory & Catalog Master (`Invent_`)
*   **What we build:** The master catalog for Vehicles and Spare Parts (`InventItems`), item groupings, and Warehouses.
*   **Why it's second:** Before we can procure, sell, or repair anything, the system must know exactly what physical items exist.

### Phase 3: Procurement & Supply Chain (`data_Purchase_` & `data_Stock_`)
*   **What we build:** Purchase Orders to manufacturers (OEMs), Gate Passes, and Stock Arrivals.
*   **Why it's third:** We need a way to fill our physical and digital warehouses with the parts defined in Phase 2.

### Phase 4: Workshop & After-Sales Service (`addata_` Job Cards)
*   **What we build:** Customer Vehicle Registration, Job Cards, Mechanic Assignments, Parts Consumption, and Service Invoicing.
*   **Why it's fourth:** Now that we have Customers (Phase 1), Mechanics (Phase 1), and Spare Parts (Phases 2 & 3), we can finally perform vehicle repairs.

### Phase 5: Showroom Retail & Sales (`addata_Sale_`)
*   **What we build:** Over-the-counter spare parts sales and showroom new vehicle sales.
*   **Why it's fifth:** We can only sell vehicles and parts that are already actively managed in stock.

### Phase 6: General Ledger & Accounting (`GL_`) **[FINAL]**
*   **What we build:** Chart of Accounts, Journal Vouchers, Trial Balances, and Financial Year closing procedures.
*   **Why it's last:** Accounting is the final "bucket" that catches the financial impact of everything else. Once the other phases are generating automated vouchers, we build the dashboards to view the dealership's Profit & Loss.
