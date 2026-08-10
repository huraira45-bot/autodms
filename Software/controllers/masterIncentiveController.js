/**
 * Master Incentive — accrual visibility + receipt (MRV) workflow.
 * Companion to the auto-posted accrual that fires inside salesMasterInvoicePostingService.
 */
const { sql, getPool } = require('../config/db');
const { resolveRole } = require('./systemAccountsController');
const { postMasterReceiptVoucher, postBulkMasterReceiptVoucher } = require('../services/masterIncentiveReceiptService');
const { postReversalVoucher } = require('../services/voucherReversalService');

// GET /api/sales/master-incentive/summary
// Aggregates the Master-side asset position: total accrued, total received,
// outstanding. Sourced from dms_SalesIncentiveAccruals where EarnerType='Master'.
exports.summary = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT
                ISNULL(SUM(CASE WHEN Status <> 'Reversed' THEN AmountAccrued    ELSE 0 END), 0) AS TotalAccrued,
                ISNULL(SUM(CASE WHEN Status <> 'Reversed' THEN DisbursedAmount  ELSE 0 END), 0) AS TotalReceived,
                COUNT(CASE WHEN Status IN ('Accrued','PartiallyDisbursed') THEN 1 END)        AS PendingCount,
                COUNT(*) AS TotalAccrualCount
            FROM dms_SalesIncentiveAccruals
            WHERE EarnerType='Master'`);
        const s = r.recordset[0] || {};
        const accrued = Number(s.TotalAccrued || 0);
        const received = Number(s.TotalReceived || 0);
        res.json({
            totalAccrued: accrued,
            totalReceived: received,
            outstanding: Math.round((accrued - received) * 100) / 100,
            pendingCount: s.PendingCount || 0,
            totalAccrualCount: s.TotalAccrualCount || 0,
        });
    } catch (err) {
        console.error('masterIncentive.summary:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/sales/master-incentive/accruals?status=open
// Lists Master accruals. status=open → only those still owed (Accrued/PartiallyDisbursed).
exports.listAccruals = async (req, res) => {
    try {
        const { status } = req.query || {};
        const pool = await getPool();
        const r = await pool.request()
            .input('st', sql.NVarChar(20), status || null)
            .query(`SELECT a.AccrualID, a.BookingID, a.VehicleID, a.IncentiveCategory,
                           a.AmountAccrued, a.DisbursedAmount,
                           (a.AmountAccrued - a.DisbursedAmount) AS Outstanding,
                           a.Status, a.AccrualVoucherID, a.AccrualVoucherNo, a.AccruedAt,
                           a.TaxTreatment,
                           b.BookingNo, b.NegotiatedPrice,
                           v.ChasisNo
                    FROM dms_SalesIncentiveAccruals a
                    LEFT JOIN dms_SalesBookings b ON b.BookingID = a.BookingID
                    LEFT JOIN dms_Vehicle       v ON v.VehicleID = a.VehicleID
                    WHERE a.EarnerType='Master'
                      AND (@st IS NULL
                           OR (@st='open' AND a.Status IN ('Accrued','PartiallyDisbursed'))
                           OR a.Status = @st)
                    ORDER BY a.AccruedAt DESC, a.AccrualID DESC`);
        res.json(r.recordset);
    } catch (err) {
        console.error('masterIncentive.listAccruals:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/sales/master-incentive/receipts
exports.listReceipts = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT r.ReceiptID, r.AccrualID, r.GrossAmount, r.WHTAmount, r.GSTOnIncentive,
                   r.NetCashReceived, r.ReceiptVoucherID, r.ReceiptVoucherNo,
                   r.Status, r.CertificateRef, r.CertificateReceivedAt, r.ReceivedAt,
                   r.ReceivedByName, r.Notes,
                   a.BookingID, a.IncentiveCategory, b.BookingNo
            FROM dms_MasterIncentiveReceipts r
            INNER JOIN dms_SalesIncentiveAccruals a ON a.AccrualID = r.AccrualID
            LEFT JOIN dms_SalesBookings b           ON b.BookingID = a.BookingID
            ORDER BY r.ReceivedAt DESC, r.ReceiptID DESC`);
        res.json(r.recordset);
    } catch (err) {
        console.error('masterIncentive.listReceipts:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/sales/master-incentive/receipts
// body: { AccrualID, GrossAmount, WHTAmount?, GSTOnIncentive?, NetCashReceived,
//         PaymentMode? ('Bank' default | 'POS'), BankAccountGLCAID (required
//         unless PaymentMode='POS'), CertificateRef?, Notes? }
//
// Inserts the receipt row, posts the MRV voucher, stamps the voucher # back,
// and updates the accrual's DisbursedAmount / Status.
exports.createReceipt = async (req, res) => {
    const { AccrualID, GrossAmount, WHTAmount, GSTOnIncentive, NetCashReceived,
            PaymentMode, BankAccountGLCAID, CertificateRef, Notes } = req.body || {};
    if (!AccrualID || !Number.isFinite(Number(AccrualID))) {
        return res.status(400).json({ error: 'AccrualID is required.' });
    }
    if (!GrossAmount || Number(GrossAmount) <= 0) {
        return res.status(400).json({ error: 'GrossAmount must be > 0.' });
    }
    const gross = Number(GrossAmount);
    const wht   = Number(WHTAmount || 0);
    const gst   = Number(GSTOnIncentive || 0);
    const net   = Number(NetCashReceived || 0);
    if (Math.abs(net - (gross - wht + gst)) > 0.01) {
        return res.status(400).json({
            error: `NetCashReceived must equal Gross - WHT + GST (expected ${(gross - wht + gst).toFixed(2)}).`,
        });
    }
    // POS is received like any other POS receipt in this app -- posts against
    // the shared POS_CLEARING account instead of a specific bank (owner ask
    // 2026-08-08), so no bank account needs picking in that mode.
    const mode = PaymentMode === 'POS' ? 'POS' : 'Bank';
    if (mode === 'Bank' && !BankAccountGLCAID) return res.status(400).json({ error: 'BankAccountGLCAID is required.' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // Verify the accrual exists, is Master-side, and has remaining outstanding.
        const acc = await new sql.Request(tx)
            .input('id', sql.Int, Number(AccrualID))
            .query(`SELECT AccrualID, EarnerType, AmountAccrued, DisbursedAmount, Status
                    FROM dms_SalesIncentiveAccruals WITH (UPDLOCK, HOLDLOCK)
                    WHERE AccrualID=@id`);
        if (!acc.recordset.length) throw new Error(`Accrual ${AccrualID} not found.`);
        const a = acc.recordset[0];
        if (a.EarnerType !== 'Master') throw new Error('Accrual is not Master-side.');
        const outstanding = Number(a.AmountAccrued) - Number(a.DisbursedAmount);
        if (outstanding <= 0.01) throw new Error('Accrual already fully disbursed.');
        if (gross > outstanding + 0.01) {
            throw new Error(`Gross ${gross.toFixed(2)} exceeds outstanding ${outstanding.toFixed(2)} on this accrual.`);
        }

        const initialStatus = (wht > 0 || gst > 0) ? 'PendingCert' : 'Settled';

        // Insert receipt row
        const ins = await new sql.Request(tx)
            .input('aid',    sql.Int,           Number(AccrualID))
            .input('gross',  sql.Decimal(18,2), gross)
            .input('wht',    sql.Decimal(18,2), wht)
            .input('gst',    sql.Decimal(18,2), gst)
            .input('net',    sql.Decimal(18,2), net)
            .input('cref',   sql.NVarChar(100), CertificateRef || null)
            .input('st',     sql.NVarChar(20),  initialStatus)
            .input('rby',    sql.Int,           req.user?.employeeId || null)
            .input('rbyN',   sql.NVarChar(100), req.user?.userName   || 'system')
            .input('nts',    sql.NVarChar(sql.MAX), Notes || null)
            .query(`INSERT INTO dms_MasterIncentiveReceipts
                        (AccrualID, GrossAmount, WHTAmount, GSTOnIncentive, NetCashReceived,
                         CertificateRef, Status, ReceivedByEmployeeID, ReceivedByName, Notes)
                    OUTPUT INSERTED.ReceiptID
                    VALUES (@aid, @gross, @wht, @gst, @net,
                            @cref, @st, @rby, @rbyN, @nts)`);
        const receiptId = ins.recordset[0].ReceiptID;

        // Post the MRV voucher; updates accrual + stamps receipt internally.
        const voucherId = await postMasterReceiptVoucher(
            receiptId, mode === 'Bank' ? Number(BankAccountGLCAID) : null, req.user, tx, mode);

        await tx.commit();
        res.json({ message: 'Master incentive receipt posted.', ReceiptID: receiptId, VoucherID: voucherId });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('masterIncentive.createReceipt:', err);
        res.status(400).json({ error: err.message });
    }
};

// POST /api/sales/master-incentive/receipts/bulk
// body: { AccrualIDs: [10,12,...], TotalGrossAmount, TotalWHTAmount?, TotalGSTOnIncentive?,
//         TotalNetCashReceived, PaymentMode ('Bank'|'POS'), BankAccountGLCAID (if Bank),
//         CertificateRef?, Notes? }
//
// Owner ask 2026-08-08: Master pays the incentive once a month as one lump
// sum covering many accruals at once, not one bank transfer per booking.
// FIFO-splits TotalGrossAmount across the selected accruals (oldest first,
// same distribution logic as salesIncentiveController.disburse), inserts one
// dms_MasterIncentiveReceipts row per accrual touched, then posts ONE MRV
// voucher covering all of them.
exports.createBulkReceipt = async (req, res) => {
    const { AccrualIDs, TotalGrossAmount, TotalWHTAmount, TotalGSTOnIncentive, TotalNetCashReceived,
            PaymentMode, BankAccountGLCAID, CertificateRef, Notes } = req.body || {};
    if (!Array.isArray(AccrualIDs) || !AccrualIDs.length) {
        return res.status(400).json({ error: 'AccrualIDs is required (pick at least one accrual).' });
    }
    const ids = AccrualIDs.map(id => parseInt(id)).filter(Number.isFinite);
    if (!ids.length) return res.status(400).json({ error: 'AccrualIDs must contain valid accrual IDs.' });
    if (!TotalGrossAmount || Number(TotalGrossAmount) <= 0) {
        return res.status(400).json({ error: 'TotalGrossAmount must be > 0.' });
    }
    const gross = Number(TotalGrossAmount);
    const wht   = Number(TotalWHTAmount || 0);
    const gst   = Number(TotalGSTOnIncentive || 0);
    const net   = Number(TotalNetCashReceived || 0);
    if (Math.abs(net - (gross - wht + gst)) > 0.01) {
        return res.status(400).json({
            error: `TotalNetCashReceived must equal Gross - WHT + GST (expected ${(gross - wht + gst).toFixed(2)}).`,
        });
    }
    const mode = PaymentMode === 'POS' ? 'POS' : 'Bank';
    if (mode === 'Bank' && !BankAccountGLCAID) return res.status(400).json({ error: 'BankAccountGLCAID is required.' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const accs = await new sql.Request(tx)
            .query(`SELECT AccrualID, AmountAccrued, DisbursedAmount, Status, AccruedAt
                    FROM dms_SalesIncentiveAccruals WITH (UPDLOCK, HOLDLOCK)
                    WHERE AccrualID IN (${ids.join(',')}) AND EarnerType='Master'
                    ORDER BY AccruedAt ASC, AccrualID ASC`);
        const outstanding = accs.recordset
            .map(a => ({ ...a, Outstanding: Number(a.AmountAccrued) - Number(a.DisbursedAmount) }))
            .filter(a => a.Outstanding > 0.01);
        if (!outstanding.length) throw new Error('None of the selected accruals have an outstanding balance.');
        const totalOutstanding = outstanding.reduce((s, a) => s + a.Outstanding, 0);
        if (gross > totalOutstanding + 0.01) {
            throw new Error(`Gross ${gross.toFixed(2)} exceeds total outstanding ${totalOutstanding.toFixed(2)} across the selected accruals.`);
        }

        // FIFO-fill: take what each accrual needs, in order, until the gross
        // is used up. WHT/GST/net are prorated per accrual's share of gross
        // so each receipt row stays internally consistent (Net = Gross-WHT+GST
        // is enforced per-row by the DB, same as the single-receipt path).
        let remaining = gross;
        const receiptIds = [];
        for (let i = 0; i < outstanding.length && remaining > 0.01; i++) {
            const a = outstanding[i];
            const take = Math.min(remaining, a.Outstanding);
            const share = take / gross;
            const rowWht = +(wht * share).toFixed(2);
            const rowGst = +(gst * share).toFixed(2);
            const rowNet = +(take - rowWht + rowGst).toFixed(2);
            const initialStatus = (rowWht > 0 || rowGst > 0) ? 'PendingCert' : 'Settled';

            const ins = await new sql.Request(tx)
                .input('aid',    sql.Int,           a.AccrualID)
                .input('gross',  sql.Decimal(18,2), take)
                .input('wht',    sql.Decimal(18,2), rowWht)
                .input('gst',    sql.Decimal(18,2), rowGst)
                .input('net',    sql.Decimal(18,2), rowNet)
                .input('cref',   sql.NVarChar(100), CertificateRef || null)
                .input('st',     sql.NVarChar(20),  initialStatus)
                .input('rby',    sql.Int,           req.user?.employeeId || null)
                .input('rbyN',   sql.NVarChar(100), req.user?.userName   || 'system')
                .input('nts',    sql.NVarChar(sql.MAX), Notes || null)
                .query(`INSERT INTO dms_MasterIncentiveReceipts
                            (AccrualID, GrossAmount, WHTAmount, GSTOnIncentive, NetCashReceived,
                             CertificateRef, Status, ReceivedByEmployeeID, ReceivedByName, Notes)
                        OUTPUT INSERTED.ReceiptID
                        VALUES (@aid, @gross, @wht, @gst, @net,
                                @cref, @st, @rby, @rbyN, @nts)`);
            receiptIds.push(ins.recordset[0].ReceiptID);
            remaining -= take;
        }

        const voucherId = await postBulkMasterReceiptVoucher(
            receiptIds, mode === 'Bank' ? Number(BankAccountGLCAID) : null, req.user, tx, mode);

        await tx.commit();
        res.json({ message: 'Master incentive lump-sum receipt posted.', ReceiptIDs: receiptIds, VoucherID: voucherId });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('masterIncentive.createBulkReceipt:', err);
        res.status(400).json({ error: err.message });
    }
};

// POST /api/sales/master-incentive/receipts/:id/mark-cert-received
// Flips Status from PendingCert → CertReceived (auditable check-in for the
// WHT certificate without altering the GL).
exports.markCertReceived = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { CertificateRef } = req.body || {};
        const pool = await getPool();
        const r = await pool.request()
            .input('id',   sql.Int,           id)
            .input('cref', sql.NVarChar(100), CertificateRef || null)
            .query(`UPDATE dms_MasterIncentiveReceipts
                    SET Status='CertReceived', CertificateReceivedAt=GETDATE(),
                        CertificateRef = COALESCE(@cref, CertificateRef)
                    WHERE ReceiptID=@id AND Status='PendingCert';
                    SELECT @@ROWCOUNT AS affected;`);
        if (!r.recordset[0].affected) {
            return res.status(409).json({ error: 'Receipt not in PendingCert status.' });
        }
        res.json({ message: 'Certificate marked received.' });
    } catch (err) {
        console.error('masterIncentive.markCertReceived:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/sales/master-incentive/receipts/:id/revoke   body: { reason }
// Reverses the MRV voucher (which auto-flips dms_PendingCheques etc. via the
// reversal service's step 10) and rolls back the accrual's DisbursedAmount.
//
// A bulk/lump-sum receipt (createBulkReceipt) shares ONE voucher across
// several dms_MasterIncentiveReceipts rows — reversing just the one the
// caller asked for would leave its siblings pointing at a Reversed voucher
// while their accruals stayed wrongly marked Disbursed. Revoking any one of
// them revokes the whole batch together.
exports.revokeReceipt = async (req, res) => {
    const id = parseInt(req.params.id);
    const { reason } = req.body || {};
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'reason is required.' });
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const target = await new sql.Request(tx)
            .input('id', sql.Int, id)
            .query(`SELECT ReceiptVoucherID FROM dms_MasterIncentiveReceipts WHERE ReceiptID=@id`);
        if (!target.recordset.length) throw new Error(`Receipt ${id} not found.`);
        const voucherId = target.recordset[0].ReceiptVoucherID;
        if (!voucherId) throw new Error('Receipt has no voucher to reverse.');

        // Every receipt sharing this voucher (bulk receipts touch several).
        const siblings = await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .query(`SELECT r.ReceiptID, r.AccrualID, r.GrossAmount,
                           a.AmountAccrued, a.DisbursedAmount
                    FROM dms_MasterIncentiveReceipts r WITH (UPDLOCK, HOLDLOCK)
                    INNER JOIN dms_SalesIncentiveAccruals a ON a.AccrualID = r.AccrualID
                    WHERE r.ReceiptVoucherID=@vid`);

        const { reversalId } = await postReversalVoucher(voucherId, req.user, tx);

        const noteText = `REVERSED: ${reason.trim()}`;
        for (const rec of siblings.recordset) {
            const newDisbursed = Math.max(0, Number(rec.DisbursedAmount) - Number(rec.GrossAmount));
            const newStatus = newDisbursed > 0.01 ? 'PartiallyDisbursed' : 'Accrued';
            await new sql.Request(tx)
                .input('aid', sql.Int,           rec.AccrualID)
                .input('amt', sql.Decimal(18,2), newDisbursed)
                .input('st',  sql.NVarChar(20),  newStatus)
                .query(`UPDATE dms_SalesIncentiveAccruals
                        SET DisbursedAmount=@amt, Status=@st
                        WHERE AccrualID=@aid`);

            // Mark the receipt as reversed (we don't have a Revoked* set of
            // columns on this table — fold the metadata into Notes for
            // audit, status stays 'Settled' but the linked voucher being
            // Reversed signals the truth).
            await new sql.Request(tx)
                .input('id',  sql.Int,               rec.ReceiptID)
                .input('rsn', sql.NVarChar(sql.MAX), noteText)
                .query(`UPDATE dms_MasterIncentiveReceipts
                        SET Notes = ISNULL(Notes + CHAR(10), '') + @rsn
                        WHERE ReceiptID=@id`);
        }

        await tx.commit();
        res.json({
            message: siblings.recordset.length > 1
                ? `Bulk receipt voucher reversed (${siblings.recordset.length} accruals rolled back).`
                : 'Receipt voucher reversed.',
            ReversalVoucherID: reversalId,
        });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('masterIncentive.revokeReceipt:', err);
        res.status(400).json({ error: err.message });
    }
};
