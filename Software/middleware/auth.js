const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../config/db');
const { derivedModulesFromPermissions } = require('../config/permissions');

// JWT carries identity (userId, groupId, employeeId, ...) but PERMISSIONS are
// refreshed from the DB on every request so that admin grants/revokes take
// effect immediately — no logout/login required. The cost is one tiny SELECT
// per authenticated request; with <100 users this is negligible compared to
// the security & UX win of real-time permission updates.
module.exports = async function (req, res, next) {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = header.slice(7);
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('g', sql.Int, decoded.groupId)
            .query('SELECT PermissionKey FROM dms_ModulePermissions WHERE GroupID = @g');
        const permissions = r.recordset.map(x => x.PermissionKey);
        const modules = derivedModulesFromPermissions(permissions);
        req.user = { ...decoded, permissions, modules };
        next();
    } catch (err) {
        // If the perm refresh fails (e.g. DB blip), fall back to the JWT's snapshot
        // rather than locking the user out. Worst case = stale perms for this request.
        req.user = decoded;
        next();
    }
};
