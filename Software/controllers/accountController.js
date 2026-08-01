const { sql, getPool } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');

/**
 * Policy: vouchers can only be posted with today's date — no back-date, no
 * future-date. The cheque-clearance / payment / finalize-driven postings all
 * already use new Date(), so the only ingress to enforce here is the manual
 * voucher entry surface (saveVoucher / updateVoucher).
 *
 * Returns null if the date is today (in server local time), else a string
 * describing the violation. Accepts ISO date strings, full timestamps, or
 * blank (blank is treated as "today" because the frontend defaults that way).
 */
function checkVoucherDateIsToday(input) {
    if (!input) return null;                       // empty → server defaults to GETDATE/now
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return 'Voucher date is invalid.';
    const today = new Date();
    const sameDay =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth()    === today.getMonth() &&
        d.getDate()     === today.getDate();
    if (sameDay) return null;
    return d > today
        ? 'Future-dated vouchers are not allowed. Please use today\'s date.'
        : 'Back-dated vouchers are not allowed. Please use today\'s date.';
}

// Owner ask 2026-07-18: a user with `finance_voucher_backdate` can edit
// posted CPV/CRV/BPV/BRV vouchers dated within the last N days. Window
// widened from 5 to 30 days later the same day so the cashier can
// correct receipts across a full month-end cycle.
// Returns null if the date is within [today − n, today]; a message otherwise.
const BACKDATE_WINDOW_DAYS = 30;
function checkVoucherDateWithinBackdateWindow(input) {
    if (!input) return null;
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return 'Voucher date is invalid.';
    const today   = new Date(); today.setHours(23, 59, 59, 999);
    const cutoff  = new Date(); cutoff.setDate(cutoff.getDate() - BACKDATE_WINDOW_DAYS); cutoff.setHours(0, 0, 0, 0);
    if (d > today)   return 'Future-dated vouchers are not allowed.';
    if (d < cutoff)  return `Edit is only allowed for vouchers dated within the last ${BACKDATE_WINDOW_DAYS} days.`;
    return null;
}

function userHasBackdatePermission(req) {
    if (req?.user?.groupId === 1) return true;
    return Array.isArray(req?.user?.permissions)
        && req.user.permissions.includes('finance_voucher_backdate');
}

exports.addAccount = async (req, res) => {
    try {
        const { GLTitle, GLLevel, GLNature, isParent, ParentCode, ClassRoot } = req.body;
        const pool = await getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const level = parseInt(GLLevel);
            const lastPartLength = level === 2 ? 2 : 3;
            const suffixCap = Math.pow(10, lastPartLength); // 100 for L2, 1000 for L3/L4

            // Race-safe next-code allocation: find the smallest unused suffix
            // under the parent (fills gaps first — the parent may have holes
            // from deletes or renames), INSERT, retry on unique-violation.
            //
            // Prior behaviour used MAX(GLCode)+1, which had two failure modes:
            //   1. Race: two concurrent admins read the same MAX and both
            //      INSERTed the same code — resolved earlier by the unique
            //      index UX_GLChartOFAccount_GLCode (migration 059).
            //   2. Overflow: when the last used suffix was 999, MAX+1 became
            //      1000 and padStart(3) left it 4-wide, so the code became
            //      e.g. 2010021000 (10 chars) instead of erroring. Owner
            //      report 2026-07-01. Now we scan for gaps and refuse
            //      overflow explicitly.
            let nextCode = '';
            let created = false;
            for (let attempt = 0; attempt < 20 && !created; attempt++) {
                if (level === 1) {
                    nextCode = ClassRoot.toString();
                } else {
                    const gapRes = await transaction.request()
                        .input('parent', sql.NVarChar(50), ParentCode)
                        .input('level', sql.Int, level)
                        .input('padLen', sql.Int, lastPartLength)
                        .input('cap', sql.Int, suffixCap)
                        .input('skip', sql.Int, attempt)
                        .query(`
                            SELECT v.number AS FreeSuffix
                            FROM master.dbo.spt_values v
                            WHERE v.type = 'P'
                              AND v.number BETWEEN 1 AND @cap - 1
                              AND NOT EXISTS (
                                SELECT 1 FROM GLChartOFAccount c
                                WHERE c.GLLevel = @level
                                  AND c.GLCode = @parent + RIGHT(REPLICATE('0', @padLen) + CAST(v.number AS VARCHAR(4)), @padLen)
                              )
                            ORDER BY v.number
                            OFFSET @skip ROWS FETCH NEXT 1 ROWS ONLY`);
                    if (!gapRes.recordset.length) {
                        throw new Error(`Parent ${ParentCode} is full — no free sub-codes under ${suffixCap}. Create a new parent instead.`);
                    }
                    const suffix = gapRes.recordset[0].FreeSuffix;
                    nextCode = ParentCode + suffix.toString().padStart(lastPartLength, '0');
                }

                try {
                    await transaction.request()
                        .input('GLTitle', sql.NVarChar(200), GLTitle)
                        .input('GLCode', sql.NVarChar(50), nextCode)
                        .input('GLLevel', sql.Int, level)
                        .input('GLNature', sql.TinyInt, GLNature === 'Debit' ? 1 : 2)
                        .input('GLType', sql.Int, 0)
                        .input('isParent', sql.Int, isParent ? 1 : 0)
                        .input('Companyid', sql.Int, 1)
                        .input('Status', sql.Bit, 1)
                        .input('AccountLevelOne', sql.NVarChar(50), '01')
                        .input('ReadOnly', sql.Bit, 0)
                        .query(`INSERT INTO GLChartOFAccount (GLTitle, GLCode, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
                                VALUES (@GLTitle, @GLCode, @GLLevel, @GLNature, @GLType, @isParent, @Companyid, @Status, @AccountLevelOne, @ReadOnly)`);
                    created = true;
                } catch (insErr) {
                    // 2601 = unique-index violation, 2627 = PK/UNIQUE-constraint violation
                    if (insErr.number !== 2601 && insErr.number !== 2627) throw insErr;
                    if (level === 1) throw insErr; // class roots can't retry — pick a different ClassRoot
                }
            }
            if (!created) throw new Error(`Could not allocate a free GLCode under ${ParentCode} after 20 attempts.`);

            await transaction.commit();
            res.status(201).json({ message: 'Account Created', code: nextCode });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        res.status(400).json({ error: 'Database Error', details: err.message });
    }
};

/**
 * PATCH /api/accounts/coa/:glcaid/title
 * Rename an existing account. Only touches GLTitle — everything else (code,
 * level, hierarchy, GLNature, isParent, ReadOnly) is immutable through this
 * endpoint. Ledger references key off GLCAID, not GLTitle, so renaming is
 * safe and doesn't affect balances or postings.
 * Owner request 2026-07-02.
 */
exports.renameAccount = async (req, res) => {
    try {
        const glcaid = parseInt(req.params.glcaid);
        if (!glcaid) return res.status(400).json({ error: 'Valid GLCAID required.' });
        const title = String(req.body?.GLTitle || '').trim();
        if (!title) return res.status(400).json({ error: 'GLTitle is required.' });
        if (title.length > 200) return res.status(400).json({ error: 'GLTitle must be 200 characters or less.' });

        const pool = await getPool();
        // Refuse to touch a ReadOnly=1 system-seeded account — e.g. class roots.
        const acc = await pool.request()
            .input('id', sql.Int, glcaid)
            .query('SELECT GLCAID, GLCode, GLTitle, ReadOnly FROM GLChartOFAccount WHERE GLCAID=@id');
        if (!acc.recordset.length) return res.status(404).json({ error: 'Account not found.' });
        if (acc.recordset[0].ReadOnly === 1) {
            return res.status(423).json({ error: `${acc.recordset[0].GLCode} ${acc.recordset[0].GLTitle} is read-only and cannot be renamed.` });
        }

        await pool.request()
            .input('id',  sql.Int, glcaid)
            .input('ttl', sql.NVarChar(200), title)
            .query('UPDATE GLChartOFAccount SET GLTitle=@ttl WHERE GLCAID=@id');

        res.json({ message: 'Account renamed', GLCAID: glcaid, GLCode: acc.recordset[0].GLCode, GLTitle: title });
    } catch (err) {
        console.error('renameAccount:', err);
        res.status(400).json({ error: 'Database Error', details: err.message });
    }
};

exports.getCOA = async (req, res) => {
    try {
        const { level, parentCode, search } = req.query;
        const pool = await getPool();
        const request = pool.request();

        let query = `SELECT c.GLCAID, c.GLCode, c.GLTitle, c.GLLevel,
                     CASE WHEN c.GLNature = 1 THEN 'Debit' ELSE 'Credit' END as GLNature,
                     c.isParent,
                     CASE WHEN b.GLCAID IS NOT NULL AND b.IsActive = 1 THEN 1 ELSE 0 END AS IsBank
                     FROM GLChartOFAccount c
                     LEFT JOIN dms_BankAccounts b ON c.GLCAID = b.GLCAID`;
        const conditions = [];

        if (level) {
            const lvl = parseInt(level);
            if (req.query.below) {
                request.input('level', sql.Int, lvl);
                conditions.push('c.GLLevel < @level');
            } else {
                request.input('level', sql.Int, lvl);
                conditions.push('c.GLLevel = @level');
            }
        }

        if (parentCode) {
            request.input('parentLike', sql.NVarChar(100), `${parentCode}%`);
            request.input('parentCode', sql.NVarChar(100), parentCode);
            conditions.push('c.GLCode LIKE @parentLike');
            conditions.push('c.GLCode <> @parentCode');
        }

        if (search) {
            request.input('search', sql.NVarChar(200), `%${search}%`);
            conditions.push('(c.GLTitle LIKE @search OR c.GLCode LIKE @search)');
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY c.GLCode';

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error', details: err.message });
    }
};

// Bank accounts — admin marks specific COA entries as banks for payment selection
exports.getBanks = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT b.GLCAID, c.GLCode, c.GLTitle, b.IsActive
            FROM dms_BankAccounts b
            JOIN GLChartOFAccount c ON b.GLCAID = c.GLCAID
            WHERE b.IsActive = 1
            ORDER BY c.GLCode`);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Full list of marked banks including their per-bank POS commission % and bank charges account.
// Used by /accounting/bank-accounts page (config) — distinct from getBanks which only returns active banks for dropdowns.
exports.getBankConfigs = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT b.GLCAID, c.GLCode AS BankGLCode, c.GLTitle AS BankGLTitle,
                   b.IsActive, b.POSCommissionPct, b.BankChargesGLCAID,
                   bc.GLCode AS BankChargesGLCode, bc.GLTitle AS BankChargesGLTitle
            FROM dms_BankAccounts b
            JOIN GLChartOFAccount c ON b.GLCAID = c.GLCAID
            LEFT JOIN GLChartOFAccount bc ON b.BankChargesGLCAID = bc.GLCAID
            ORDER BY c.GLCode`);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PATCH /accounts/banks/:glcaid/config — updates POSCommissionPct and/or BankChargesGLCAID.
exports.updateBankConfig = async (req, res) => {
    try {
        const glcaid = parseInt(req.params.glcaid);
        const { POSCommissionPct, BankChargesGLCAID } = req.body;

        if (POSCommissionPct !== undefined && POSCommissionPct !== null) {
            const v = parseFloat(POSCommissionPct);
            if (isNaN(v) || v < 0 || v > 100) {
                return res.status(400).json({ error: 'POSCommissionPct must be between 0 and 100.' });
            }
        }
        const pool = await getPool();
        // Make sure the row exists
        const exists = await pool.request().input('id', sql.Int, glcaid)
            .query('SELECT GLCAID FROM dms_BankAccounts WHERE GLCAID=@id');
        if (!exists.recordset.length) {
            return res.status(404).json({ error: 'Bank account not configured. Mark the account as a bank first.' });
        }
        await pool.request()
            .input('id', sql.Int, glcaid)
            .input('pct', sql.Decimal(5, 2), POSCommissionPct ?? null)
            .input('chgId', sql.Int, BankChargesGLCAID ?? null)
            .query(`UPDATE dms_BankAccounts
                    SET POSCommissionPct = @pct, BankChargesGLCAID = @chgId
                    WHERE GLCAID = @id`);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.toggleBank = async (req, res) => {
    try {
        const pool = await getPool();
        const glcaid = parseInt(req.params.glcaid);
        const exists = await pool.request()
            .input('id', sql.Int, glcaid)
            .query('SELECT IsActive FROM dms_BankAccounts WHERE GLCAID=@id');
        if (exists.recordset.length === 0) {
            await pool.request()
                .input('id', sql.Int, glcaid)
                .query('INSERT INTO dms_BankAccounts (GLCAID, IsActive) VALUES (@id, 1)');
            res.json({ isBank: true });
        } else {
            const newVal = exists.recordset[0].IsActive ? 0 : 1;
            await pool.request()
                .input('id', sql.Int, glcaid)
                .input('val', sql.Bit, newVal)
                .query('UPDATE dms_BankAccounts SET IsActive=@val WHERE GLCAID=@id');
            res.json({ isBank: !!newVal });
        }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getVoucherTypes = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query('SELECT Voucherid as VoucherTypeID, Title as VoucherTypeCode, Description as VoucherTypeName FROM GLVoucherType');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
};

// GET /accounts/vouchers/:id — single voucher header + lines (for view-mode after save / from audit trail)
exports.getVoucher = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const hdr = await pool.request().input('id', sql.Int, id).query(`
            SELECT v.*, vt.Title AS VoucherTypeCode, vt.Description AS VoucherTypeName,
                   dept.DepartmentName
            FROM data_FinanceVoucherInfo v
            JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
            LEFT JOIN gen_DepartmentInfo dept ON dept.DepartmentID = v.DepartmentID
            WHERE v.VoucherID = @id
        `);
        if (!hdr.recordset.length) return res.status(404).json({ error: 'Voucher not found' });

        const lines = await pool.request().input('id', sql.Int, id).query(`
            SELECT d.*, c.GLCode, c.GLTitle
            FROM data_FinanceVoucherDetail d
            JOIN GLChartOFAccount c ON d.GLCAID = c.GLCAID
            WHERE d.VoucherID = @id
            ORDER BY d.VoucherDetailID
        `);
        // Reflect the current state of the manual charity flag so the edit
        // form re-hydrates the checkbox correctly (owner ask 2026-07-18).
        const charity = await pool.request().input('id', sql.Int, id).query(`
            SELECT TOP 1 1 AS Flag FROM dms_CharityTracking
            WHERE VoucherID = @id AND SourceType = 'MANUAL_VOUCHER_1PCT'
        `);
        res.json({
            ...hdr.recordset[0],
            lines: lines.recordset,
            IsCharitable: charity.recordset.length > 0,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /accounts/vouchers/drafts — list of all Draft vouchers (for pickup / finalize later)
exports.getDraftVouchers = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, v.TotalAmount, v.Remarks,
                   v.CreatedByName, vt.Title AS VoucherTypeCode
            FROM data_FinanceVoucherInfo v
            JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
            WHERE v.Status = 'Draft'
            ORDER BY v.VoucherID DESC
        `);
        res.json(r.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /accounts/vouchers/search
 *   ?type=CPV|CRV|BPV|BRV|JV|SI|SS|PV|PRV|SSR  (multi via comma)
 *   &status=Draft|Posted|Reversed
 *   &from=YYYY-MM-DD &to=YYYY-MM-DD
 *   &partyId=...
 *   &minAmount &maxAmount
 *   &q=free-text (matches VoucherNo / Remarks / line Narration)
 *   &limit=50 &offset=0
 *
 * Returns paginated voucher headers with a `LineSnippet` field for hits in line narration.
 */
exports.searchVouchers = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        const types = (req.query.type || '').split(',').filter(Boolean);
        const status = req.query.status;
        const partyId = req.query.partyId ? parseInt(req.query.partyId) : null;
        const createdById = req.query.createdById ? parseInt(req.query.createdById) : null;
        const minAmt = req.query.minAmount ? parseFloat(req.query.minAmount) : null;
        const maxAmt = req.query.maxAmount ? parseFloat(req.query.maxAmount) : null;
        const fromD = req.query.from ? new Date(req.query.from) : null;
        const toD = req.query.to ? new Date(req.query.to) : null;
        if (toD) toD.setHours(23, 59, 59, 999);
        const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
        const offset = parseInt(req.query.offset) || 0;

        const pool = await getPool();
        const r = pool.request();
        const where = [];

        if (types.length) {
            const placeholders = types.map((_, i) => `@t${i}`).join(',');
            types.forEach((t, i) => r.input(`t${i}`, sql.NVarChar(20), t));
            where.push(`vt.Title IN (${placeholders})`);
        }
        if (status)  { r.input('st', sql.NVarChar(20), status);     where.push(`v.Status = @st`); }
        if (fromD)   { r.input('fr', sql.DateTime,    fromD);       where.push(`v.VoucherDate >= @fr`); }
        if (toD)     { r.input('to', sql.DateTime,    toD);         where.push(`v.VoucherDate <= @to`); }
        if (minAmt !== null) { r.input('mna', sql.Decimal(18,2), minAmt); where.push(`v.TotalAmount >= @mna`); }
        if (maxAmt !== null) { r.input('mxa', sql.Decimal(18,2), maxAmt); where.push(`v.TotalAmount <= @mxa`); }
        if (partyId) {
            r.input('pid', sql.Int, partyId);
            where.push(`EXISTS (SELECT 1 FROM data_FinanceVoucherDetail d2 WHERE d2.VoucherID = v.VoucherID AND d2.PartyID = @pid)`);
        }
        if (createdById) {
            r.input('cby', sql.Int, createdById);
            where.push(`v.CreatedBy = @cby`);
        }
        if (q) {
            r.input('q', sql.NVarChar(200), `%${q}%`);
            where.push(`(v.VoucherNo LIKE @q OR v.Remarks LIKE @q OR
                         EXISTS (SELECT 1 FROM data_FinanceVoucherDetail d3
                                 WHERE d3.VoucherID = v.VoucherID AND d3.Narration LIKE @q))`);
        }
        const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const countRes = await r.query(`SELECT COUNT(*) AS Total
            FROM data_FinanceVoucherInfo v
            JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
            ${whereSQL}`);
        const total = countRes.recordset[0].Total;

        // Reuse the same request for the page query, just add OFFSET/FETCH inline
        const rows = await r.query(`
            SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, vt.Title AS VoucherType,
                   v.Status, v.TotalAmount, v.Remarks,
                   v.SourceDocType, v.SourceDocID, v.CreatedByName, v.PostedAt,
                   ${q ? `(SELECT TOP 1 d4.Narration FROM data_FinanceVoucherDetail d4
                             WHERE d4.VoucherID = v.VoucherID AND d4.Narration LIKE @q) AS LineSnippet`
                       : 'CAST(NULL AS NVARCHAR(MAX)) AS LineSnippet'}
            FROM data_FinanceVoucherInfo v
            JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
            ${whereSQL}
            ORDER BY v.VoucherDate DESC, v.VoucherID DESC
            OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`);

        res.json({ total, limit, offset, rows: rows.recordset });
    } catch (err) {
        console.error('searchVouchers:', err);
        res.status(500).json({ error: err.message });
    }
};

// PUT /accounts/vouchers/:id — update a Draft voucher (header + lines). Rejects non-Draft.
// PATCH /api/vouchers/:id/date — change ONLY the VoucherDate on a posted
// JV. Opening balances / prior-period adjustments / accruals live in JVs
// and legitimately need a non-today date; owner ask 2026-07-07. The
// today-only policy still applies to CPV/CRV/BPV/BRV (physical cash/bank
// movement) and to fresh voucher creation. Lines are NOT touched.
exports.updateVoucherDate = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { VoucherDate } = req.body;
        if (!VoucherDate) return res.status(400).json({ error: 'VoucherDate is required.' });
        const d = new Date(VoucherDate);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'Voucher date is invalid.' });

        const pool = await getPool();
        const head = await pool.request().input('id', sql.Int, id)
            .query(`SELECT v.VoucherID, v.Status, v.ReversesVoucherID, v.VoucherDate, t.Title AS VoucherType
                    FROM   data_FinanceVoucherInfo v
                    JOIN   GLVoucherType t ON v.VoucherTypeID = t.Voucherid
                    WHERE  v.VoucherID = @id`);
        if (!head.recordset.length) return res.status(404).json({ error: 'Voucher not found.' });
        const row = head.recordset[0];
        if (row.ReversesVoucherID) {
            return res.status(400).json({ error: 'Cannot change the date on a reversing voucher.' });
        }
        if (row.Status !== 'Posted' && row.Status !== 'Draft') {
            return res.status(400).json({ error: `Voucher is in status "${row.Status}" and cannot be edited.` });
        }

        const isJV = row.VoucherType === 'JV';
        if (!isJV) {
            // CPV/CRV/BPV/BRV are gated behind finance_voucher_backdate and
            // must sit inside the last 5 days (both original + new).
            if (!userHasBackdatePermission(req)) {
                return res.status(403).json({ error: `Editing ${row.VoucherType} dates requires the "Edit posted CPV/CRV/BPV/BRV" permission.` });
            }
            const originalErr = checkVoucherDateWithinBackdateWindow(row.VoucherDate);
            if (originalErr) return res.status(409).json({ error: `This voucher was posted ${originalErr.replace(/^Edit is only allowed for vouchers /, '')}. Reverse it if a correction is needed.` });
            const newErr = checkVoucherDateWithinBackdateWindow(d);
            if (newErr) return res.status(400).json({ error: newErr });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .input('dt', sql.DateTime, d)
            .query(`UPDATE data_FinanceVoucherInfo SET VoucherDate = @dt WHERE VoucherID = @id`);
        res.json({ message: 'Voucher date updated', VoucherID: id });
    } catch (err) {
        console.error('updateVoucherDate:', err);
        res.status(500).json({ error: err.message });
    }
};

// PATCH /accounts/vouchers/:id/department — tag which HR department this
// CPV/BPV/JV's expense belongs to. Reporting-only metadata: no GL impact,
// no Status restriction (works on Draft, Posted, even Reversed vouchers),
// so this doubles as the fix-up tool for historical vouchers posted before
// department tagging existed. Owner ask 2026-08-01.
exports.updateVoucherDepartment = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const deptId = Number(req.body.DepartmentID) || null;
        const pool = await getPool();

        const head = await pool.request().input('id', sql.Int, id)
            .query(`SELECT VoucherID FROM data_FinanceVoucherInfo WHERE VoucherID = @id`);
        if (!head.recordset.length) return res.status(404).json({ error: 'Voucher not found.' });

        if (deptId !== null) {
            const dept = await pool.request().input('d', sql.Int, deptId)
                .query(`SELECT DepartmentID FROM gen_DepartmentInfo WHERE DepartmentID = @d`);
            if (!dept.recordset.length) return res.status(400).json({ error: 'Unknown department.' });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .input('dep', sql.Int, deptId)
            .query(`UPDATE data_FinanceVoucherInfo SET DepartmentID = @dep WHERE VoucherID = @id`);
        res.json({ message: 'Department updated', VoucherID: id, DepartmentID: deptId });
    } catch (err) {
        console.error('updateVoucherDepartment:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /accounts/vouchers/needs-department — posted CPV/BPV/JV vouchers with
// no department tagged yet, for the bulk segregation workspace. By default
// hides vouchers that already touch a Parts (502003xxx) or Sales (502004xxx)
// GL account -- those are self-evidently Parts/Sales department expenses
// already, going by the same COA-prefix classification the P&L by
// Department report uses (see PNL_DEPARTMENTS in reportsController.js).
// Pass ?all=1 to see everything, untagged included.
// Owner ask 2026-08-01: "create me form of those who are not hitting sale
// or parts so I can segregate them".
exports.getVouchersNeedingDepartment = async (req, res) => {
    try {
        const includeAll = req.query.all === '1';
        const limit  = Math.min(parseInt(req.query.limit)  || 100, 300);
        const offset = parseInt(req.query.offset) || 0;

        const pool = await getPool();
        const r = pool.request().input('includeAll', sql.Bit, includeAll ? 1 : 0);

        const countRes = await r.query(`
            SELECT COUNT(*) AS Total
            FROM data_FinanceVoucherInfo v
            JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
            WHERE vt.Title IN ('CPV','BPV','JV')
              AND v.Status = 'Posted'
              AND v.DepartmentID IS NULL
              AND (@includeAll = 1 OR NOT EXISTS (
                    SELECT 1 FROM data_FinanceVoucherDetail d
                    JOIN GLChartOFAccount c ON c.GLCAID = d.GLCAID
                    WHERE d.VoucherID = v.VoucherID
                      AND (c.GLCode LIKE '502003%' OR c.GLCode LIKE '502004%')
              ))`);
        const total = countRes.recordset[0].Total;

        const rows = await r.query(`
            SELECT v.VoucherID, v.VoucherNo, vt.Title AS VoucherTypeCode,
                   v.VoucherDate, v.TotalAmount, v.Remarks,
                   STUFF((
                       SELECT DISTINCT ', ' + c2.GLTitle
                       FROM data_FinanceVoucherDetail d2
                       JOIN GLChartOFAccount c2 ON c2.GLCAID = d2.GLCAID
                       WHERE d2.VoucherID = v.VoucherID AND d2.Debit > 0
                       FOR XML PATH('')
                   ), 1, 2, '') AS AccountsTouched
            FROM data_FinanceVoucherInfo v
            JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
            WHERE vt.Title IN ('CPV','BPV','JV')
              AND v.Status = 'Posted'
              AND v.DepartmentID IS NULL
              AND (@includeAll = 1 OR NOT EXISTS (
                    SELECT 1 FROM data_FinanceVoucherDetail d3
                    JOIN GLChartOFAccount c3 ON c3.GLCAID = d3.GLCAID
                    WHERE d3.VoucherID = v.VoucherID
                      AND (c3.GLCode LIKE '502003%' OR c3.GLCode LIKE '502004%')
              ))
            ORDER BY v.VoucherDate DESC, v.VoucherID DESC
            OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`);

        res.json({ total, limit, offset, rows: rows.recordset });
    } catch (err) {
        console.error('getVouchersNeedingDepartment:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateVoucher = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { VoucherDate, VoucherTypeID, Remarks, Items, IsCharitable, DepartmentID } = req.body;
        if (!Array.isArray(Items) || Items.length === 0)
            return res.status(400).json({ error: 'Voucher must have at least one line.' });
        const badIdx = Items.findIndex(it => !it.GLCAID);
        if (badIdx >= 0)
            return res.status(400).json({ error: `Line ${badIdx + 1} is missing an account.` });

        const totalAmount = Items.reduce((s, i) => s + parseFloat(i.Debit || 0), 0);
        const totalCredit = Items.reduce((s, i) => s + parseFloat(i.Credit || 0), 0);
        if (Math.abs(totalAmount - totalCredit) > 0.01)
            return res.status(400).json({ error: 'Debits and credits must balance.' });

        const pool = await getPool();
        // Load current voucher header + type + date so we can decide what
        // edits are allowed. JVs (opening balances, prior-period adjustments,
        // reclassifications) can be edited in Draft OR Posted state and
        // may carry any date. Other types (CPV/CRV/BPV/BRV) are Draft +
        // today-only by default, but a user holding the workflow permission
        // `finance_voucher_backdate` can edit them in Posted state provided
        // BOTH the original and the incoming date are within a 5-day window
        // (owner ask 2026-07-18 — cashier corrections).
        const check = await pool.request().input('id', sql.Int, id)
            .query(`SELECT v.Status, v.ReversesVoucherID, v.VoucherDate, t.Title AS VoucherType
                    FROM   data_FinanceVoucherInfo v
                    JOIN   GLVoucherType t ON v.VoucherTypeID = t.Voucherid
                    WHERE  v.VoucherID = @id`);
        if (!check.recordset.length) return res.status(404).json({ error: 'Voucher not found.' });
        const row = check.recordset[0];
        const isJV = row.VoucherType === 'JV';
        // Charity Yes/No is mandatory ONLY on CRV/BRV — owner ask 2026-07-18 v2.
        const isCharityScoped = row.VoucherType === 'CRV' || row.VoucherType === 'BRV';
        if (isCharityScoped && typeof IsCharitable !== 'boolean') {
            return res.status(400).json({
                error: `${row.VoucherType} vouchers require an explicit charity Yes/No before saving.`,
            });
        }
        if (row.ReversesVoucherID) {
            return res.status(400).json({ error: 'Cannot edit a reversing voucher — reverse the reversal instead.' });
        }
        if (row.Status === 'Reversed') {
            return res.status(409).json({ error: 'Voucher is already Reversed and cannot be edited.' });
        }

        const hasBackdate = userHasBackdatePermission(req);
        const isBackdateEdit = !isJV && row.Status === 'Posted' && hasBackdate;
        if (isBackdateEdit) {
            // Original voucher must itself sit inside the window.
            const originalErr = checkVoucherDateWithinBackdateWindow(row.VoucherDate);
            if (originalErr) {
                return res.status(409).json({ error: `This voucher was posted ${originalErr.replace(/^Edit is only allowed for vouchers /, '')}. Reverse it if a correction is needed.` });
            }
            // New date must also be within the window.
            const newErr = checkVoucherDateWithinBackdateWindow(VoucherDate);
            if (newErr) return res.status(400).json({ error: newErr });
        } else if (!isJV && row.Status !== 'Draft') {
            return res.status(409).json({ error: `Only Draft vouchers can be edited for this type. Current status: ${row.Status}. JV vouchers can be edited in Posted state; other types must be reversed and re-entered.` });
        } else if (!isJV) {
            // Draft CPV/CRV/BPV/BRV — still restrict to today.
            const dateErr = checkVoucherDateIsToday(VoucherDate);
            if (dateErr) return res.status(400).json({ error: dateErr });
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            await new sql.Request(transaction).input('id', sql.Int, id)
                .query(`DELETE FROM data_FinanceVoucherDetail WHERE VoucherID=@id`);

            await new sql.Request(transaction)
                .input('id',          sql.Int,          id)
                .input('VoucherDate', sql.DateTime,     VoucherDate)
                .input('VTID',        sql.Int,          parseInt(VoucherTypeID))
                .input('Remarks',     sql.NVarChar(sql.MAX), Remarks)
                .input('Total',       sql.Decimal(18,2),     totalAmount)
                .input('DepartmentID', sql.Int, Number(DepartmentID) || null)
                .query(`UPDATE data_FinanceVoucherInfo
                        SET VoucherDate=@VoucherDate, VoucherTypeID=@VTID,
                            Remarks=@Remarks, TotalAmount=@Total, DepartmentID=@DepartmentID
                        WHERE VoucherID=@id`);

            for (const item of Items) {
                await new sql.Request(transaction)
                    .input('VID',  sql.Int,              id)
                    .input('GL',   sql.Int,              item.GLCAID)
                    .input('Nar',  sql.NVarChar(sql.MAX), item.Narration)
                    .input('Dr',   sql.Decimal(18,2),    item.Debit  || 0)
                    .input('Cr',   sql.Decimal(18,2),    item.Credit || 0)
                    .query(`INSERT INTO data_FinanceVoucherDetail
                                (VoucherID, GLCAID, Narration, Debit, Credit)
                            VALUES (@VID, @GL, @Nar, @Dr, @Cr)`);
            }
            await transaction.commit();

            // Charity side ledger reconciliation on edit (owner ask 2026-07-18).
            // Only applies to CRV/BRV; other types skip. On every update we
            // drop any prior manual-source row for this voucher and re-insert
            // one if the box is still Yes. Receive-payment rows are locked to
            // their original CRV and never touched here. Runs OUTSIDE the tx.
            if (isCharityScoped) {
                try {
                    await pool.request()
                        .input('vid', sql.Int, id)
                        .query(`DELETE FROM dms_CharityTracking
                                WHERE VoucherID = @vid AND SourceType = 'MANUAL_VOUCHER_1PCT'`);
                    if (IsCharitable === true && totalAmount > 0) {
                        await pool.request()
                            .input('vid', sql.Int,           id)
                            .input('src', sql.NVarChar(40),  'MANUAL_VOUCHER_1PCT')
                            .input('va',  sql.Decimal(18,2), +totalAmount.toFixed(2))
                            .input('ca',  sql.Decimal(18,2), +(totalAmount * 0.01).toFixed(2))
                            .input('by',  sql.Int,           req.user?.userId || null)
                            .input('byN', sql.NVarChar(100), req.user?.userName || null)
                            .query(`INSERT INTO dms_CharityTracking
                                       (VoucherID, SourceType, VoucherAmount, CharityAmount,
                                        CreatedBy, CreatedByName)
                                    VALUES (@vid, @src, @va, @ca, @by, @byN)`);
                    }
                } catch (e) {
                    console.warn('[charity] voucher-update tracking failed for voucher', id, e.message);
                }
            }

            res.json({ message: 'Voucher updated', VoucherID: id });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('updateVoucher:', err);
        res.status(400).json({ error: err.message });
    }
};

// DELETE /accounts/vouchers/:id — hard delete a Draft voucher (no GL impact to reverse).
exports.deleteVoucher = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const check = await pool.request().input('id', sql.Int, id)
            .query(`SELECT Status FROM data_FinanceVoucherInfo WHERE VoucherID=@id`);
        if (!check.recordset.length) return res.status(404).json({ error: 'Voucher not found.' });
        if (check.recordset[0].Status !== 'Draft')
            return res.status(409).json({ error: `Only Draft vouchers can be deleted. Current status: ${check.recordset[0].Status}. Use Request Unfinalize to reverse a Posted voucher.` });

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            await new sql.Request(transaction).input('id', sql.Int, id)
                .query(`DELETE FROM data_FinanceVoucherDetail WHERE VoucherID=@id`);
            await new sql.Request(transaction).input('id', sql.Int, id)
                .query(`DELETE FROM data_FinanceVoucherInfo WHERE VoucherID=@id`);
            await transaction.commit();
            res.json({ message: 'Draft voucher deleted' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.saveVoucher = async (req, res) => {
    try {
        const { VoucherDate, VoucherTypeID, Remarks, Items, IsCharitable, DepartmentID } = req.body;
        const dateErr = checkVoucherDateIsToday(VoucherDate);
        if (dateErr) return res.status(400).json({ error: dateErr });
        // Defensive guard: every line must have a GLCAID. A blank GLCAID slips through
        // as a NULL into data_FinanceVoucherDetail and the line becomes invisible to
        // every account-scoped report — for CPV/CRV that means the cash leg never
        // shows up in the trial balance / cash ledger.
        if (!Array.isArray(Items) || !Items.length) {
            return res.status(400).json({ error: 'Voucher must have at least one line.' });
        }
        const badIdx = Items.findIndex(it => !it.GLCAID);
        if (badIdx >= 0) {
            return res.status(400).json({ error: `Line ${badIdx + 1} is missing an account.` });
        }
        const totalAmount = Items.reduce((sum, i) => sum + parseFloat(i.Debit || 0), 0);

        const pool = await getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // 1. Get voucher type code (Title column, Voucherid column)
            const typeResult = await new sql.Request(transaction)
                .input('vtId', sql.Int, parseInt(VoucherTypeID))
                .query('SELECT Title AS VoucherTypeCode FROM GLVoucherType WHERE Voucherid = @vtId');

            if (!typeResult.recordset.length) throw new Error('Invalid voucher type.');
            const typeCode = typeResult.recordset[0].VoucherTypeCode;

            // Charity Yes/No is mandatory ONLY on CRV and BRV — owner ask
            // 2026-07-18 v2. Other manual voucher types (CPV/BPV/JV) are
            // unaffected.
            const isCharityScoped = typeCode === 'CRV' || typeCode === 'BRV';
            if (isCharityScoped && typeof IsCharitable !== 'boolean') {
                throw new Error(`${typeCode} vouchers require an explicit charity Yes/No before saving.`);
            }

            // 2. Generate sequential voucher number from the per-type sequence
            // (migration 062). Old behaviour used MAX(VoucherID)+1, which mixed
            // every type's counter into one and inflated even faster than the
            // old shared seq_FinanceVoucherNo.
            const voucherNo = await nextVoucherNo(transaction, typeCode);

            // 3. Insert voucher header as Draft (no GL impact yet — finalize flips it to Posted)
            const infoResult = await new sql.Request(transaction)
                .input('VoucherDate', sql.DateTime, VoucherDate)
                .input('VoucherNo', sql.NVarChar(50), voucherNo)
                .input('VoucherTypeID', sql.Int, parseInt(VoucherTypeID))
                .input('Remarks', sql.NVarChar(sql.MAX), Remarks)
                .input('TotalAmount', sql.Decimal(18,2), totalAmount)
                .input('CreatedBy', sql.Int, req.user?.userId || null)
                .input('CreatedByName', sql.NVarChar(100), req.user?.userName || null)
                .input('DepartmentID', sql.Int, Number(DepartmentID) || null)
                .query(`INSERT INTO data_FinanceVoucherInfo
                            (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                             Status, Posted, CreatedBy, CreatedByName, DepartmentID)
                        OUTPUT INSERTED.VoucherID
                        VALUES (@VoucherDate, @VoucherNo, @VoucherTypeID, @Remarks, @TotalAmount,
                                'Draft', 0, @CreatedBy, @CreatedByName, @DepartmentID)`);

            const voucherID = infoResult.recordset[0].VoucherID;

            // 4. Insert each detail line with its own request to avoid parameter reuse
            for (const item of Items) {
                await new sql.Request(transaction)
                    .input('VoucherID', sql.Int, voucherID)
                    .input('GLCAID', sql.Int, item.GLCAID)
                    .input('Narration', sql.NVarChar(sql.MAX), item.Narration)
                    .input('Debit', sql.Decimal(18,2), item.Debit || 0)
                    .input('Credit', sql.Decimal(18,2), item.Credit || 0)
                    .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                            VALUES (@VoucherID, @GLCAID, @Narration, @Debit, @Credit)`);
            }

            await transaction.commit();

            // Charity side ledger — owner ask 2026-07-18. Scoped to CRV/BRV
            // only. When the operator ticks Yes, record 1% of the voucher
            // total. Runs OUTSIDE the tx — a charity-side failure must never
            // block a valid voucher save. Purely a side ledger.
            if (isCharityScoped && IsCharitable === true && totalAmount > 0) {
                try {
                    await pool.request()
                        .input('vid', sql.Int,           voucherID)
                        .input('src', sql.NVarChar(40),  'MANUAL_VOUCHER_1PCT')
                        .input('va',  sql.Decimal(18,2), +totalAmount.toFixed(2))
                        .input('ca',  sql.Decimal(18,2), +(totalAmount * 0.01).toFixed(2))
                        .input('by',  sql.Int,           req.user?.userId || null)
                        .input('byN', sql.NVarChar(100), req.user?.userName || null)
                        .query(`INSERT INTO dms_CharityTracking
                                   (VoucherID, SourceType, VoucherAmount, CharityAmount,
                                    CreatedBy, CreatedByName)
                                VALUES (@vid, @src, @va, @ca, @by, @byN)`);
                } catch (e) {
                    console.warn('[charity] voucher-save tracking failed for voucher', voucherID, e.message);
                }
            }

            res.status(201).json({ message: 'Voucher Saved', VoucherID: voucherID, VoucherNo: voucherNo, Status: 'Draft' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Database Error', details: err.message });
    }
};
