/**
 * Business Profile — one-row config carrying the company details + logo
 * that the Sales Tax Invoice print (and future document templates) render.
 *
 * Backed by dms_BusinessProfile (migration 061). One row, so GET returns it
 * and PUT updates it; no create/delete surface.
 */
const path = require('path');
const fs = require('fs');
const { sql, getPool } = require('../config/db');

const EDITABLE_FIELDS = [
    'CompanyName', 'LegalName', 'Address1', 'Address2', 'City', 'Country',
    'PhoneNumbers', 'FaxNumber', 'Email', 'Website',
    'NTN', 'STRN', 'CNIC',
    'BankName', 'BankAccountNo', 'IBAN',
];

exports.get = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`SELECT TOP 1 * FROM dms_BusinessProfile ORDER BY ProfileID`);
        if (!r.recordset.length) return res.json(null);
        res.json(r.recordset[0]);
    } catch (err) {
        console.error('businessProfile.get:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.update = async (req, res) => {
    try {
        const body = req.body || {};
        if (!body.CompanyName || !String(body.CompanyName).trim()) {
            return res.status(400).json({ error: 'CompanyName is required.' });
        }
        const pool = await getPool();
        const existing = await pool.request().query(`SELECT TOP 1 ProfileID FROM dms_BusinessProfile ORDER BY ProfileID`);
        const request = pool.request()
            .input('by',   sql.Int, req.user?.userId || null)
            .input('byN',  sql.NVarChar(100), req.user?.userName || null);
        const sets = [];
        for (const f of EDITABLE_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(body, f)) {
                const v = body[f];
                const val = (v === '' || v === undefined || v === null) ? null : String(v);
                request.input(f, sql.NVarChar(sql.MAX), val);
                sets.push(`${f} = @${f}`);
            }
        }
        if (!existing.recordset.length) {
            // First-time save — INSERT rather than update
            const cols = EDITABLE_FIELDS.filter(f => Object.prototype.hasOwnProperty.call(body, f));
            const paramList = cols.map(f => `@${f}`).join(', ');
            const insCols   = cols.concat(['UpdatedBy', 'UpdatedByName']).join(', ');
            const insVals   = [paramList, '@by', '@byN'].join(', ');
            await request.query(`INSERT INTO dms_BusinessProfile (${insCols}) VALUES (${insVals})`);
        } else {
            const pid = existing.recordset[0].ProfileID;
            request.input('pid', sql.Int, pid);
            sets.push('UpdatedAt = SYSUTCDATETIME()');
            sets.push('UpdatedBy = @by');
            sets.push('UpdatedByName = @byN');
            await request.query(`UPDATE dms_BusinessProfile SET ${sets.join(', ')} WHERE ProfileID = @pid`);
        }
        return exports.get(req, res);
    } catch (err) {
        console.error('businessProfile.update:', err);
        res.status(400).json({ error: err.message });
    }
};

exports.uploadLogo = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
        const pool = await getPool();
        const existing = await pool.request().query(`SELECT TOP 1 ProfileID, LogoPath FROM dms_BusinessProfile ORDER BY ProfileID`);
        if (!existing.recordset.length) return res.status(400).json({ error: 'Save the profile first before uploading a logo.' });

        // Store relative path so the file is portable across servers.
        // Files live under Software/uploads/business/ and are served by
        // an /uploads/business/* static handler on the app.
        const relPath = `business/${req.file.filename}`;
        await pool.request()
            .input('pid', sql.Int,           existing.recordset[0].ProfileID)
            .input('lp',  sql.NVarChar(500), relPath)
            .input('by',  sql.Int,           req.user?.userId || null)
            .input('byN', sql.NVarChar(100), req.user?.userName || null)
            .query(`UPDATE dms_BusinessProfile
                    SET LogoPath = @lp, UpdatedAt = SYSUTCDATETIME(),
                        UpdatedBy = @by, UpdatedByName = @byN
                    WHERE ProfileID = @pid`);
        res.json({ LogoPath: relPath, message: 'Logo uploaded.' });
    } catch (err) {
        console.error('businessProfile.uploadLogo:', err);
        res.status(400).json({ error: err.message });
    }
};

exports.deleteLogo = async (req, res) => {
    try {
        const pool = await getPool();
        const existing = await pool.request().query(`SELECT TOP 1 ProfileID, LogoPath FROM dms_BusinessProfile ORDER BY ProfileID`);
        if (!existing.recordset.length) return res.status(404).json({ error: 'No profile row exists.' });
        const p = existing.recordset[0];
        if (p.LogoPath) {
            const full = path.join(__dirname, '..', 'uploads', p.LogoPath);
            try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch {}
        }
        await pool.request()
            .input('pid', sql.Int, p.ProfileID)
            .query(`UPDATE dms_BusinessProfile SET LogoPath = NULL, UpdatedAt = SYSUTCDATETIME() WHERE ProfileID = @pid`);
        res.json({ message: 'Logo removed.' });
    } catch (err) {
        console.error('businessProfile.deleteLogo:', err);
        res.status(400).json({ error: err.message });
    }
};
