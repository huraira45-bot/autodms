# Booking creation for Sales users

Normal booking creation now accepts the seven existing Sales-reader permission keys: sales_executive, sales_agm, sales_gm, sales_reports, sales_admin_pricing, sales_admin_settings and sales_master_settlement. The Bookings tile and New Booking button use the same list. No new permission grants are written to users or roles.

The form starts with no executive selected. A salesperson must be explicitly selected from the enabled, active, non-resigned roster managed under Vehicle Sales > Sales Executives. The backend rejects omitted or forged/off-roster IDs; the signed-in user need not be a configured salesperson or have an HR link for a standard-price booking. Existing discount proposal requirements and accounting behavior remain in place. Audit events retain the actual operator.

The new form customer lookup is restricted to customer-side parties on the 201002 account branch, including Customer, Both and CorporateCustomer. It cannot be redirected to supplier or other account data. Existing historical-entry, financial, settlement, settings and document-upload permissions are unchanged.

The owner-requested transfer of 29 existing booking assignments was separately committed and verified on the live server on 17 November 2026, with per-booking audit and timeline entries. Payments, dates, vehicle links and existing incentive rows were preserved. Private evidence is retained locally and excluded from the source commit.

Deploy by pulling the source, rebuilding the frontend and restarting PM2. No new migration is required for this access change.

Validation: 120 tests passed across four suites; frontend production build passed.
