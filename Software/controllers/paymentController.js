const { sql, getPool } = require('../config/db');
const { resolveRole } = require('./systemAccountsController');
const { buildPaymentJournalLines } = require('../utils/paymentJournalBuilder');

// ----- account resolution -----
async function resolveAccounts() {
    const roles = ['CASH_BOOK', 'POS_CLEARING', 'CHEQUES_ON_HAND',
                   'CUSTOMER_ADVANCE_RECEIVED', 'SUPPLIER_ADVANCE_PAID'];
    const out = {};
    for (const r of roles) out[r] = { GLCAID: await resolveRole(r) };
    const pool = await getPool();
    const byCode = async (code) => {
        const r = await pool.request()
            .input('c', sql.NVarChar(50), code)
            .query('SELECT GLCAID FROM GLChartOFAccount WHERE GLCode=@c AND Status=1');
        if (!r.recordset.length) throw new Error(`COA account ${code} not found.`);
        return { GLCAID: r.recordset[0].GLCAID };
    };
    out.TRADE_DEBTORS    = await byCode('101005');
    out.TRADE_CREDITORS  = await byCode('201001');
    return out;
}

// GET /api/payments/outstanding/:direction/:partyId
// direction = 'receive' (customer invoices owed to us) | 'make' (supplier bills we owe)
exports.getOutstanding = async (req, res) => {
    try {
        const direction = req.params.direction;
        const partyId = parseInt(req.params.partyId);
        if (!partyId) return res.status(400).json({ error: 'Valid partyId required.' });
        const pool = await getPool();

        const isReceive = direction === 'receive';
        if (direction !== 'receive' && direction !== 'make') {
            return res.status(400).json({ error: "direction must be 'receive' or 'make'." });
        }

        // For receive: invoice voucher Status=Posted, SourceDocType in (JOBCARD, STORE_SALE), has Trade Debtors line with this PartyID
        // For make: voucher Status=Posted, SourceDocType in (GRN), has Trade Creditors line with this PartyID
        const sourceTypes = isReceive ? "('JOBCARD','STORE_SALE')" : "('GRN','GRTN')";
        const subsidiaryGLCode = isReceive ? '101005' : '201001';

        const result = await pool.request()
            .input('pid', sql.Int, partyId)
            .query(`
                WITH InvoiceLines AS (
                    SELECT vi.VoucherID, vi.VoucherNo, vi.VoucherDate, vi.TotalAmount, vi.SourceDocType, vi.SourceDocID,
                           SUM(CASE WHEN vd.PartyID = @pid AND ${isReceive ? 'vd.Debit > 0' : 'vd.Credit > 0'}
                                    THEN ${isReceive ? 'vd.Debit' : 'vd.Credit'} ELSE 0 END) AS PartyShare
                    FROM data_FinanceVoucherInfo vi
                    INNER JOIN data_FinanceVoucherDetail vd ON vd.VoucherID = vi.VoucherID
                    INNER JOIN GLChartOFAccount c ON c.GLCAID = vd.GLCAID
                    WHERE vi.Status = 'Posted'
                      AND vi.SourceDocType IN ${sourceTypes}
                      AND vi.ReversesVoucherID IS NULL
                      AND c.GLCode = '${subsidiaryGLCode}'
                    GROUP BY vi.VoucherID, vi.VoucherNo, vi.VoucherDate, vi.TotalAmount, vi.SourceDocType, vi.SourceDocID
                    HAVING SUM(CASE WHEN vd.PartyID = @pid AND ${isReceive ? 'vd.Debit > 0' : 'vd.Credit > 0'}
                                    THEN ${isReceive ? 'vd.Debit' : 'vd.Credit'} ELSE 0 END) > 0
                ),
                Allocations AS (
                    SELECT vd.AllocatedToVoucherID,
                           SUM(CASE WHEN ${isReceive ? 'vd.Credit' : 'vd.Debit'} > 0
                                    THEN ${isReceive ? 'vd.Credit' : 'vd.Debit'} ELSE 0 END) AS Allocated
                    FROM data_FinanceVoucherDetail vd
                    INNER JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
                    WHERE vd.AllocatedToVoucherID IS NOT NULL
                      AND vd.PartyID = @pid
                      AND vi.Status = 'Posted'
                      AND vi.ReversesVoucherID IS NULL
                    GROUP BY vd.AllocatedToVoucherID
                )
                SELECT
                    i.VoucherID,
                    i.VoucherNo,
                    i.VoucherDate,
                    i.SourceDocType,
                    i.SourceDocID,
                    -- SourceRef = user-recognisable doc reference. Cast all branches to NVARCHAR
                    -- so SQL Server's COALESCE type-precedence rule doesn't try to convert a
                    -- string JobCardNo (e.g. 'CT-0004') into an int (the type of PurchaseVoucherNo).
                    COALESCE(
                        (SELECT CAST(JobCardNo AS NVARCHAR(50)) FROM Addata_JobCardInfo WHERE JobCardId = i.SourceDocID AND i.SourceDocType = 'JOBCARD'),
                        (SELECT CAST(InvoiceNo AS NVARCHAR(50)) FROM data_StoreSaleInfo WHERE SaleID = i.SourceDocID AND i.SourceDocType = 'STORE_SALE'),
                        (SELECT CAST(PurchaseVoucherNo AS NVARCHAR(50)) FROM data_PurchaseInfo WHERE PurchaseID = i.SourceDocID AND i.SourceDocType = 'GRN'),
                        (SELECT CAST(PurchaseReturnNo AS NVARCHAR(50)) FROM data_PurchaseReturnInfo WHERE PurchaseReturnID = i.SourceDocID AND i.SourceDocType = 'GRTN'),
                        CAST(i.VoucherNo AS NVARCHAR(50))
                    ) AS SourceRef,
                    i.PartyShare AS Invoiced,
                    ISNULL(a.Allocated, 0) AS Paid,
                    i.PartyShare - ISNULL(a.Allocated, 0) AS Outstanding,
                    DATEDIFF(day, i.VoucherDate, GETDATE()) AS AgeDays
                FROM InvoiceLines i
                LEFT JOIN Allocations a ON a.AllocatedToVoucherID = i.VoucherID
                WHERE i.PartyShare - ISNULL(a.Allocated, 0) > 0.005
                ORDER BY i.VoucherDate ASC
            `);

        // Unallocated advance balance for this party = aggregate net of Credit vs Debit
        // on the relevant role account. (Previous per-row CASE WHEN dropped drawdown rows,
        // so applying an advance never reduced the displayed balance.)
        const advanceCode = isReceive ? 'CUSTOMER_ADVANCE_RECEIVED' : 'SUPPLIER_ADVANCE_PAID';
        const advanceGL = await resolveRole(advanceCode);
        const advRes = await pool.request()
            .input('pid', sql.Int, partyId)
            .input('gl', sql.Int, advanceGL)
            .query(`SELECT
                ISNULL(${isReceive ? 'SUM(Credit) - SUM(Debit)' : 'SUM(Debit) - SUM(Credit)'}, 0) AS Advance
                FROM dms_PartyLedger
                WHERE PartyID = @pid AND GLCAID = @gl`);
        const advance = Math.max(0, Number(advRes.recordset[0]?.Advance) || 0);

        res.json({ invoices: result.recordset, advance });
    } catch (err) {
        console.error('getOutstanding error:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/payments/jobcard-balance/:jobCardId
// Returns invoice total + amount paid + outstanding for a specific Job Card,
// regardless of whether it was Cash or Credit at finalize.
// Used by the Walk-in deposit screen to show "how much does this RO owe".
exports.getJobCardBalance = async (req, res) => {
    try {
        const jobCardId = parseInt(req.params.jobCardId);
        if (!jobCardId) return res.status(400).json({ error: 'Valid jobCardId required.' });
        const pool = await getPool();

        // 1. Basic Job Card info
        const jcRes = await pool.request()
            .input('id', sql.Int, jobCardId)
            .query(`SELECT JobCardId, JobCardNo, jobCode, IsFinalized,
                           Status AS PaymentMode, PartyID
                    FROM Addata_JobCardInfo WHERE JobCardId=@id`);
        if (!jcRes.recordset.length) return res.status(404).json({ error: 'Job Card not found.' });
        const jobCard = jcRes.recordset[0];

        // 2. Auto-posted SI voucher (if any)
        const voucherRes = await pool.request()
            .input('id', sql.Int, jobCardId)
            .query(`SELECT TOP 1 VoucherID, VoucherNo, TotalAmount
                    FROM data_FinanceVoucherInfo
                    WHERE SourceDocType='JOBCARD' AND SourceDocID=@id AND Status='Posted'
                    ORDER BY VoucherID DESC`);
        const voucher = voucherRes.recordset[0] || null;

        // 3. Compute invoice total from JC details (works even if no SI voucher exists, e.g. legacy finalized jobs)
        const labourRes = await pool.request().input('id', sql.Int, jobCardId)
            .query(`SELECT ISNULL(SUM(Price - ISNULL(DiscAmt, 0) + ISNULL(TaxAmount, 0)), 0) AS Total
                    FROM Addata_JobCardInfoDetail WHERE JobCardId=@id`);
        const subletRes = await pool.request().input('id', sql.Int, jobCardId)
            .query(`SELECT ISNULL(SUM(PayableAmount + ISNULL(TaxAmount, 0)), 0) AS Total
                    FROM Addata_JobCardInfoSubletJobDetail WHERE JobCardId=@id`);
        const partsRes = await pool.request().input('id', sql.Int, jobCardId)
            .query(`SELECT ISNULL(SUM(d.IssueQuantity * d.ItemRate - ISNULL(d.DiscAmt,0) + ISNULL(d.TaxAmount,0)), 0) AS Total
                    FROM data_StockIssuetoJobCardDetail d
                    INNER JOIN data_StockIssuetoJobCard h ON h.StockIssueID = d.StockIssueID
                    WHERE h.JobCardId=@id`);

        const computedTotal = (parseFloat(labourRes.recordset[0].Total) || 0)
                            + (parseFloat(subletRes.recordset[0].Total) || 0)
                            + (parseFloat(partsRes.recordset[0].Total) || 0);

        const invoiceTotal = voucher ? parseFloat(voucher.TotalAmount) : computedTotal;

        // 4. Was the SI voucher already cash-settled at finalize?
        //    For Cash / POS / Bank Transfer / Cheque sales, the SI voucher itself debits a
        //    payment-side account (Cash Book / POS Clearing / Bank / Cheques on Hand),
        //    which means it's already counted as paid. Detect this by checking if the
        //    SI voucher has any debit line on a payment-mode account.
        let settledAtFinalize = 0;
        if (voucher) {
            const settleRes = await pool.request()
                .input('vid', sql.Int, voucher.VoucherID)
                .query(`SELECT ISNULL(SUM(vd.Debit), 0) AS Settled
                        FROM data_FinanceVoucherDetail vd
                        INNER JOIN GLChartOFAccount c ON c.GLCAID = vd.GLCAID
                        LEFT JOIN dms_SystemAccounts sa ON sa.GLCAID = c.GLCAID
                        LEFT JOIN dms_BankAccounts ba ON ba.GLCAID = c.GLCAID
                        WHERE vd.VoucherID = @vid
                          AND vd.Debit > 0
                          AND (sa.RoleKey IN ('CASH_BOOK','POS_CLEARING','CHEQUES_ON_HAND')
                               OR ba.GLCAID IS NOT NULL)`);
            settledAtFinalize = parseFloat(settleRes.recordset[0].Settled) || 0;
        }

        // 5. Sum payments against this JC via separate vouchers:
        //    (a) Payment-voucher lines AllocatedToVoucherID = SI voucher
        //    (b) Customer Advance Received with JobCardID = this JC (walk-in advances)
        let allocated = 0;
        if (voucher) {
            const allocRes = await pool.request()
                .input('vid', sql.Int, voucher.VoucherID)
                .query(`SELECT ISNULL(SUM(CASE WHEN Credit > 0 THEN Credit ELSE 0 END), 0) AS Allocated
                        FROM data_FinanceVoucherDetail
                        WHERE AllocatedToVoucherID=@vid`);
            allocated = parseFloat(allocRes.recordset[0].Allocated) || 0;
        }

        const advanceGL = await resolveRole('CUSTOMER_ADVANCE_RECEIVED');
        const advRes = await pool.request()
            .input('jcid', sql.Int, jobCardId)
            .input('gl', sql.Int, advanceGL)
            .query(`SELECT ISNULL(SUM(CASE WHEN Credit > 0 THEN Credit - Debit ELSE 0 END), 0) AS AdvanceCredit
                    FROM dms_PartyLedger
                    WHERE JobCardID=@jcid AND GLCAID=@gl`);
        const advance = parseFloat(advRes.recordset[0].AdvanceCredit) || 0;

        // Paid = (paid-at-finalize) + (separate payment vouchers allocated to SI) + (walk-in advances tagged to JC)
        const paid = settledAtFinalize + allocated + advance;
        const outstanding = Math.max(0, +(invoiceTotal - paid).toFixed(2));

        res.json({
            jobCard,
            invoiceTotal: +invoiceTotal.toFixed(2),
            computedTotal: +computedTotal.toFixed(2),
            voucher,
            hasInvoiceVoucher: !!voucher,
            settledAtFinalize: +settledAtFinalize.toFixed(2),
            allocated: +allocated.toFixed(2),
            walkInAdvance: +advance.toFixed(2),
            paid: +paid.toFixed(2),
            outstanding,
        });
    } catch (err) {
        console.error('getJobCardBalance error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/payments/recent?partyId=...&direction=receive|make&limit=10
 * Returns the most recent N posted vouchers for the chosen party in the chosen direction.
 *   receive → CRV / BRV (where the party was credited as the source of the cash)
 *   make    → CPV / BPV
 * Used by the Receive Payment / Make Payment side-panels.
 */
exports.getRecentForParty = async (req, res) => {
    try {
        const partyId = parseInt(req.query.partyId);
        const direction = (req.query.direction || 'receive').toLowerCase();
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        if (!partyId) return res.status(400).json({ error: 'partyId is required.' });

        const types = direction === 'make' ? ['CPV', 'BPV'] : ['CRV', 'BRV'];

        const pool = await getPool();
        const r = await pool.request()
            .input('pid', sql.Int, partyId)
            .query(`
                SELECT TOP ${limit}
                       v.VoucherID, v.VoucherNo, v.VoucherDate, vt.Title AS VoucherType,
                       v.TotalAmount, v.Remarks, v.Status,
                       (SELECT SUM(ISNULL(d2.Debit,0)+ISNULL(d2.Credit,0))/2
                          FROM data_FinanceVoucherDetail d2
                          WHERE d2.VoucherID = v.VoucherID AND d2.PartyID = @pid) AS PartyAmount
                FROM data_FinanceVoucherInfo v
                JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
                WHERE v.Status IN ('Posted','Reversed')
                  AND vt.Title IN (${types.map(t => `'${t}'`).join(',')})
                  AND EXISTS (
                      SELECT 1 FROM data_FinanceVoucherDetail d
                      WHERE d.VoucherID = v.VoucherID AND d.PartyID = @pid
                  )
                ORDER BY v.VoucherDate DESC, v.VoucherID DESC
            `);
        res.json(r.recordset);
    } catch (err) {
        console.error('getRecentForParty:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/payments/receive  body: { partyId?, walkInJobCardID?, paymentLines, allocations, narration? }
exports.receivePayment = async (req, res) => {
    return postPayment(req, res, 'receive');
};

// POST /api/payments/make  body: { partyId, paymentLines, allocations, narration? }
exports.makePayment = async (req, res) => {
    return postPayment(req, res, 'make');
};

async function postPayment(req, res, direction) {
    try {
        const { partyId, walkInJobCardID, paymentLines, allocations, narration } = req.body;
        if (!Array.isArray(paymentLines) || paymentLines.length === 0) {
            return res.status(400).json({ error: 'At least one payment line is required.' });
        }
        if (!Array.isArray(allocations)) {
            return res.status(400).json({ error: 'allocations must be an array (use [] for full advance).' });
        }

        const party = partyId ? { PartyID: parseInt(partyId) } : null;

        const pool = await getPool();
        const accounts = await resolveAccounts();

        // Validate any Bank Transfer lines have a valid BankGLCAID belonging to dms_BankAccounts
        for (const p of paymentLines) {
            if (p.Mode === 'Bank Transfer') {
                if (!p.BankGLCAID) return res.status(400).json({ error: 'Bank Transfer line missing BankGLCAID.' });
                const bk = await pool.request()
                    .input('id', sql.Int, parseInt(p.BankGLCAID))
                    .query('SELECT GLCAID FROM dms_BankAccounts WHERE GLCAID=@id AND IsActive=1');
                if (!bk.recordset.length) return res.status(400).json({ error: 'Bank account not active.' });
            }
        }

        // Advance-mode: cap at the party's available balance on the relevant role account.
        const totalAdvance = paymentLines
            .filter(p => p.Mode === 'Advance')
            .reduce((s, p) => s + (Number(p.Amount) || 0), 0);
        if (totalAdvance > 0) {
            if (!party?.PartyID) {
                return res.status(400).json({ error: 'Advance mode requires a named party.' });
            }
            const roleKey = direction === 'receive' ? 'CUSTOMER_ADVANCE_RECEIVED' : 'SUPPLIER_ADVANCE_PAID';
            const advGL = accounts[roleKey].GLCAID;
            // For receive: advance balance = Cr - Dr on CUSTOMER_ADVANCE_RECEIVED (it's a liability)
            // For make:    balance = Dr - Cr on SUPPLIER_ADVANCE_PAID                (it's an asset)
            const balExpr = direction === 'receive' ? 'Credit - Debit' : 'Debit - Credit';
            const balRes = await pool.request()
                .input('pid', sql.Int, party.PartyID)
                .input('gl',  sql.Int, advGL)
                .query(`SELECT ISNULL(SUM(${balExpr}), 0) AS Bal
                        FROM dms_PartyLedger
                        WHERE PartyID = @pid AND GLCAID = @gl`);
            const available = Number(balRes.recordset[0].Bal) || 0;
            if (totalAdvance > available + 0.005) {
                return res.status(400).json({
                    error: `Advance amount (PKR ${totalAdvance.toFixed(2)}) exceeds available balance (PKR ${available.toFixed(2)}).`
                });
            }
        }

        const built = buildPaymentJournalLines({
            direction, party,
            walkInJobCardID: walkInJobCardID ? parseInt(walkInJobCardID) : null,
            paymentLines, allocations, accounts,
            refNo: narration,
        });

        // Pick voucher type by direction + dominant mode
        // CRV / BRV for receive; CPV / BPV for make. Pick BRV/BPV if any mode is Bank Transfer; else use CRV/CPV.
        const hasBank = paymentLines.some(p => p.Mode === 'Bank Transfer' || p.Mode === 'POS' || p.Mode === 'Cheque');
        let voucherTypeTitle;
        if (direction === 'receive') voucherTypeTitle = hasBank ? 'BRV' : 'CRV';
        else                          voucherTypeTitle = hasBank ? 'BPV' : 'CPV';

        const vtRes = await pool.request()
            .input('t', sql.NVarChar(20), voucherTypeTitle)
            .query("SELECT Voucherid FROM GLVoucherType WHERE Title=@t");
        if (!vtRes.recordset.length) return res.status(400).json({ error: `Voucher type ${voucherTypeTitle} not configured.` });
        const voucherTypeId = vtRes.recordset[0].Voucherid;

        // Atomic transaction: header + details + subsidiary + flip to Posted
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            const seqRes = await new sql.Request(transaction).query(
                "SELECT ISNULL(MAX(VoucherID),0) + 1 AS nextNo FROM data_FinanceVoucherInfo"
            );
            const voucherNo = `${voucherTypeTitle}-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

            const hdrRes = await new sql.Request(transaction)
                .input('vd',      sql.DateTime,     new Date())
                .input('vno',     sql.NVarChar(50), voucherNo)
                .input('vtId',    sql.Int,          voucherTypeId)
                .input('remarks', sql.NVarChar(sql.MAX), built.header.Narration)
                .input('total',   sql.Decimal(18,2), built.header.TotalAmount)
                .input('src',     sql.NVarChar(20), built.header.SourceDocType)
                .input('cby',     sql.Int,          req.user?.userId || null)
                .input('cbyN',    sql.NVarChar(100),req.user?.userName || null)
                .query(`INSERT INTO data_FinanceVoucherInfo
                            (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                             Status, Posted, SourceDocType, CreatedBy, CreatedByName)
                        OUTPUT INSERTED.VoucherID
                        VALUES (@vd, @vno, @vtId, @remarks, @total,
                                'Draft', 0, @src, @cby, @cbyN)`);
            const voucherId = hdrRes.recordset[0].VoucherID;

            for (const line of built.lines) {
                await new sql.Request(transaction)
                    .input('vid',   sql.Int,           voucherId)
                    .input('gl',    sql.Int,           line.GLCAID)
                    .input('nar',   sql.NVarChar(sql.MAX), line.Narration)
                    .input('dr',    sql.Decimal(18,2), line.Debit  || 0)
                    .input('cr',    sql.Decimal(18,2), line.Credit || 0)
                    .input('pid',   sql.Int,           line.PartyID  || null)
                    .input('jcid',  sql.Int,           line.JobCardID || null)
                    .input('avid',  sql.Int,           line.AllocatedToVoucherID || null)
                    .query(`INSERT INTO data_FinanceVoucherDetail
                                (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID, AllocatedToVoucherID)
                            VALUES (@vid, @gl, @nar, @dr, @cr, @pid, @jcid, @avid)`);
            }

            for (const sub of built.subsidiaryWrites) {
                await new sql.Request(transaction)
                    .input('pid',  sql.Int,           sub.PartyID || null)
                    .input('jcid', sql.Int,           sub.JobCardID || null)
                    .input('vid',  sql.Int,           voucherId)
                    .input('gl',   sql.Int,           sub.GLCAID)
                    .input('dr',   sql.Decimal(18,2), sub.Debit  || 0)
                    .input('cr',   sql.Decimal(18,2), sub.Credit || 0)
                    .input('nar',  sql.NVarChar(500), sub.Narration || null)
                    .input('avid', sql.Int,           sub.AllocatedToVoucherID || null)
                    .query(`INSERT INTO dms_PartyLedger
                                (PartyID, JobCardID, VoucherID, GLCAID, Debit, Credit, Narration, AllocatedToVoucherID)
                            VALUES (@pid, @jcid, @vid, @gl, @dr, @cr, @nar, @avid)`);
            }

            // Flip to Posted — fires balanced-entry trigger
            await new sql.Request(transaction)
                .input('vid', sql.Int, voucherId)
                .input('pby', sql.Int, req.user?.userId || null)
                .query(`UPDATE data_FinanceVoucherInfo
                        SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                        WHERE VoucherID=@vid`);

            await transaction.commit();
            res.status(201).json({
                message: `${direction === 'receive' ? 'Payment received' : 'Payment made'}.`,
                voucherId, voucherNo,
                totals: built.totals,
            });
        } catch (err) {
            try { await transaction.rollback(); } catch {}
            throw err;
        }
    } catch (err) {
        console.error(`${direction} payment error:`, err);
        res.status(400).json({ error: err.message });
    }
}
