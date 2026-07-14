const { sql, getPool } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');
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
                           -- Human-readable doc reference. For a receive-payment BRV/CRV the
                           -- POS-Clearing line carries AllocatedToVoucherID pointing at the
                           -- original invoice voucher; chase that to surface the JC / SO number.
                           COALESCE(
                               (SELECT TOP 1 jc.JobCardNo
                                  FROM data_FinanceVoucherDetail ad
                                  JOIN data_FinanceVoucherInfo  av ON av.VoucherID = ad.AllocatedToVoucherID
                                  JOIN Addata_JobCardInfo       jc ON jc.JobCardId = av.SourceDocID
                                  WHERE ad.VoucherID = vi.VoucherID
                                    AND ad.AllocatedToVoucherID IS NOT NULL
                                    AND av.SourceDocType = 'JOBCARD'),
                               (SELECT TOP 1 CAST(ss.InvoiceNo AS NVARCHAR(50))
                                  FROM data_FinanceVoucherDetail ad
                                  JOIN data_FinanceVoucherInfo  av ON av.VoucherID = ad.AllocatedToVoucherID
                                  JOIN data_StoreSaleInfo       ss ON ss.SaleID = av.SourceDocID
                                  WHERE ad.VoucherID = vi.VoucherID
                                    AND ad.AllocatedToVoucherID IS NOT NULL
                                    AND av.SourceDocType = 'STORE_SALE'),
                               (SELECT CAST(JobCardNo AS NVARCHAR(50)) FROM Addata_JobCardInfo WHERE JobCardId = vi.SourceDocID AND vi.SourceDocType = 'JOBCARD'),
                               (SELECT CAST(InvoiceNo AS NVARCHAR(50)) FROM data_StoreSaleInfo WHERE SaleID = vi.SourceDocID AND vi.SourceDocType = 'STORE_SALE'),
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
//   banks: [                                       -- one row per receiving bank (owner ask 2026-07-14: split possible)
//     { bankGLCAID, netDepositAmount, commissionAmount }, ...
//   ],
//   voucherIDs: [vid, vid, ...],                   -- which pending POS receipts to settle
//   narration,
// }
//
// Backward compat: if body carries { bankGLCAID, netDepositAmount, commissionAmount }
// at the top level (legacy single-bank shape) it is normalised into
// banks: [{ ... }].
exports.postSettlement = async (req, res) => {
    try {
        const { bankGLCAID, voucherIDs, commissionAmount, netDepositAmount, narration } = req.body;
        let banks = Array.isArray(req.body.banks) ? req.body.banks.slice() : null;

        if (!banks && bankGLCAID) {
            // Legacy single-bank shape.
            banks = [{ bankGLCAID, netDepositAmount, commissionAmount }];
        }

        if (!banks || banks.length === 0) {
            return res.status(400).json({ error: 'At least one bank row is required.' });
        }
        if (!Array.isArray(voucherIDs) || voucherIDs.length === 0) {
            return res.status(400).json({ error: 'Pick at least one POS receipt to settle.' });
        }

        const pool = await getPool();

        // Validate every bank + resolve its charges account.
        const resolvedBanks = [];
        for (const [i, row] of banks.entries()) {
            if (!row || !row.bankGLCAID) {
                return res.status(400).json({ error: `Bank #${i+1}: bank account is required.` });
            }
            const bankRes = await pool.request()
                .input('id', sql.Int, parseInt(row.bankGLCAID))
                .query(`SELECT b.GLCAID, b.POSCommissionPct, b.BankChargesGLCAID, c.GLTitle
                        FROM dms_BankAccounts b
                        INNER JOIN GLChartOFAccount c ON c.GLCAID = b.GLCAID
                        WHERE b.GLCAID=@id AND b.IsActive=1`);
            if (!bankRes.recordset.length) {
                return res.status(400).json({ error: `Bank #${i+1}: not active or not marked as a bank.` });
            }
            const b = bankRes.recordset[0];
            if (!b.BankChargesGLCAID) {
                return res.status(400).json({ error: `Bank #${i+1} (${b.GLTitle}): Bank Charges account not configured. Set it in the bank's COA config.` });
            }
            // Duplicate bank rows not allowed — merge them upstream if the operator meant one row.
            if (resolvedBanks.some(rb => rb.GLCAID === b.GLCAID)) {
                return res.status(400).json({ error: `Bank ${b.GLTitle} appears more than once — merge the amounts into one row.` });
            }
            resolvedBanks.push({
                GLCAID: b.GLCAID,
                POSCommissionPct: parseFloat(b.POSCommissionPct) || 0,
                BankChargesGLCAID: b.BankChargesGLCAID,
                GLTitle: b.GLTitle,
                netDeposit: (row.netDepositAmount !== undefined && row.netDepositAmount !== null && row.netDepositAmount !== '')
                    ? +parseFloat(row.netDepositAmount).toFixed(2) : null,
                commission: (row.commissionAmount !== undefined && row.commissionAmount !== null && row.commissionAmount !== '')
                    ? +parseFloat(row.commissionAmount).toFixed(2) : null,
            });
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

        // Single-bank commission default only fires when there's exactly one bank
        // AND the operator omitted an explicit commission. Multi-bank flow must
        // send explicit netDeposit + commission per row (there's no natural way
        // to auto-split a percentage across banks).
        if (resolvedBanks.length === 1) {
            const b = resolvedBanks[0];
            if (b.commission === null) b.commission = +(grossTotal * b.POSCommissionPct / 100).toFixed(2);
            if (b.netDeposit === null) b.netDeposit = +(grossTotal - b.commission).toFixed(2);
        } else {
            // Multi-bank: every row must carry both amounts explicitly.
            for (const [i, b] of resolvedBanks.entries()) {
                if (b.netDeposit === null || b.commission === null) {
                    return res.status(400).json({ error: `Bank #${i+1} (${b.GLTitle}): net deposit AND commission are required in multi-bank settlement.` });
                }
            }
        }

        const totalNet = +resolvedBanks.reduce((s, b) => s + b.netDeposit, 0).toFixed(2);
        const totalCommission = +resolvedBanks.reduce((s, b) => s + b.commission, 0).toFixed(2);
        if (Math.abs((totalNet + totalCommission) - grossTotal) > 0.01) {
            return res.status(400).json({
                error: `Total across banks (net ${totalNet} + commission ${totalCommission} = ${(totalNet+totalCommission).toFixed(2)}) must equal gross POS total (${grossTotal.toFixed(2)}).`
            });
        }

        // Pick BRV voucher type
        const vtRes = await pool.request().query("SELECT Voucherid FROM GLVoucherType WHERE Title='BRV'");
        if (!vtRes.recordset.length) return res.status(400).json({ error: 'BRV voucher type not configured.' });
        const voucherTypeId = vtRes.recordset[0].Voucherid;

        // Atomic posting
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            const voucherNo = await nextVoucherNo(transaction, 'BRV');

            const bankLabel = resolvedBanks.length === 1
                ? resolvedBanks[0].GLTitle
                : resolvedBanks.map(b => b.GLTitle).join(' + ');
            const narrationStr = narration || `POS settlement to ${bankLabel} (${pendingRes.recordset.length} receipt${pendingRes.recordset.length === 1 ? '' : 's'})`;

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

            // Dr Bank + Dr Bank Charges — one pair per bank row.
            for (const b of resolvedBanks) {
                if (b.netDeposit > 0) {
                    await new sql.Request(transaction)
                        .input('vid', sql.Int, voucherId)
                        .input('gl',  sql.Int, b.GLCAID)
                        .input('nar', sql.NVarChar(sql.MAX), `POS settlement deposit to ${b.GLTitle} — ${voucherNo}`)
                        .input('dr',  sql.Decimal(18,2), b.netDeposit)
                        .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                                VALUES (@vid, @gl, @nar, @dr, 0)`);
                }
                if (b.commission > 0) {
                    await new sql.Request(transaction)
                        .input('vid', sql.Int, voucherId)
                        .input('gl',  sql.Int, b.BankChargesGLCAID)
                        .input('nar', sql.NVarChar(sql.MAX), `POS commission (${b.GLTitle}) — ${voucherNo}`)
                        .input('dr',  sql.Decimal(18,2), b.commission)
                        .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                                VALUES (@vid, @gl, @nar, @dr, 0)`);
                }
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
                grossTotal,
                commission: totalCommission,
                netDeposit: totalNet,
                banks: resolvedBanks.map(b => ({
                    GLCAID: b.GLCAID, name: b.GLTitle,
                    netDeposit: b.netDeposit, commission: b.commission,
                })),
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
