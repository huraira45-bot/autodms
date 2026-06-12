const { sql, getPool } = require('../config/db');
const { resolveRole } = require('./systemAccountsController');

// GET /api/pos-settlement/pending
// Returns every POS Clearing Dr line (from Job Card / Store Sale / Receive Payment vouchers)
// minus any prior settlement Cr lines that point at the same source voucher via AllocatedToVoucherID.
exports.getPending = async (req, res) => {
    try {
        const posGL = await resolveRole('POS_CLEARING');
        const pool = await getPool();
        const result = await pool.request()
            .input('gl', sql.Int, posGL)
            .query(`
                WITH PosDebits AS (
                    SELECT vi.VoucherID, vi.VoucherNo, vi.VoucherDate, vi.SourceDocType, vi.SourceDocID,
                           vi.TotalAmount, SUM(vd.Debit) AS DebitAmount,
                           -- pull a human-readable doc reference if available
                           COALESCE(
                               (SELECT JobCardNo FROM Addata_JobCardInfo WHERE JobCardId = vi.SourceDocID AND vi.SourceDocType = 'JOBCARD'),
                               (SELECT InvoiceNo FROM data_StoreSaleInfo WHERE SaleID = vi.SourceDocID AND vi.SourceDocType = 'STORE_SALE'),
                               vi.VoucherNo
                           ) AS SourceRef
                    FROM data_FinanceVoucherDetail vd
                    INNER JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
                    WHERE vd.GLCAID = @gl
                      AND vd.Debit > 0
                      AND vi.Status = 'Posted'
                      AND vi.ReversesVoucherID IS NULL
                    GROUP BY vi.VoucherID, vi.VoucherNo, vi.VoucherDate, vi.SourceDocType, vi.SourceDocID, vi.TotalAmount
                ),
                PosCredits AS (
                    -- Cr POS Clearing lines that already settled a source voucher
                    SELECT vd.AllocatedToVoucherID, SUM(vd.Credit) AS SettledAmount
                    FROM data_FinanceVoucherDetail vd
                    INNER JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
                    WHERE vd.GLCAID = @gl
                      AND vd.Credit > 0
                      AND vd.AllocatedToVoucherID IS NOT NULL
                      AND vi.Status = 'Posted'
                      AND vi.ReversesVoucherID IS NULL
                    GROUP BY vd.AllocatedToVoucherID
                )
                SELECT pd.VoucherID, pd.VoucherNo, pd.SourceRef, pd.VoucherDate,
                       pd.SourceDocType,
                       pd.DebitAmount, ISNULL(pc.SettledAmount, 0) AS SettledAmount,
                       pd.DebitAmount - ISNULL(pc.SettledAmount, 0) AS PendingAmount,
                       DATEDIFF(day, pd.VoucherDate, GETDATE()) AS AgeDays
                FROM PosDebits pd
                LEFT JOIN PosCredits pc ON pc.AllocatedToVoucherID = pd.VoucherID
                WHERE pd.DebitAmount - ISNULL(pc.SettledAmount, 0) > 0.005
                ORDER BY pd.VoucherDate ASC
            `);
        res.json({ pending: result.recordset });
    } catch (err) {
        console.error('getPending POS error:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/pos-settlement
// body: {
//   bankGLCAID,                                    -- target bank account (must be in dms_BankAccounts)
//   voucherIDs: [vid, vid, ...],                   -- which pending POS receipts to settle
//   commissionAmount,                              -- explicit commission (PKR) — user can override the bank's default
//   netDepositAmount,                              -- explicit net deposit (PKR) — user can override (e.g. bank deposited less)
//   narration,
// }
exports.postSettlement = async (req, res) => {
    try {
        const { bankGLCAID, voucherIDs, commissionAmount, netDepositAmount, narration } = req.body;
        if (!bankGLCAID) return res.status(400).json({ error: 'Bank account is required.' });
        if (!Array.isArray(voucherIDs) || voucherIDs.length === 0) {
            return res.status(400).json({ error: 'Pick at least one POS receipt to settle.' });
        }

        const pool = await getPool();

        // Validate bank is marked + has charges account
        const bankRes = await pool.request()
            .input('id', sql.Int, parseInt(bankGLCAID))
            .query(`SELECT b.GLCAID, b.POSCommissionPct, b.BankChargesGLCAID, c.GLTitle
                    FROM dms_BankAccounts b
                    INNER JOIN GLChartOFAccount c ON c.GLCAID = b.GLCAID
                    WHERE b.GLCAID=@id AND b.IsActive=1`);
        if (!bankRes.recordset.length) return res.status(400).json({ error: 'Bank account not active or not marked as bank.' });
        const bank = bankRes.recordset[0];
        if (!bank.BankChargesGLCAID) {
            return res.status(400).json({ error: 'Bank Charges account is not configured for this bank. Set it in the bank COA configuration.' });
        }

        // Resolve POS Clearing GL
        const posGL = await resolveRole('POS_CLEARING');

        // Load each pending POS receipt's outstanding amount and validate it's still pending
        const idsCsv = voucherIDs.map(v => parseInt(v)).join(',');
        if (!/^\d+(,\d+)*$/.test(idsCsv)) return res.status(400).json({ error: 'Invalid voucherIDs.' });
        const pendingRes = await pool.request()
            .input('gl', sql.Int, posGL)
            .query(`
                WITH PosDebits AS (
                    SELECT vi.VoucherID, SUM(vd.Debit) AS DebitAmount
                    FROM data_FinanceVoucherDetail vd
                    INNER JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
                    WHERE vd.GLCAID = @gl AND vd.Debit > 0
                      AND vi.Status='Posted' AND vi.ReversesVoucherID IS NULL
                      AND vi.VoucherID IN (${idsCsv})
                    GROUP BY vi.VoucherID
                ),
                PosCredits AS (
                    SELECT vd.AllocatedToVoucherID, SUM(vd.Credit) AS SettledAmount
                    FROM data_FinanceVoucherDetail vd
                    INNER JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
                    WHERE vd.GLCAID = @gl AND vd.Credit > 0 AND vd.AllocatedToVoucherID IS NOT NULL
                      AND vi.Status='Posted' AND vi.ReversesVoucherID IS NULL
                      AND vd.AllocatedToVoucherID IN (${idsCsv})
                    GROUP BY vd.AllocatedToVoucherID
                )
                SELECT pd.VoucherID, pd.DebitAmount - ISNULL(pc.SettledAmount, 0) AS PendingAmount
                FROM PosDebits pd
                LEFT JOIN PosCredits pc ON pc.AllocatedToVoucherID = pd.VoucherID`);
        if (pendingRes.recordset.length === 0) return res.status(400).json({ error: 'No matching pending POS receipts found.' });

        const grossTotal = +pendingRes.recordset.reduce((a, r) => a + parseFloat(r.PendingAmount || 0), 0).toFixed(2);
        if (grossTotal <= 0) return res.status(400).json({ error: 'Selected receipts have no pending balance.' });

        // Commission resolution: explicit overrides, else apply bank's POSCommissionPct
        const defaultCommission = +(grossTotal * (parseFloat(bank.POSCommissionPct) || 0) / 100).toFixed(2);
        const commission = (commissionAmount !== undefined && commissionAmount !== null && commissionAmount !== '')
            ? +parseFloat(commissionAmount).toFixed(2)
            : defaultCommission;
        const netDeposit = (netDepositAmount !== undefined && netDepositAmount !== null && netDepositAmount !== '')
            ? +parseFloat(netDepositAmount).toFixed(2)
            : +(grossTotal - commission).toFixed(2);

        if (Math.abs((netDeposit + commission) - grossTotal) > 0.01) {
            return res.status(400).json({ error: `Bank deposit (${netDeposit}) + commission (${commission}) must equal gross POS total (${grossTotal}).` });
        }

        // Pick BRV voucher type
        const vtRes = await pool.request().query("SELECT Voucherid FROM GLVoucherType WHERE Title='BRV'");
        if (!vtRes.recordset.length) return res.status(400).json({ error: 'BRV voucher type not configured.' });
        const voucherTypeId = vtRes.recordset[0].Voucherid;

        // Atomic posting
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            const seqRes = await new sql.Request(transaction).query(
                "SELECT ISNULL(MAX(VoucherID),0) + 1 AS nextNo FROM data_FinanceVoucherInfo"
            );
            const voucherNo = `BRV-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

            const narrationStr = narration || `POS settlement to ${bank.GLTitle} (${pendingRes.recordset.length} receipt${pendingRes.recordset.length === 1 ? '' : 's'})`;

            const hdrRes = await new sql.Request(transaction)
                .input('vd',      sql.DateTime,     new Date())
                .input('vno',     sql.NVarChar(50), voucherNo)
                .input('vtId',    sql.Int,          voucherTypeId)
                .input('remarks', sql.NVarChar(sql.MAX), narrationStr)
                .input('total',   sql.Decimal(18,2), grossTotal)
                .input('src',     sql.NVarChar(20), 'VOUCHER')
                .input('cby',     sql.Int,          req.user?.userId || null)
                .input('cbyN',    sql.NVarChar(100),req.user?.userName || null)
                .query(`INSERT INTO data_FinanceVoucherInfo
                            (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                             Status, Posted, SourceDocType, CreatedBy, CreatedByName)
                        OUTPUT INSERTED.VoucherID
                        VALUES (@vd, @vno, @vtId, @remarks, @total,
                                'Draft', 0, @src, @cby, @cbyN)`);
            const voucherId = hdrRes.recordset[0].VoucherID;

            // Dr Bank
            await new sql.Request(transaction)
                .input('vid', sql.Int, voucherId)
                .input('gl',  sql.Int, bank.GLCAID)
                .input('nar', sql.NVarChar(sql.MAX), `POS settlement deposit — ${voucherNo}`)
                .input('dr',  sql.Decimal(18,2), netDeposit)
                .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @nar, @dr, 0)`);

            // Dr Bank Charges (commission) — only if > 0
            if (commission > 0) {
                await new sql.Request(transaction)
                    .input('vid', sql.Int, voucherId)
                    .input('gl',  sql.Int, bank.BankChargesGLCAID)
                    .input('nar', sql.NVarChar(sql.MAX), `POS commission — ${voucherNo}`)
                    .input('dr',  sql.Decimal(18,2), commission)
                    .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                            VALUES (@vid, @gl, @nar, @dr, 0)`);
            }

            // Cr POS Clearing per source receipt voucher, tagged with AllocatedToVoucherID
            for (const row of pendingRes.recordset) {
                await new sql.Request(transaction)
                    .input('vid', sql.Int, voucherId)
                    .input('gl',  sql.Int, posGL)
                    .input('nar', sql.NVarChar(sql.MAX), `Settle POS receipt voucher #${row.VoucherID} — ${voucherNo}`)
                    .input('cr',  sql.Decimal(18,2), +parseFloat(row.PendingAmount).toFixed(2))
                    .input('avid', sql.Int, row.VoucherID)
                    .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit, AllocatedToVoucherID)
                            VALUES (@vid, @gl, @nar, 0, @cr, @avid)`);
            }

            // Flip Status to Posted — balanced-entry trigger fires
            await new sql.Request(transaction)
                .input('vid', sql.Int, voucherId)
                .input('pby', sql.Int, req.user?.userId || null)
                .query(`UPDATE data_FinanceVoucherInfo
                        SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                        WHERE VoucherID=@vid`);

            await transaction.commit();
            res.status(201).json({
                message: 'POS settlement posted.',
                voucherId, voucherNo,
                grossTotal, commission, netDeposit,
                settledCount: pendingRes.recordset.length,
            });
        } catch (err) {
            try { await transaction.rollback(); } catch {}
            throw err;
        }
    } catch (err) {
        console.error('postSettlement error:', err);
        res.status(400).json({ error: err.message });
    }
};

/**
 * GET /api/pos-settlement/recent?bankGLCAID=...&limit=10
 * Returns the most recent N POS Settlement BRVs (or all banks if bankGLCAID omitted).
 * A POS Settlement voucher is identified by: voucher type BRV AND has a debit line on the bank GLCAID
 * AND has a credit line on the POS_CLEARING role account.
 */
exports.getRecent = async (req, res) => {
    try {
        const bankGLCAID = req.query.bankGLCAID ? parseInt(req.query.bankGLCAID) : null;
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const posGL = await resolveRole('POS_CLEARING');

        const pool = await getPool();
        const r = pool.request().input('pos', sql.Int, posGL);
        let bankFilter = '';
        if (bankGLCAID) {
            r.input('bank', sql.Int, bankGLCAID);
            bankFilter = `AND EXISTS (SELECT 1 FROM data_FinanceVoucherDetail db
                                       WHERE db.VoucherID=v.VoucherID AND db.GLCAID=@bank AND db.Debit > 0)`;
        }
        const result = await r.query(`
            SELECT TOP ${limit}
                   v.VoucherID, v.VoucherNo, v.VoucherDate, v.TotalAmount, v.Remarks, v.Status,
                   (SELECT TOP 1 c.GLCode + ' ' + c.GLTitle
                      FROM data_FinanceVoucherDetail db
                      JOIN GLChartOFAccount c ON db.GLCAID = c.GLCAID
                      WHERE db.VoucherID = v.VoucherID AND db.Debit > 0 AND db.GLCAID <> @pos
                      ORDER BY db.Debit DESC) AS BankAccount,
                   (SELECT SUM(d.Credit) FROM data_FinanceVoucherDetail d
                      WHERE d.VoucherID = v.VoucherID AND d.GLCAID = @pos) AS POSCleared
            FROM data_FinanceVoucherInfo v
            JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
            WHERE v.Status IN ('Posted','Reversed')
              AND vt.Title = 'BRV'
              AND EXISTS (SELECT 1 FROM data_FinanceVoucherDetail dc
                           WHERE dc.VoucherID = v.VoucherID AND dc.GLCAID = @pos AND dc.Credit > 0)
              ${bankFilter}
            ORDER BY v.VoucherDate DESC, v.VoucherID DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('pos-settlement recent:', err);
        res.status(500).json({ error: err.message });
    }
};
