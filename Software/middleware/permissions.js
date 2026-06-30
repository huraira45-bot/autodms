/**
 * Permission guards (Phase 2 enforcement).
 *
 * All helpers assume the upstream JWT-auth middleware has already populated
 * req.user — they only check granted permissions. Admin (groupId === 1)
 * always passes through.
 *
 *   requirePerm('workshop_jobs', 'edit')
 *       → grants if user has 'workshop_jobs:edit'
 *   requireAccess('finalize')
 *   requireAccess('report:trial_balance')
 *       → grants if user has the exact key (no action suffix)
 *   requireAnyAccess('cro_workspace', 'cro_admin')
 *       → grants if user has ANY of the listed keys
 *   requireAnyPerm(['workshop_jobs','workshop_parts_issue'], 'view')
 *       → grants if user has ANY of <key>:<action>
 *
 * On deny, returns HTTP 403 with a small JSON body that includes the missing
 * permission key — useful for the frontend to surface what's blocked.
 */

const ADMIN_GROUP_ID = 1;

function isAdmin(req) {
    return req?.user?.groupId === ADMIN_GROUP_ID;
}

function hasKey(req, key) {
    return Array.isArray(req?.user?.permissions) && req.user.permissions.includes(key);
}

function deny(res, missing) {
    return res.status(403).json({
        error: 'Permission denied',
        missing,
    });
}

const requirePerm = (moduleKey, action) => (req, res, next) => {
    if (isAdmin(req)) return next();
    const key = `${moduleKey}:${action}`;
    if (hasKey(req, key)) return next();
    return deny(res, key);
};

const requireAccess = (key) => (req, res, next) => {
    if (isAdmin(req)) return next();
    if (hasKey(req, key)) return next();
    return deny(res, key);
};

const requireAnyAccess = (...keys) => (req, res, next) => {
    if (isAdmin(req)) return next();
    for (const k of keys) if (hasKey(req, k)) return next();
    return deny(res, keys.join(' OR '));
};

const requireAnyPerm = (moduleKeys, action) => (req, res, next) => {
    if (isAdmin(req)) return next();
    for (const m of moduleKeys) if (hasKey(req, `${m}:${action}`)) return next();
    return deny(res, moduleKeys.map(m => `${m}:${action}`).join(' OR '));
};

module.exports = {
    requirePerm,
    requireAccess,
    requireAnyAccess,
    requireAnyPerm,
    isAdmin,
    hasKey,
};
