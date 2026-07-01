const { sql, getPool } = require('../config/db');

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
            SELECT v.*, vt.Title AS VoucherTypeCode, vt.Description AS VoucherTypeName
            FROM data_FinanceVoucherInfo v
            JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
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
        res.json({ ...hdr.recordset[0], lines: lines.recordset });
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
exports.updateVoucher = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { VoucherDate, VoucherTypeID, Remarks, Items } = req.body;
        const dateErr = checkVoucherDateIsToday(VoucherDate);
        if (dateErr) return res.status(400).json({ error: dateErr });
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
        // Reject if not a Draft
        const check = await pool.request().input('id', sql.Int, id)
            .query(`SELECT Status FROM data_FinanceVoucherInfo WHERE VoucherID=@id`);
        if (!check.recordset.length) return res.status(404).json({ error: 'Voucher not found.' });
        if (check.recordset[0].Status !== 'Draft')
            return res.status(409).json({ error: `Only Draft vouchers can be edited. Current status: ${check.recordset[0].Status}.` });

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
                .query(`UPDATE data_FinanceVoucherInfo
                        SET VoucherDate=@VoucherDate, VoucherTypeID=@VTID,
                            Remarks=@Remarks, TotalAmount=@Total
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
        const { VoucherDate, VoucherTypeID, Remarks, Items } = req.body;
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

            // 2. Generate sequential voucher number
            const countResult = await new sql.Request(transaction)
                .query('SELECT ISNULL(MAX(VoucherID), 0) + 1 AS NextNo FROM data_FinanceVoucherInfo');
            const voucherNo = `${typeCode}-${countResult.recordset[0].NextNo}`;

            // 3. Insert voucher header as Draft (no GL impact yet — finalize flips it to Posted)
            const infoResult = await new sql.Request(transaction)
                .input('VoucherDate', sql.DateTime, VoucherDate)
                .input('VoucherNo', sql.NVarChar(50), voucherNo)
                .input('VoucherTypeID', sql.Int, parseInt(VoucherTypeID))
                .input('Remarks', sql.NVarChar(sql.MAX), Remarks)
                .input('TotalAmount', sql.Decimal(18,2), totalAmount)
                .input('CreatedBy', sql.Int, req.user?.userId || null)
                .input('CreatedByName', sql.NVarChar(100), req.user?.userName || null)
                .query(`INSERT INTO data_FinanceVoucherInfo
                            (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                             Status, Posted, CreatedBy, CreatedByName)
                        OUTPUT INSERTED.VoucherID
                        VALUES (@VoucherDate, @VoucherNo, @VoucherTypeID, @Remarks, @TotalAmount,
                                'Draft', 0, @CreatedBy, @CreatedByName)`);

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
