/**
 * Permission registry.
 *
 * Three KINDs of permission:
 *   document — list/view records, plus create/edit/delete actions
 *              → expands to 4 keys: '<key>:view', ':insert', ':edit', ':delete'
 *   workflow — page-level access (no CRUD breakdown) → 1 key: '<key>'
 *   report   — single report → 1 key: 'report:<slug>'
 *
 * Used by the migration to seed admin with all permissions, by the role-admin
 * UI to render the grid, and by the auth middleware to derive the legacy
 * "modules" array (for backward compatibility with existing route guards).
 */

const SECTIONS = [
    {
        name: 'WORKSHOP & SERVICE',
        items: [
            { key: 'workshop_customers',     label: 'Workshop Customers',     kind: 'document' },
            { key: 'workshop_jobs',          label: 'Job Cards (RO)',          kind: 'document' },
            { key: 'workshop_labour',        label: 'Labour & Services',       kind: 'document' },
            { key: 'workshop_sublet',        label: 'Sublet Repairs',          kind: 'document' },
            { key: 'workshop_parts_issue',   label: 'Parts Issue',             kind: 'document' },
            { key: 'workshop_settings',      label: 'Workshop Settings (JC Types)', kind: 'document' },
            { key: 'workshop_careoff',       label: 'Care-Off Management',     kind: 'document' },
            { key: 'workshop_accessories',   label: 'Accessories Master',      kind: 'document' },
            { key: 'workshop_gatepass',      label: 'Gate Pass',               kind: 'document' },
            { key: 'workshop_controller',    label: 'Job Controller',          kind: 'workflow' },
        ],
    },
    {
        name: 'PARTS & INVENTORY',
        items: [
            { key: 'parts_spare',          label: 'Spare Parts Master',  kind: 'document' },
            { key: 'inventory_settings',   label: 'Parts Config (Warehouses, Tax)', kind: 'document' },
            { key: 'procurement_grn',      label: 'Receiving (GRN)',     kind: 'document' },
            { key: 'procurement_grtn',     label: 'Returns (GRTN)',      kind: 'document' },
            { key: 'sales_store',          label: 'Store Sale (Spares)', kind: 'document' },
            { key: 'sales_ssr',            label: 'Sale Returns (SSR)',  kind: 'document' },
        ],
    },
    {
        // Paint Lab — internal paint inventory + costing module
        // (owner ask 2026-07-04). Mirrors config/modules.js.
        name: 'PAINT LAB',
        items: [
            // All backend routes check `paint_lab_*:view` (see paintLabRoutes.js
            // and paintReportsRoutes.js), so every key is a document — the
            // registry expands into :view / :insert / :edit / :delete.
            { key: 'paint_lab_dashboard', label: 'Paint Lab Dashboard',     kind: 'document' },
            { key: 'paint_lab_items',     label: 'Paint Items',             kind: 'document' },
            { key: 'paint_lab_grn',       label: 'Paint GRN (Receiving)',   kind: 'document' },
            { key: 'paint_lab_grtn',      label: 'Paint GRTN (Returns)',    kind: 'document' },
            { key: 'paint_lab_issue',     label: 'Paint Issue to Job Card', kind: 'document' },
            { key: 'paint_lab_reports',   label: 'Paint Reports',           kind: 'document' },
            { key: 'paint_lab_settings',  label: 'Paint Settings',          kind: 'document' },
        ],
    },
    {
        name: 'FINANCE & ACCOUNTS',
        items: [
            { key: 'finance_coa',       label: 'Chart of Accounts',       kind: 'document' },
            { key: 'finance_vouchers',  label: 'Vouchers (CPV/CRV/BPV/BRV/JV)', kind: 'document' },
            { key: 'finance_voucher_backdate', label: 'Edit posted CPV/CRV/BPV/BRV (within 30 days)', kind: 'workflow' },
            { key: 'chat_use',   label: 'Chat: send & receive messages', kind: 'workflow' },
            { key: 'chat_admin', label: 'Chat: audit all channels + delete',   kind: 'workflow' },
            { key: 'charity_view', label: 'Charity Tracker (view + report)', kind: 'workflow' },
            { key: 'accounting_setup',  label: 'Accounting Setup (Banks, Roles)', kind: 'document' },
            { key: 'payments',          label: 'Receive / Make Payment',  kind: 'workflow' },
            { key: 'finance_cheques',   label: 'Cheque Clearance',        kind: 'workflow' },
        ],
    },
    {
        name: 'ACCOUNTS & CRM',
        items: [
            { key: 'crm_parties',       label: 'Credit Parties',        kind: 'document' },
            { key: 'crm_party_access',  label: 'Party Business Access', kind: 'workflow' },
            { key: 'crd_followups',     label: 'CRD Follow-Ups',        kind: 'workflow' },
        ],
    },
    {
        name: 'CUSTOMER RELATION (CRO)',
        items: [
            { key: 'cro_workspace',       label: 'CRO Workspace',           kind: 'workflow' },
            { key: 'cro_admin',           label: 'CRO Admin',               kind: 'workflow' },
            { key: 'cro_dept_responder',  label: 'CRO Department Responder', kind: 'workflow' },
            { key: 'cro_reports',         label: 'CRO Reports (read-only)', kind: 'workflow' },
        ],
    },
    {
        name: 'NEW VEHICLE SALES',
        items: [
            { key: 'sales_executive',         label: 'Sales Executive (booking + payments)', kind: 'workflow' },
            { key: 'sales_agm',               label: 'Sales AGM (team view + assign)',        kind: 'workflow' },
            { key: 'sales_gm',                label: 'Sales GM (full team + targets)',       kind: 'workflow' },
            { key: 'sales_admin_pricing',     label: 'Pricing Admin (approve discounts)',    kind: 'workflow' },
            { key: 'sales_admin_settings',    label: 'Catalog & Policy Admin',               kind: 'workflow' },
            { key: 'sales_master_settlement', label: 'Master Invoice Posting',               kind: 'workflow' },
            { key: 'sales_recovery',          label: 'Recovery Officer',                     kind: 'workflow' },
            { key: 'sales_hierarchy',         label: 'Hierarchy & Targets (HR-side)',        kind: 'workflow' },
            { key: 'sales_reports',           label: 'Sales Reports (read-only)',            kind: 'workflow' },
        ],
    },
    {
        name: 'ADMIN & HR',
        items: [
            { key: 'hr_employees',      label: 'Employees',         kind: 'document' },
            { key: 'hr_settings',       label: 'HR Config',         kind: 'document' },
            { key: 'admin_users',       label: 'User Management',   kind: 'document' },
            { key: 'admin_permissions', label: 'Role Permissions',  kind: 'document' },
        ],
    },
    {
        name: 'WORKFLOW',
        items: [
            { key: 'finalize',         label: 'Finalize Records',          kind: 'workflow' },
            { key: 'am_approve',       label: 'Approve Unfinalize (AM)',   kind: 'workflow' },
            { key: 'admin_unfinalize', label: 'Perform Unfinalize',        kind: 'workflow' },
        ],
    },
    {
        name: 'REPORTS — FINANCIAL',
        items: [
            { key: 'report:trial_balance',         label: 'Trial Balance',         kind: 'report' },
            { key: 'report:trial_balance_extract', label: 'Trial Balance Extract', kind: 'report' },
            { key: 'report:gl_detail',             label: 'GL Detail',             kind: 'report' },
            { key: 'report:customer_statement',    label: 'Customer Statement',    kind: 'report' },
            { key: 'report:supplier_statement',    label: 'Supplier Statement',    kind: 'report' },
            { key: 'report:daily_cash_book',       label: 'Daily Cash Book',       kind: 'report' },
            { key: 'report:tax_summary',           label: 'Tax Summary',           kind: 'report' },
            { key: 'report:pnl',                   label: 'Profit & Loss',         kind: 'report' },
            { key: 'report:balance_sheet',         label: 'Balance Sheet',         kind: 'report' },
            { key: 'report:day_book',              label: 'Day Book',              kind: 'report' },
            { key: 'report:receivables_aging',     label: 'Receivables Aging',     kind: 'report' },
            { key: 'report:payables_aging',        label: 'Payables Aging',        kind: 'report' },
            { key: 'report:tax_rate_history',      label: 'Tax Rate History',      kind: 'report' },
            { key: 'report:pos_pending',           label: 'POS Pending',           kind: 'report' },
            { key: 'report:cheques_on_hand',       label: 'Cheques on Hand',       kind: 'report' },
            { key: 'report:bank_balances',         label: 'Bank Balances',         kind: 'report' },
            { key: 'report:discount_given',        label: 'Discount Given',        kind: 'report' },
            { key: 'report:sales_register',        label: 'Sales Register',        kind: 'report' },
            { key: 'report:insurance_aging',       label: 'Insurance Aging',       kind: 'report' },
            { key: 'report:gross_margin',          label: 'Gross Margin',          kind: 'report' },
            { key: 'report:inventory_valuation',   label: 'Inventory Valuation',   kind: 'report' },
            { key: 'report:gencust_reconciliation',label: 'Gen-Cust Reconciliation', kind: 'report' },
            { key: 'report:walkin_outstanding',    label: 'Walk-in Outstanding',   kind: 'report' },
            { key: 'report:voucher_audit',         label: 'Voucher Audit',         kind: 'report' },
            { key: 'report:system_account_audit',  label: 'System Account Audit',  kind: 'report' },
            { key: 'report:unfinalize_log',        label: 'Unfinalize Log (JC)',   kind: 'report' },
            { key: 'report:party_open_invoices',    label: 'Party Open Invoices',   kind: 'report' },
            { key: 'report:store_sale_receivables', label: 'Store Sale Receivables', kind: 'report' },
            { key: 'report:revenue_split',         label: 'Revenue Split (Cash/Credit)', kind: 'report' },
            { key: 'report:bu_pnl',                label: 'Business Unit P&L (Rev vs Cost)', kind: 'report' },
        ],
    },
    {
        name: 'REPORTS — WORKSHOP / SERVICE',
        items: [
            { key: 'report:job_card_register',     label: 'Job Card Register',     kind: 'report' },
            { key: 'report:advisor_performance',   label: 'Advisor Performance',   kind: 'report' },
            { key: 'report:revenue_summary',       label: 'Service Revenue Summary', kind: 'report' },
            { key: 'report:insurance_claims',      label: 'Insurance Claims',      kind: 'report' },
            { key: 'report:mechanic_productivity', label: 'Mechanic Productivity', kind: 'report' },
            { key: 'report:tax_invoice_tracker',   label: 'Tax Invoice Tracker',   kind: 'report' },
        ],
    },
    {
        name: 'REPORTS — PARTS',
        items: [
            { key: 'report:stock_movement',        label: 'Stock Movement',        kind: 'report' },
            { key: 'report:reorder_alert',         label: 'Reorder Alert',         kind: 'report' },
            { key: 'report:parts_sales_register',  label: 'Parts Sales Register',  kind: 'report' },
            { key: 'report:purchase_summary',      label: 'Purchase Summary',      kind: 'report' },
            { key: 'report:parts_issued_to_jc',    label: 'Parts Issued to JC',    kind: 'report' },
            { key: 'report:parts_sold_finalized',  label: 'Parts Sold (Finalized)', kind: 'report' },
            { key: 'report:item_ledger',           label: 'Item Ledger',           kind: 'report' },
        ],
    },
    {
        name: 'REPORTS — SALES (VEHICLES)',
        items: [
            { key: 'report:booking_register',          label: 'Booking Register',          kind: 'report' },
            { key: 'report:vehicle_inventory',         label: 'Vehicle Inventory',         kind: 'report' },
            { key: 'report:executive_performance',     label: 'Executive Performance',     kind: 'report' },
            { key: 'report:customer_advances_aging',   label: 'Customer Advances Aging',   kind: 'report' },
            { key: 'report:booking_pipeline',          label: 'Booking Pipeline',          kind: 'report' },
            { key: 'report:master_invoice_aging',      label: 'Master Invoice Aging',      kind: 'report' },
            { key: 'report:incentive_receivable_aging',label: 'Incentive Receivable Aging', kind: 'report' },
        ],
    },
];

const ACTIONS = ['view', 'insert', 'edit', 'delete'];

/**
 * Expand the registry into the flat list of permission keys.
 * Document modules become 4 keys (view/insert/edit/delete);
 * workflow + report modules stay as a single key.
 */
function expandAllPermissionKeys() {
    const keys = [];
    for (const sec of SECTIONS) {
        for (const item of sec.items) {
            if (item.kind === 'document') {
                for (const a of ACTIONS) keys.push(`${item.key}:${a}`);
            } else {
                keys.push(item.key);
            }
        }
    }
    return keys;
}

/**
 * Derive the legacy "modules" array (binary list of base module keys) from
 * a granular permission-keys set. A user is considered to "have" a module
 * if they have ANY action on it (view counts). Used by the auth middleware
 * so existing route guards (`req.user.modules.includes('workshop_jobs')`)
 * keep working unmodified.
 */
function derivedModulesFromPermissions(permissionKeys) {
    const out = new Set();
    for (const k of permissionKeys) {
        const baseKey = k.includes(':') ? k.split(':')[0] : k;
        // 'report' base shouldn't become a module — only the original 'reports' bundle did
        if (baseKey === 'report') {
            out.add('reports');   // legacy bundle
        } else {
            out.add(baseKey);
        }
    }
    return Array.from(out);
}

module.exports = {
    SECTIONS,
    ACTIONS,
    expandAllPermissionKeys,
    derivedModulesFromPermissions,
};
