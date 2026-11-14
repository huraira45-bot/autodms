# Vehicle Stock Allocation

Open **Sale Module Reports → Vehicle Stock Allocation**, route `/reports/sales/vehicle-stock-allocation`. The new report uses existing `sales_reports` or `report:vehicle_inventory` access. Its navigation item is also available in sidebar/report search. No migration or new permission grant is required.

Each row represents one registered vehicle, showing chassis/engine, model/variant/color, effective stock status and location, Booked or Open Allocation stock type, assigned booking/internal number/external DMS number, customer/CNIC/phone, booking date/promised month, booking status and salesperson. Search supports full or partial chassis, engine, DMS/internal booking number or customer name. Parameters are bound and SQL wildcard characters are escaped. Blank search shows all matching vehicles.

Filters: At Dealer/In Transit/At Master/Allocated status; Booked/Open Allocation stock type; Assigned/Unassigned/review; In stock only. In stock only is selected initially and excludes delivered/sold/returned vehicles using the existing gate-pass/delivery override. Filters combine and totals are based on selected rows. Print includes all matching rows; Excel includes all matching rows and the complete detail columns. Reset clears filters and restores In stock only.

Stock type is distinct from customer assignment: an Open Allocation vehicle can later be assigned to a customer's booking and retains its recorded stock type. Customer links are resolved using both CurrentBookingID and reciprocal booking AllocatedVehicleID. Cancelled bookings are excluded from active assignments. Multiple active matches or stale pointers are marked Review booking links; a customer is not guessed, and a vehicle is not counted multiple times. Linked booking details are shown only for a unique active match. The report does not repair links or change any vehicle, booking, payment or accounting data.

The existing **Vehicle Inventory** report now additionally displays a Stock type column and Booked/Open Allocation filter. It preserves existing status and undelivered-stock behavior. The variant inventory ledger is unchanged.

Validation: 68 tests across vehicleAllocationReport, vehicleInventoryReports and salesReportModule passed; production frontend build passed. Covers parameterized chassis/DMS/customer search, wildcard escaping, separate assignment/type totals, link SQL guards, stock/type filters, invalid input, delivery exclusion, API access and navigation exposure. No browser interaction or actual SQL integration test is claimed. Source deployment remains manual: git pull, frontend build, PM2 restart/save, Ctrl+F5. No data migration.

Update 14 November 2026: At Dealer now includes vehicles allocated there until delivery. Allocation no longer forms a separate physical stock location. Read docs/VEHICLE_STOCK_LEDGER.md, Allocated stock stays in its location, for history-based location retention, included-subset totals and validation.
