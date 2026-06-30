const { sql, getPool } = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { derivedModulesFromPermissions } = require('../config/permissions');

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const pool = await getPool();
        const result = await pool.request()
            .input('username', sql.NVarChar(100), username)
            .query(`SELECT u.Userid, u.UserName, u.UserPassword, u.GroupID, u.Active,
                           u.LinkedEmployeeID,
                           g.GroupTitle,
                           e.EmployeeName AS LinkedEmployeeName
                    FROM GLUser u
                    LEFT JOIN GLUserGroup g ON u.GroupID = g.GroupID
                    LEFT JOIN gen_EmployeeInfo e ON u.LinkedEmployeeID = e.EmployeeID
                    WHERE u.UserName = @username`);

        if (!result.recordset.length) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const user = result.recordset[0];

        if (!user.Active) {
            return res.status(403).json({ error: 'Account is inactive. Contact administrator.' });
        }

        const storedHash = user.UserPassword || '';
        if (!storedHash.startsWith('$2b$') && !storedHash.startsWith('$2a$')) {
            return res.status(401).json({ error: 'Password not set for DMS. Contact administrator to reset your password.' });
        }

        const match = await bcrypt.compare(password, storedHash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const permsResult = await pool.request()
            .input('groupId', sql.Int, user.GroupID)
            .query('SELECT PermissionKey FROM dms_ModulePermissions WHERE GroupID = @groupId');

        const permissions = permsResult.recordset.map(r => r.PermissionKey);
        const modules = derivedModulesFromPermissions(permissions);

        const payload = {
            userId: user.Userid,
            userName: user.UserName,
            groupId: user.GroupID,
            groupTitle: user.GroupTitle,
            employeeId: user.LinkedEmployeeID || null,
            employeeName: user.LinkedEmployeeName || null,
            permissions,
            modules,
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: payload });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
};

exports.me = async (req, res) => {
    try {
        const pool = await getPool();
        const permsResult = await pool.request()
            .input('groupId', sql.Int, req.user.groupId)
            .query('SELECT PermissionKey FROM dms_ModulePermissions WHERE GroupID = @groupId');

        const permissions = permsResult.recordset.map(r => r.PermissionKey);
        const modules = derivedModulesFromPermissions(permissions);
        res.json({ ...req.user, permissions, modules });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};
