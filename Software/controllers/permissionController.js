const { sql, getPool } = require('../config/db');
const bcrypt = require('bcryptjs');
const MODULES = require('../config/modules');
const { SECTIONS } = require('../config/permissions');

// Legacy flat module list (kept for any older callers that hit /modules)
exports.getModules = (req, res) => res.json(MODULES);

// New granular registry: sections + items (each item has kind: document/workflow/report)
exports.getPermissionRegistry = (req, res) => res.json(SECTIONS);

// ── Roles ─────────────────────────────────────────────────────────────────────
exports.getRoles = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT GroupID, GroupTitle, Description FROM GLUserGroup WHERE ISNULL(Inactive,0) = 0 ORDER BY GroupTitle');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

exports.deleteRole = async (req, res) => {
    try {
        const groupId = parseInt(req.params.groupId);
        if (groupId === 1) {
            return res.status(400).json({ error: 'Cannot delete the admin role.' });
        }
        const pool = await getPool();
        // Block deletion if any users are still in this group
        const inUse = await pool.request()
            .input('groupId', sql.Int, groupId)
            .query('SELECT COUNT(*) AS n FROM GLUser WHERE GroupID = @groupId');
        if (inUse.recordset[0].n > 0) {
            return res.status(409).json({
                error: `Cannot delete: ${inUse.recordset[0].n} user(s) are still assigned to this role.`,
            });
        }
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx).input('g', sql.Int, groupId)
                .query('DELETE FROM dms_ModulePermissions WHERE GroupID = @g');
            await new sql.Request(tx).input('g', sql.Int, groupId)
                .query('DELETE FROM GLUserGroup WHERE GroupID = @g');
            await tx.commit();
            res.json({ message: 'Role deleted' });
        } catch (e) { await tx.rollback(); throw e; }
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

exports.createRole = async (req, res) => {
    try {
        const { GroupTitle, Description } = req.body;
        const pool = await getPool();
        const result = await pool.request()
            .input('title', sql.NVarChar(100), GroupTitle)
            .input('desc', sql.NVarChar(500), Description || '')
            .query(`INSERT INTO GLUserGroup (GroupTitle, Description, Inactive)
                    OUTPUT INSERTED.GroupID
                    VALUES (@title, @desc, 0)`);
        res.status(201).json({ GroupID: result.recordset[0].GroupID });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Role Permissions — returns flat array of PermissionKey strings for the group
exports.getRolePermissions = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('groupId', sql.Int, parseInt(req.params.groupId))
            .query('SELECT PermissionKey FROM dms_ModulePermissions WHERE GroupID = @groupId');
        res.json(result.recordset.map(r => r.PermissionKey));
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// Accepts { permissions: ['workshop_jobs:view', 'report:trial_balance', 'finalize', ...] }
// Also still accepts legacy { modules: [...] } for backward compat — those entries
// are taken to mean "grant all 4 actions" on that document module.
exports.setRolePermissions = async (req, res) => {
    try {
        const groupId = parseInt(req.params.groupId);
        const incoming = Array.isArray(req.body.permissions) ? req.body.permissions
                       : Array.isArray(req.body.modules)     ? req.body.modules
                       : [];
        const pool = await getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            await new sql.Request(transaction)
                .input('groupId', sql.Int, groupId)
                .query('DELETE FROM dms_ModulePermissions WHERE GroupID = @groupId');

            // De-dupe and insert
            const unique = Array.from(new Set(incoming.filter(k => typeof k === 'string' && k.length > 0)));
            for (const key of unique) {
                await new sql.Request(transaction)
                    .input('groupId', sql.Int, groupId)
                    .input('key', sql.NVarChar(80), key)
                    .query('INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (@groupId, @key)');
            }
            await transaction.commit();
            res.json({ message: 'Permissions saved', count: unique.length });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

// ── Users ─────────────────────────────────────────────────────────────────────
exports.getUsers = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query(`SELECT u.Userid, u.UserName, u.GroupID, u.Active, u.CompanyID,
                           u.LinkedEmployeeID,
                           g.GroupTitle,
                           e.EmployeeName AS LinkedEmployeeName
                    FROM GLUser u
                    LEFT JOIN GLUserGroup g ON u.GroupID = g.GroupID
                    LEFT JOIN gen_EmployeeInfo e ON u.LinkedEmployeeID = e.EmployeeID
                    ORDER BY u.UserName`);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { UserName, Password, GroupID, LinkedEmployeeID } = req.body;
        if (!UserName || !Password || !GroupID) {
            return res.status(400).json({ error: 'UserName, Password and GroupID are required' });
        }
        const hash = await bcrypt.hash(Password, 10);
        const pool = await getPool();

        const existing = await pool.request()
            .input('uname', sql.NVarChar(100), UserName)
            .query('SELECT Userid FROM GLUser WHERE UserName = @uname');
        if (existing.recordset.length) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const result = await pool.request()
            .input('uname', sql.NVarChar(100), UserName)
            .input('pwd', sql.NVarChar(200), hash)
            .input('groupId', sql.Int, parseInt(GroupID))
            .input('linkedEmp', sql.Int, LinkedEmployeeID ? parseInt(LinkedEmployeeID) : null)
            .query(`INSERT INTO GLUser (UserName, UserPassword, GroupID, Active, CompanyID, LinkedEmployeeID)
                    OUTPUT INSERTED.Userid
                    VALUES (@uname, @pwd, @groupId, 1, 1, @linkedEmp)`);
        res.status(201).json({ Userid: result.recordset[0].Userid });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const { GroupID, Active, Password, LinkedEmployeeID } = req.body;
        const pool = await getPool();
        const linkedEmp = LinkedEmployeeID ? parseInt(LinkedEmployeeID) : null;

        if (Password) {
            const hash = await bcrypt.hash(Password, 10);
            await pool.request()
                .input('pwd', sql.NVarChar(200), hash)
                .input('groupId', sql.Int, parseInt(GroupID))
                .input('active', sql.Bit, Active ? 1 : 0)
                .input('linkedEmp', sql.Int, linkedEmp)
                .input('userId', sql.Int, userId)
                .query('UPDATE GLUser SET UserPassword=@pwd, GroupID=@groupId, Active=@active, LinkedEmployeeID=@linkedEmp WHERE Userid=@userId');
        } else {
            await pool.request()
                .input('groupId', sql.Int, parseInt(GroupID))
                .input('active', sql.Bit, Active ? 1 : 0)
                .input('linkedEmp', sql.Int, linkedEmp)
                .input('userId', sql.Int, userId)
                .query('UPDATE GLUser SET GroupID=@groupId, Active=@active, LinkedEmployeeID=@linkedEmp WHERE Userid=@userId');
        }
        res.json({ message: 'User updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const { Password } = req.body;
        if (!Password) return res.status(400).json({ error: 'Password is required' });
        const hash = await bcrypt.hash(Password, 10);
        const pool = await getPool();
        await pool.request()
            .input('pwd', sql.NVarChar(200), hash)
            .input('userId', sql.Int, userId)
            .query('UPDATE GLUser SET UserPassword=@pwd WHERE Userid=@userId');
        res.json({ message: 'Password reset' });
    } catch (err) {
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};
