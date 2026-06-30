const { sql, getPool } = require('../config/db');

// Canonical list of system role keys with display metadata.
// Code never hardcodes a GLCAID — always resolves via dms_SystemAccounts.
const ROLE_DEFS = [
    { key: 'CASH_BOOK',                label: 'Cash Book',                type: 'Asset',     purpose: 'Cash receipts and payments' },
    { key: 'GENERAL_CUSTOMER',         label: 'General Customer',         type: 'Asset',     purpose: 'Walk-in cash-sale catch-all subsidiary' },
    { key: 'GST_PAYABLE',              label: 'GST Payable',              type: 'Liability', purpose: 'Output GST collected on parts' },
    { key: 'INPUT_GST',                label: 'Input GST',                type: 'Asset',     purpose: 'Input GST paid to suppliers (claimable from FBR)' },
    { key: 'PST_PAYABLE',              label: 'PST Payable',              type: 'Liability', purpose: 'Output PST collected on labour + sublet' },
    { key: 'POS_CLEARING',             label: 'POS Clearing',             type: 'Asset',     purpose: 'Card payments awaiting bank settlement' },
    { key: 'DEFAULT_DISCOUNT_GIVEN',   label: 'Default Discount Given',   type: 'Expense',   purpose: 'Care-Off discounts on Job Cards / Store Sales' },
    { key: 'ROUNDING_ADJUSTMENT',      label: 'Rounding Adjustment',      type: 'Either',    purpose: 'Tiny PKR rounding orphans' },
    { key: 'PURCHASE_RETURN_VARIANCE', label: 'Purchase Return Variance', type: 'Revenue',   purpose: 'Variance income from GTRN at landed cost' },
    { key: 'CUSTOMER_ADVANCE_RECEIVED',label: 'Customer Advance Received',type: 'Liability', purpose: 'Customer pre-payments and overpayments' },
    { key: 'SUPPLIER_ADVANCE_PAID',    label: 'Supplier Advance Paid',    type: 'Asset',     purpose: 'Prepayments to suppliers' },
    { key: 'CHEQUES_ON_HAND',          label: 'Cheques on Hand',          type: 'Either',    purpose: 'Cheques received or issued before bank clearance' },
    // Sales module roles (migration 032). Admin maps each to a leaf account
    // in the 4xx / 5xx / 1xxxx / 2xxxx ranges via Accounting › System Accounts.
    { key: 'VEHICLE_INVENTORY',          label: 'Vehicle Inventory',          type: 'Asset',     purpose: 'On-hand chassis we own (debits when Master invoice posts)' },
    { key: 'BOOKING_RECEIVABLE',         label: 'Booking Receivable',         type: 'Asset',     purpose: 'Customer balance against a confirmed booking (subsidiary by BookingID)' },
    { key: 'BOOKING_ADVANCE',            label: 'Booking Advance Received',   type: 'Liability', purpose: 'Customer deposit on a booking before delivery is recognized' },
    { key: 'MASTER_VEHICLE_PAYABLE',     label: 'Master Vehicle Payable',     type: 'Liability', purpose: 'Owed to Master Changan for invoiced chassis' },
    { key: 'MASTER_INCENTIVE_RECEIVABLE',label: 'Master Incentive Receivable',type: 'Asset',     purpose: 'Incentive earned from Master, not yet credited / received' },
    { key: 'STAFF_INCENTIVE_PAYABLE',    label: 'Staff Incentive Payable',    type: 'Liability', purpose: 'Accrued sales-staff incentive awaiting disbursement' },
    { key: 'VEHICLE_SALES_REVENUE',      label: 'Vehicle Sales Revenue',      type: 'Revenue',   purpose: 'Revenue recognized at gate pass / delivery' },
    { key: 'PREMIUM_INCOME',             label: 'Premium Income',             type: 'Revenue',   purpose: 'Customer premium collected over MRP (memo today; opt-in to GL)' },
    { key: 'MASTER_INCENTIVE_INCOME',    label: 'Master Incentive Income',    type: 'Revenue',   purpose: 'Master incentive recognized when accrual is invoiced' },
    { key: 'COGS_VEHICLES',              label: 'COGS - Vehicles',            type: 'Expense',   purpose: 'Cost of chassis released at delivery' },
    { key: 'STAFF_INCENTIVE_EXPENSE',    label: 'Staff Incentive Expense',    type: 'Expense',   purpose: 'P&L hit when sales-staff incentive accrues' },
    { key: 'SALES_DISCOUNT_GIVEN',       label: 'Sales Discount Given',       type: 'Expense',   purpose: 'Discount portion when NegotiatedPrice < StandardPrice (opt-in to GL)' },
    // Workshop / Parts module roles (previously hardcoded by GLCode in posting services).
    { key: 'INVENTORY_PARTS',            label: 'Inventory - Parts',          type: 'Asset',     purpose: 'On-hand spare parts at landed cost (GRN Dr, JC/Store-sale Cr)' },
    { key: 'PARTS_REVENUE',              label: 'Parts Revenue (default)',    type: 'Revenue',   purpose: 'Fallback when a Job-Card Type has no PartsRevenueAccount override' },
    { key: 'SERVICE_REVENUE',            label: 'Service Revenue (default)',  type: 'Revenue',   purpose: 'Fallback when a Job-Card Type has no JobRevenueAccount override' },
    { key: 'SUBLET_REVENUE',             label: 'Sublet Revenue',             type: 'Revenue',   purpose: 'Revenue recognized when sublet vendor work is billed to the customer' },
    { key: 'COGS_PARTS',                 label: 'COGS - Parts',               type: 'Expense',   purpose: 'Cost of parts issued to a Job Card / Store Sale at average cost' },
    { key: 'SUBLET_COST',                label: 'Sublet Vendor Cost',         type: 'Expense',   purpose: 'Expense for the sublet vendor portion of a Job Card' },
    { key: 'TRADE_DEBTORS',              label: 'Trade Debtors (fallback)',   type: 'Asset',     purpose: 'Receivable bucket when a billed party has no PartyGLID set' },
    { key: 'TRADE_CREDITORS',            label: 'Trade Creditors (fallback)', type: 'Liability', purpose: 'Payable bucket when a supplier/sublet vendor has no PartyGLID set' },
];

// Internal lookup — used by other controllers (Job Card finalize, GRN finalize, etc.).
// Returns the GLCAID currently bound to a role, or throws if not configured.
exports.resolveRole = async (roleKey) => {
    const pool = await getPool();
    const result = await pool.request()
        .input('rk', sql.NVarChar(50), roleKey)
        .query('SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey=@rk');
    if (!result.recordset.length) {
        const err = new Error(`System account role '${roleKey}' is not configured. Set it in Accounting Setup.`);
        err.code = 'SYSTEM_ACCOUNT_NOT_CONFIGURED';
        throw err;
    }
    return result.recordset[0].GLCAID;
};

// GET /api/system-accounts
exports.getRoles = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT sa.RoleKey, sa.GLCAID, sa.AssignedBy, sa.AssignedByName, sa.AssignedAt,
                   c.GLCode, c.GLTitle
            FROM dms_SystemAccounts sa
            LEFT JOIN GLChartOFAccount c ON sa.GLCAID = c.GLCAID
        `);
        const assigned = {};
        for (const r of result.recordset) assigned[r.RoleKey] = r;
        const out = ROLE_DEFS.map(def => ({
            ...def,
            assigned: assigned[def.key] || null
        }));
        res.json(out);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/system-accounts/:roleKey/posting-count
// Tells the UI how many voucher-detail lines reference the currently-assigned account.
// Used to warn before reassignment.
exports.getPostingCount = async (req, res) => {
    try {
        const pool = await getPool();
        const cur = await pool.request()
            .input('rk', sql.NVarChar(50), req.params.roleKey)
            .query('SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey=@rk');
        if (!cur.recordset.length) return res.json({ glcaid: null, count: 0 });
        const glcaid = cur.recordset[0].GLCAID;
        const cnt = await pool.request()
            .input('gl', sql.Int, glcaid)
            .query('SELECT COUNT(*) AS cnt FROM data_FinanceVoucherDetail WHERE GLCAID=@gl');
        res.json({ glcaid, count: cnt.recordset[0].cnt });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/system-accounts/:roleKey  body: { GLCAID, Reason? }
// Atomic: upsert dms_SystemAccounts + insert dms_SystemAccountAudit row.
exports.setRole = async (req, res) => {
    const roleKey = req.params.roleKey;
    const { GLCAID, Reason } = req.body;

    if (!ROLE_DEFS.find(r => r.key === roleKey)) {
        return res.status(400).json({ error: `Unknown role key '${roleKey}'.` });
    }
    const newId = parseInt(GLCAID);
    if (!newId || isNaN(newId)) {
        return res.status(400).json({ error: 'GLCAID is required.' });
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        // Verify target account exists and is a leaf (non-parent)
        const accCheck = await new sql.Request(transaction)
            .input('gl', sql.Int, newId)
            .query('SELECT GLCode, GLTitle, isParent FROM GLChartOFAccount WHERE GLCAID=@gl');
        if (!accCheck.recordset.length) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Target account not found.' });
        }
        if (accCheck.recordset[0].isParent === 1) {
            await transaction.rollback();
            return res.status(400).json({ error: 'System role must point to a leaf account, not a parent.' });
        }

        // Read existing assignment (if any) for audit's OldGLCAID
        const cur = await new sql.Request(transaction)
            .input('rk', sql.NVarChar(50), roleKey)
            .query('SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey=@rk');
        const oldId = cur.recordset.length ? cur.recordset[0].GLCAID : null;

        if (oldId === newId) {
            await transaction.rollback();
            return res.status(200).json({ message: 'No change — same account already assigned.', changed: false });
        }

        // Upsert
        if (oldId === null) {
            await new sql.Request(transaction)
                .input('rk', sql.NVarChar(50), roleKey)
                .input('gl', sql.Int, newId)
                .input('by', sql.Int, req.user?.userId || null)
                .input('byName', sql.NVarChar(100), req.user?.userName || null)
                .query(`INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName)
                        VALUES (@rk, @gl, @by, @byName)`);
        } else {
            await new sql.Request(transaction)
                .input('rk', sql.NVarChar(50), roleKey)
                .input('gl', sql.Int, newId)
                .input('by', sql.Int, req.user?.userId || null)
                .input('byName', sql.NVarChar(100), req.user?.userName || null)
                .query(`UPDATE dms_SystemAccounts
                        SET GLCAID=@gl, AssignedBy=@by, AssignedByName=@byName, AssignedAt=GETDATE()
                        WHERE RoleKey=@rk`);
        }

        // Audit row — same transaction
        await new sql.Request(transaction)
            .input('rk', sql.NVarChar(50), roleKey)
            .input('oldGl', sql.Int, oldId)
            .input('newGl', sql.Int, newId)
            .input('by', sql.Int, req.user?.userId || null)
            .input('byName', sql.NVarChar(100), req.user?.userName || null)
            .input('reason', sql.NVarChar(500), Reason || null)
            .query(`INSERT INTO dms_SystemAccountAudit (RoleKey, OldGLCAID, NewGLCAID, ChangedBy, ChangedByName, Reason)
                    VALUES (@rk, @oldGl, @newGl, @by, @byName, @reason)`);

        await transaction.commit();
        res.json({
            message: oldId === null ? 'Role assigned.' : 'Role reassigned.',
            changed: true,
            roleKey, oldGLCAID: oldId, newGLCAID: newId
        });
    } catch (err) {
        try { await transaction.rollback(); } catch {}
        res.status(400).json({ error: err.message });
    }
};

// GET /api/system-accounts/:roleKey/audit
exports.getAudit = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('rk', sql.NVarChar(50), req.params.roleKey)
            .query(`SELECT a.AuditID, a.RoleKey,
                           a.OldGLCAID, oc.GLCode AS OldGLCode, oc.GLTitle AS OldGLTitle,
                           a.NewGLCAID, nc.GLCode AS NewGLCode, nc.GLTitle AS NewGLTitle,
                           a.ChangedBy, a.ChangedByName, a.ChangedAt, a.Reason
                    FROM dms_SystemAccountAudit a
                    LEFT JOIN GLChartOFAccount oc ON a.OldGLCAID = oc.GLCAID
                    LEFT JOIN GLChartOFAccount nc ON a.NewGLCAID = nc.GLCAID
                    WHERE a.RoleKey = @rk
                    ORDER BY a.ChangedAt DESC`);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.ROLE_DEFS = ROLE_DEFS;
