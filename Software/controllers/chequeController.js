const { sql, getPool } = require('../config/db');
const { resolveRole } = require('./systemAccountsController');
const { postReversalVoucher } = require('../services/voucherReversalService');

// GET /api/cheques?status=Pending|Cleared|Bounced (default Pending)&direction=Received|Issued (optional)
exports.listCheques = async (req, res) => {
    try {
        const status = ['Pending', 'Cleared', 'Bounced'].includes(req.query.status)
            ? req.query.status : 'Pending';
        const direction = ['Received', 'Issued'].includes(req.query.direction)
            ? req.query.direction : null;
        const pool = await getPool();
        const r = await pool.request()
            .input('st', sql.NVarChar(20), status)
            .input('dir', sql.NVarChar(20), direction)
            .query(`
                SELECT pc.ChequeID, pc.Direction, pc.ReceiptVoucherID, pc.ReceiptDetailID,
                       pc.ChequeNo, pc.ChequeDate, pc.Amount, pc.DrawerBank,
                       pc.DepositBankGLCAID, db.GLCode AS BankCode, db.GLTitle AS BankTitle,
                       pc.PartyID, pt.PartyName,
                       pc.JobCardID, jc.JobCardNo,
                       pc.Status, pc.ClearedAt, pc.ClearanceVoucherID, cv.VoucherNo AS ClearanceVoucherNo,
                       pc.Notes, pc.CreatedAt, pc.CreatedByName,
                       rv.VoucherNo AS ReceiptVoucherNo, rv.VoucherDate AS ReceiptDate
                FROM dms_PendingCheques pc
                LEFT JOIN GLChartOFAccount        db ON db.GLCAID    = pc.DepositBankGLCAID
                LEFT JOIN gen_PartiesInfo         pt ON pt.PartyID   = pc.PartyID
                LEFT JOIN Addata_JobCardInfo      jc ON jc.JobCardId = pc.JobCardID
                LEFT JOIN data_FinanceVoucherInfo rv ON rv.VoucherID = pc.ReceiptVoucherID
                LEFT JOIN data_FinanceVoucherInfo cv ON cv.VoucherID = pc.ClearanceVoucherID
                WHERE pc.Status = @st
                  AND (@dir IS NULL OR pc.Direction = @dir)
                ORDER BY pc.ChequeDate ASC, pc.ChequeID ASC`);
        res.json(r.recordset);
    } catch (err) {
        console.error('listCheques:', err);
        res.status(500).json({ error: err.message });
    }
};

// Load + lock a Pending cheque inside a transaction.
async function loadPendingCheque(tx, chequeId) {
    const r = await new sql.Request(tx)
        .input('id', sql.Int, chequeId)
        .query(`SELECT pc.*, rv.VoucherDate AS ReceiptDate
                FROM dms_PendingCheques pc WITH (UPDLOCK, HOLDLOCK)
                LEFT JOIN data_FinanceVoucherInfo rv ON rv.VoucherID = pc.ReceiptVoucherID
                WHERE pc.ChequeID=@id`);
    if (!r.recordset.length) throw new Error('Cheque not found.');
    const c = r.recordset[0];
    if (c.Status !== 'Pending') throw new Error(`Cheque is already ${c.Status}. Use Revert if you need to undo.`);
    return c;
}

// Generic posting helper. Two explicit legs (Dr + Cr); one carries AllocatedToVoucherID
// to net against the originating receipt/issue voucher.
async function postClearanceVoucher(tx, { vtCode, amount, narration, sourceDocId, userInfo, drLeg, crLeg }) {
    const vt = await new sql.Request(tx)
        .input('t', sql.NVarChar(20), vtCode)
        .query("SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title=@t ORDER BY Voucherid");
    if (!vt.recordset.length) throw new Error(`Voucher type ${vtCode} missing.`);
    const vtId = vt.recordset[0].Voucherid;

    const seq = await new sql.Request(tx)
        .query("SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo");
    const voucherNo = `${vtCode}-${String(seq.recordset[0].nextNo).padStart(4, '0')}`;

    const hdr = await new sql.Request(tx)
        .input('vd',    sql.DateTime,     new Date())
        .input('vno',   sql.NVarChar(50), voucherNo)
        .input('vtId',  sql.Int,          vtId)
        .input('rem',   sql.NVarChar(sql.MAX), narration)
        .input('tot',   sql.Decimal(18,2), amount)
        .input('src',   sql.NVarChar(20), 'CHEQUE')
        .input('srcId', sql.Int,          sourceDocId)
        .input('cby',   sql.Int,          userInfo?.userId || null)
        .input('cbyN',  sql.NVarChar(100),userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @rem, @tot,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const vid = hdr.recordset[0].VoucherID;

    const insertLeg = async (leg, isDr) => {
        await new sql.Request(tx)
            .input('vid',   sql.Int,            vid)
            .input('gl',    sql.Int,            leg.GLCAID)
            .input('nar',   sql.NVarChar(sql.MAX), leg.Narration || narration)
            .input('dr',    sql.Decimal(18,2),  isDr ? amount : 0)
            .input('cr',    sql.Decimal(18,2),  isDr ? 0 : amount)
            .input('pid',   sql.Int,            leg.PartyID || null)
            .input('jcid',  sql.Int,            leg.JobCardID || null)
            .input('alloc', sql.Int,            leg.AllocatedToVoucherID || null)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID, AllocatedToVoucherID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @pid, @jcid, @alloc)`);
    };
    await insertLeg(drLeg, true);
    await insertLeg(crLeg, false);

    // Subsidiary-ledger write for whichever leg has a PartyID — keeps party A/R aging accurate.
    for (const [leg, isDr] of [[drLeg, true], [crLeg, false]]) {
        if (leg.PartyID) {
            await new sql.Request(tx)
                .input('pid',   sql.Int,            leg.PartyID)
                .input('jcid',  sql.Int,            leg.JobCardID || null)
                .input('vid',   sql.Int,            vid)
                .input('gl',    sql.Int,            leg.GLCAID)
                .input('dr',    sql.Decimal(18,2),  isDr ? amount : 0)
                .input('cr',    sql.Decimal(18,2),  isDr ? 0 : amount)
                .input('nar',   sql.NVarChar(500),  leg.Narration || narration)
                .input('alloc', sql.Int,            leg.AllocatedToVoucherID || null)
                .query(`INSERT INTO dms_PartyLedger
                            (PartyID, JobCardID, VoucherID, GLCAID, Debit, Credit, Narration, AllocatedToVoucherID)
                        VALUES (@pid, @jcid, @vid, @gl, @dr, @cr, @nar, @alloc)`);
        }
    }

    await new sql.Request(tx)
        .input('vid', sql.Int, vid)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    return { voucherId: vid, voucherNo };
}

// Look up the customer/supplier's GL to re-open A/R or A/P on bounce.
async function loadPartyGLForBounce(tx, partyId) {
    if (!partyId) return null;
    const r = await new sql.Request(tx).input('id', sql.Int, partyId)
        .query('SELECT PartyName, PartyGLID FROM gen_PartiesInfo WHERE PartyID=@id');
    if (!r.recordset.length || !r.recordset[0].PartyGLID) {
        throw new Error('Cheque counterparty has no GL account linked.');
    }
    return r.recordset[0].PartyGLID;
}

// POST /api/cheques/:id/clear  body: { Notes? }
//
// Received cheque: Dr deposit bank / Cr CHEQUES_ON_HAND (allocated to receipt).
// Issued cheque:   Dr CHEQUES_ON_HAND (allocated to issue) / Cr drawn-on bank.
exports.clearCheque = async (req, res) => {
    const chequeId = parseInt(req.params.id);
    if (!Number.isFinite(chequeId)) return res.status(400).json({ error: 'Invalid cheque id.' });
    const notes = req.body?.Notes || null;
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const c = await loadPendingCheque(tx, chequeId);
        const holdingGL = c.Direction === 'Received'
            ? await resolveRole('CHEQUES_ON_HAND')
            : await resolveRole('CHEQUES_ISSUED_UNCLEARED');
        const dateStr = new Date(c.ChequeDate).toISOString().slice(0, 10);
        const narration = c.Direction === 'Received'
            ? `Cheque cleared — #${c.ChequeNo} dt ${dateStr} deposited to bank`
            : `Cheque cleared — #${c.ChequeNo} dt ${dateStr} paid out from bank`;

        let drLeg, crLeg;
        if (c.Direction === 'Received') {
            drLeg = { GLCAID: c.DepositBankGLCAID, Narration: narration };
            crLeg = { GLCAID: holdingGL, AllocatedToVoucherID: c.ReceiptVoucherID, Narration: narration };
        } else {
            drLeg = { GLCAID: holdingGL, AllocatedToVoucherID: c.ReceiptVoucherID, Narration: narration };
            crLeg = { GLCAID: c.DepositBankGLCAID, Narration: narration };
        }

        const { voucherId, voucherNo } = await postClearanceVoucher(tx, {
            vtCode: 'JV', amount: c.Amount, narration,
            sourceDocId: chequeId, userInfo: req.user,
            drLeg, crLeg,
        });
        await new sql.Request(tx)
            .input('id',   sql.Int,           chequeId)
            .input('vid',  sql.Int,           voucherId)
            .input('uby',  sql.Int,           req.user?.userId || null)
            .input('ubyN', sql.NVarChar(100), req.user?.userName || null)
            .input('nts',  sql.NVarChar(500), notes)
            .query(`UPDATE dms_PendingCheques
                    SET Status='Cleared', ClearedAt=GETDATE(), ClearanceVoucherID=@vid,
                        UpdatedAt=GETDATE(), UpdatedBy=@uby, UpdatedByName=@ubyN,
                        Notes=COALESCE(@nts, Notes)
                    WHERE ChequeID=@id`);
        await tx.commit();
        res.json({ message: 'Cheque cleared.', VoucherID: voucherId, VoucherNo: voucherNo });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('clearCheque:', err);
        res.status(400).json({ error: err.message });
    }
};

// POST /api/cheques/:id/revert  body: { Notes? }
//
// Undoes a Cleared or Bounced cheque by reversing the clearance voucher and
// flipping the cheque row back to Pending. The reversal step itself, via
// voucherReversalService, will restore Status='Pending' (see step 10 in that
// service); this endpoint just orchestrates the call and returns the reversal
// VoucherNo for the user.
exports.revertCheque = async (req, res) => {
    const chequeId = parseInt(req.params.id);
    if (!Number.isFinite(chequeId)) return res.status(400).json({ error: 'Invalid cheque id.' });
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const r = await new sql.Request(tx)
            .input('id', sql.Int, chequeId)
            .query(`SELECT ChequeID, Status, ClearanceVoucherID
                    FROM dms_PendingCheques WITH (UPDLOCK, HOLDLOCK)
                    WHERE ChequeID=@id`);
        if (!r.recordset.length) throw new Error('Cheque not found.');
        const c = r.recordset[0];
        if (c.Status === 'Pending') throw new Error('Cheque is already Pending — nothing to revert.');
        if (!c.ClearanceVoucherID)  throw new Error('Cheque has no clearance voucher attached — cannot revert.');

        const { reversalId, reversalNo } = await postReversalVoucher(c.ClearanceVoucherID, req.user, tx);
        // voucherReversalService step 10 already flipped this row back to Pending.
        await tx.commit();
        res.json({ message: 'Clearance reversed; cheque is Pending again.', ReversalVoucherID: reversalId, ReversalVoucherNo: reversalNo });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('revertCheque:', err);
        res.status(400).json({ error: err.message });
    }
};

// POST /api/cheques/:id/bounce  body: { Notes? }
//
// Received cheque bounce:
//     Dr customer (PartyGLID, or Gen-Cust+JobCardID for walk-ins) — re-opens A/R
//     Cr CHEQUES_ON_HAND allocated to receipt
// Issued cheque bounce:
//     Dr CHEQUES_ON_HAND allocated to issue
//     Cr supplier PartyGLID — re-opens A/P
exports.bounceCheque = async (req, res) => {
    const chequeId = parseInt(req.params.id);
    if (!Number.isFinite(chequeId)) return res.status(400).json({ error: 'Invalid cheque id.' });
    const notes = req.body?.Notes || null;
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const c = await loadPendingCheque(tx, chequeId);
        const holdingGL = c.Direction === 'Received'
            ? await resolveRole('CHEQUES_ON_HAND')
            : await resolveRole('CHEQUES_ISSUED_UNCLEARED');
        const dateStr = new Date(c.ChequeDate).toISOString().slice(0, 10);

        let drLeg, crLeg, narration;
        if (c.Direction === 'Received') {
            narration = `Cheque BOUNCED — #${c.ChequeNo} dt ${dateStr} — re-opening customer A/R`;
            // Re-open the customer's A/R on the same account it was reduced from.
            // Special case: if the source receipt was a depreciation payment against
            // an insurance-split JC, the receipt credited Gen-Cust (not the insurer),
            // so the bounce must Dr Gen-Cust+JobCardID — not the insurer's PartyGLID.
            // Detection mirrors recordDepreciationPayment's runtime split-check.
            let arSplit = false;
            if (c.PartyID && c.JobCardID) {
                const genCustGL = await resolveRole('GENERAL_CUSTOMER');
                const split = await new sql.Request(tx)
                    .input('jc', sql.Int, c.JobCardID)
                    .input('gc', sql.Int, genCustGL)
                    .query(`SELECT TOP 1 1 AS HasSplit
                            FROM data_FinanceVoucherDetail d
                            INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                            WHERE v.SourceDocType='JOBCARD' AND v.SourceDocID=@jc
                              AND v.Status='Posted'
                              AND d.GLCAID=@gc AND d.JobCardID=@jc AND d.PartyID IS NULL
                              AND d.Debit > 0`);
                arSplit = split.recordset.length > 0;
            }
            if (arSplit) {
                const genCustGL = await resolveRole('GENERAL_CUSTOMER');
                drLeg = { GLCAID: genCustGL, JobCardID: c.JobCardID, Narration: narration };
            } else if (c.PartyID) {
                const partyGL = await loadPartyGLForBounce(tx, c.PartyID);
                drLeg = { GLCAID: partyGL, PartyID: c.PartyID, JobCardID: c.JobCardID || null, Narration: narration };
            } else {
                const genCustGL = await resolveRole('GENERAL_CUSTOMER');
                drLeg = { GLCAID: genCustGL, JobCardID: c.JobCardID || null, Narration: narration };
            }
            crLeg = { GLCAID: holdingGL, AllocatedToVoucherID: c.ReceiptVoucherID, Narration: narration };
        } else {
            narration = `Issued cheque BOUNCED — #${c.ChequeNo} dt ${dateStr} — re-opening supplier A/P`;
            drLeg = { GLCAID: holdingGL, AllocatedToVoucherID: c.ReceiptVoucherID, Narration: narration };
            if (!c.PartyID) throw new Error('Issued cheque has no supplier PartyID — cannot reopen A/P.');
            const partyGL = await loadPartyGLForBounce(tx, c.PartyID);
            crLeg = { GLCAID: partyGL, PartyID: c.PartyID, Narration: narration };
        }

        const { voucherId, voucherNo } = await postClearanceVoucher(tx, {
            vtCode: 'JV', amount: c.Amount, narration,
            sourceDocId: chequeId, userInfo: req.user,
            drLeg, crLeg,
        });
        await new sql.Request(tx)
            .input('id',   sql.Int,           chequeId)
            .input('vid',  sql.Int,           voucherId)
            .input('uby',  sql.Int,           req.user?.userId || null)
            .input('ubyN', sql.NVarChar(100), req.user?.userName || null)
            .input('nts',  sql.NVarChar(500), notes)
            .query(`UPDATE dms_PendingCheques
                    SET Status='Bounced', ClearedAt=GETDATE(), ClearanceVoucherID=@vid,
                        UpdatedAt=GETDATE(), UpdatedBy=@uby, UpdatedByName=@ubyN,
                        Notes=COALESCE(@nts, Notes)
                    WHERE ChequeID=@id`);
        await tx.commit();
        res.json({ message: 'Cheque marked bounced and party A/R/P re-opened.', VoucherID: voucherId, VoucherNo: voucherNo });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('bounceCheque:', err);
        res.status(400).json({ error: err.message });
    }
};
