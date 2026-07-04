/**
 * Paint GRN — controller (Phase 1).
 *
 * Draft ↔ Posted state machine + inventory (running qty + moving-average
 * cost) + separate `paint_StockLedger` audit trail. Finalize posts a GL
 * voucher via services/paintGRNPostingService.js.
 *
 * Owner constraints:
 *  - Paint stays out of InventItems / Store Sale; this is its own module.
 *  - GST rolls INTO paint inventory cost (no Input GST claim on paint).
 *  - Line total = qty*rate - discount + gst.
 *  - Landed unit cost = LineTotal / Quantity — used for moving-avg math AND
 *    persisted on the detail row for GRTN reversals.
 *  - Only Draft rows are editable/deletable. Posted rows can be Unfinalized
 *    (admin) which mirror-reverses the voucher and rolls back stock.
 */
const { sql, getPool } = require('../config/db');
const { postPaintGRNVoucher } = require('../services/paintGRNPostingService');
const { postReversalVoucher } = require('../services/voucherReversalService');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

// Compute one line's derived amounts. Kept server-side so a mischievous
// client can't post a mismatched LineTotal.
function computeLineAmounts(line) {
    const qty      = round4(line.Quantity);
    const rate     = round4(line.UnitRate);
    const gross    = round2(qty * rate);
    const discPct  = round4(line.DiscountPct);
    // Prefer explicit DiscountAmt if the client sent one; else derive from %.
    const discAmt  = round2(
        line.DiscountAmt != null && line.DiscountAmt !== ''
            ? line.DiscountAmt
            : gross * (discPct / 100)
    );
    const gstOn    = !!line.GSTOn;
    const gstRate  = gstOn ? round4(line.GSTRate) : 0;
    const gstBase  = Math.max(0, gross - discAmt);
    const gstAmt   = gstOn ? round2(gstBase * (gstRate / 100)) : 0;
    const total    = round2(gstBase + gstAmt);
    const landed   = qty > 0 ? round4(total / qty) : 0;
    return { qty, rate, gross, discPct, discAmt, gstOn, gstRate, gstAmt, total, landed };
}

// ─── List (search + status + date range) ─────────────────────────
exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        const conds = ['1=1'];
        if (req.query.status) {
            rq.input('st', sql.NVarChar(20), req.query.status);
            conds.push('g.Status = @st');
        }
        if (req.query.search) {
            rq.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push('(g.GRNNo LIKE @q OR g.SupplierBillNo LIKE @q OR p.PartyName LIKE @q)');
        }
        if (req.query.from) {
            rq.input('df', sql.Date, req.query.from);
            conds.push('g.GRNDate >= @df');
        }
        if (req.query.to) {
            rq.input('dt', sql.Date, req.query.to);
            conds.push('g.GRNDate <= @dt');
        }
        const r = await rq.query(`
            SELECT g.PaintGRNID, g.GRNNo, g.GRNDate, g.Status, g.SupplierBillNo,
                   g.PartyID, p.PartyName,
                   g.PaintWHID, w.WHDesc,
                   g.SubTotal, g.DiscountTotal, g.GSTTotal, g.GrandTotal,
                   g.VoucherID, g.CreatedByName, g.CreatedAt,
                   g.FinalizedByName, g.FinalizedAt
            FROM paint_GRN g
            LEFT JOIN gen_PartiesInfo   p ON g.PartyID   = p.PartyID
            LEFT JOIN paint_Warehouse   w ON g.PaintWHID = w.PaintWHID
            WHERE ${conds.join(' AND ')}
            ORDER BY g.PaintGRNID DESC
        `);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Get single (header + lines) ─────────────────────────────────
exports.get = async (req, res) => {
    try {
        const pool = await getPool();
        const [hdr, lines] = await Promise.all([
            pool.request().input('id', sql.Int, req.params.id).query(`
                SELECT g.*, p.PartyName, w.WHDesc, w.WHCode,
                       v.VoucherNo, v.Status AS VoucherStatus
                FROM paint_GRN g
                LEFT JOIN gen_PartiesInfo p ON g.PartyID = p.PartyID
                LEFT JOIN paint_Warehouse w ON g.PaintWHID = w.PaintWHID
                LEFT JOIN data_FinanceVoucherInfo v ON g.VoucherID = v.VoucherID
                WHERE g.PaintGRNID = @id`),
            pool.request().input('id', sql.Int, req.params.id).query(`
                SELECT d.*, pi.PaintCode, pi.PaintName, u.UOMName
                FROM paint_GRNDetail d
                INNER JOIN paint_Item pi ON d.PaintItemID = pi.PaintItemID
                LEFT JOIN paint_UOM u ON d.PaintUOMID = u.PaintUOMID
                WHERE d.PaintGRNID = @id
                ORDER BY d.PaintGRNDetailID`),
        ]);
        if (!hdr.recordset.length) return res.status(404).json({ error: 'Paint GRN not found' });
        res.json({ ...hdr.recordset[0], Lines: lines.recordset });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// Shared writer used by create/update. Wraps a full replace of the detail
// rows inside a transaction so the totals stay consistent with the lines.
async function writeDraft({ pool, paintGRNID, body, user }) {
    const {
        GRNDate, PartyID, SupplierBillNo, PaintWHID, Remarks,
        Lines = [],
    } = body;
    if (!GRNDate)   throw new Error('GRNDate required');
    if (!PartyID)   throw new Error('PartyID required');
    if (!PaintWHID) throw new Error('PaintWHID required');
    if (!Array.isArray(Lines) || Lines.length === 0) throw new Error('At least one line required');

    const computed = Lines.map((l) => ({ src: l, calc: computeLineAmounts(l) }));
    const subTotal      = round2(computed.reduce((a, x) => a + x.calc.gross, 0));
    const discountTotal = round2(computed.reduce((a, x) => a + x.calc.discAmt, 0));
    const gstTotal      = round2(computed.reduce((a, x) => a + x.calc.gstAmt, 0));
    const grandTotal    = round2(computed.reduce((a, x) => a + x.calc.total, 0));

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        let id = paintGRNID;
        if (id) {
            // Existing draft — verify still editable
            const cur = await new sql.Request(tx).input('id', sql.Int, id)
                .query('SELECT Status FROM paint_GRN WITH (UPDLOCK, HOLDLOCK) WHERE PaintGRNID=@id');
            if (!cur.recordset.length) throw new Error('Paint GRN not found.');
            if (cur.recordset[0].Status !== 'Draft') throw new Error('Only Draft rows can be edited.');
            await new sql.Request(tx)
                .input('id',  sql.Int, id)
                .input('dt',  sql.Date, GRNDate)
                .input('pid', sql.Int, PartyID)
                .input('bn',  sql.NVarChar(100), SupplierBillNo || null)
                .input('wh',  sql.Int, PaintWHID)
                .input('rm',  sql.NVarChar(500), Remarks || null)
                .input('st',  sql.Decimal(18,2), subTotal)
                .input('dc',  sql.Decimal(18,2), discountTotal)
                .input('gt',  sql.Decimal(18,2), gstTotal)
                .input('gr',  sql.Decimal(18,2), grandTotal)
                .query(`UPDATE paint_GRN SET
                            GRNDate=@dt, PartyID=@pid, SupplierBillNo=@bn, PaintWHID=@wh,
                            Remarks=@rm, SubTotal=@st, DiscountTotal=@dc, GSTTotal=@gt, GrandTotal=@gr
                        WHERE PaintGRNID=@id`);
            await new sql.Request(tx).input('id', sql.Int, id)
                .query('DELETE FROM paint_GRNDetail WHERE PaintGRNID=@id');
        } else {
            // New draft — mint GRN number
            const seq = await new sql.Request(tx).query('SELECT NEXT VALUE FOR dbo.seq_PaintGRNNo AS n');
            const grnNo = `PGRN-${String(seq.recordset[0].n).padStart(4, '0')}`;
            const ins = await new sql.Request(tx)
                .input('no',  sql.NVarChar(30),  grnNo)
                .input('dt',  sql.Date,          GRNDate)
                .input('pid', sql.Int,           PartyID)
                .input('bn',  sql.NVarChar(100), SupplierBillNo || null)
                .input('wh',  sql.Int,           PaintWHID)
                .input('rm',  sql.NVarChar(500), Remarks || null)
                .input('st',  sql.Decimal(18,2), subTotal)
                .input('dc',  sql.Decimal(18,2), discountTotal)
                .input('gt',  sql.Decimal(18,2), gstTotal)
                .input('gr',  sql.Decimal(18,2), grandTotal)
                .input('cby', sql.Int,           user?.userId || null)
                .input('cbn', sql.NVarChar(100), user?.userName || null)
                .query(`INSERT INTO paint_GRN
                            (GRNNo, GRNDate, PartyID, SupplierBillNo, PaintWHID, Remarks,
                             Status, SubTotal, DiscountTotal, GSTTotal, GrandTotal,
                             CreatedBy, CreatedByName)
                        OUTPUT INSERTED.PaintGRNID
                        VALUES (@no, @dt, @pid, @bn, @wh, @rm,
                                'Draft', @st, @dc, @gt, @gr, @cby, @cbn)`);
            id = ins.recordset[0].PaintGRNID;
        }

        for (const { src, calc } of computed) {
            if (!src.PaintItemID) throw new Error('Each line needs PaintItemID');
            if (!(calc.qty > 0))  throw new Error('Each line quantity must be > 0');
            if (!(calc.rate >= 0)) throw new Error('Each line rate must be >= 0');
            await new sql.Request(tx)
                .input('h',   sql.Int,           id)
                .input('it',  sql.Int,           src.PaintItemID)
                .input('u',   sql.Int,           src.PaintUOMID || null)
                .input('q',   sql.Decimal(18,4), calc.qty)
                .input('r',   sql.Decimal(18,4), calc.rate)
                .input('dp',  sql.Decimal(9,4),  calc.discPct)
                .input('da',  sql.Decimal(18,2), calc.discAmt)
                .input('go',  sql.Bit,           calc.gstOn ? 1 : 0)
                .input('gr',  sql.Decimal(9,4),  calc.gstRate)
                .input('ga',  sql.Decimal(18,2), calc.gstAmt)
                .input('lt',  sql.Decimal(18,2), calc.total)
                .input('lu',  sql.Decimal(18,4), calc.landed)
                .query(`INSERT INTO paint_GRNDetail
                            (PaintGRNID, PaintItemID, PaintUOMID, Quantity, UnitRate,
                             DiscountPct, DiscountAmt, GSTOn, GSTRate, GSTAmount,
                             LineTotal, LandedUnitCost)
                        VALUES (@h, @it, @u, @q, @r, @dp, @da, @go, @gr, @ga, @lt, @lu)`);
        }

        await tx.commit();
        return id;
    } catch (e) {
        await tx.rollback();
        throw e;
    }
}

exports.create = async (req, res) => {
    try {
        const pool = await getPool();
        const id = await writeDraft({ pool, paintGRNID: null, body: req.body, user: req.user });
        res.status(201).json({ PaintGRNID: id });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.update = async (req, res) => {
    try {
        const pool = await getPool();
        await writeDraft({ pool, paintGRNID: parseInt(req.params.id), body: req.body, user: req.user });
        res.json({ message: 'Paint GRN updated' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.remove = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, req.params.id)
            .query(`SELECT Status FROM paint_GRN WHERE PaintGRNID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Paint GRN not found' });
        if (r.recordset[0].Status !== 'Draft') return res.status(423).json({ error: 'Only Draft rows can be deleted. Unfinalize first.' });
        await pool.request().input('id', sql.Int, req.params.id)
            .query('DELETE FROM paint_GRN WHERE PaintGRNID=@id'); // cascade removes detail
        res.json({ message: 'Paint GRN deleted' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ─── Finalize: stock + moving-avg + voucher (all in one tx) ──────
exports.finalize = async (req, res) => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const id = parseInt(req.params.id);
        const hdr = await new sql.Request(tx).input('id', sql.Int, id)
            .query('SELECT * FROM paint_GRN WITH (UPDLOCK, HOLDLOCK) WHERE PaintGRNID=@id');
        if (!hdr.recordset.length) throw new Error('Paint GRN not found.');
        const g = hdr.recordset[0];
        if (g.Status !== 'Draft') throw new Error(`Paint GRN is already ${g.Status}.`);

        const linesRes = await new sql.Request(tx).input('id', sql.Int, id)
            .query(`SELECT * FROM paint_GRNDetail WHERE PaintGRNID=@id ORDER BY PaintGRNDetailID`);
        if (!linesRes.recordset.length) throw new Error('Paint GRN has no lines.');

        // Stock + moving-avg update per line (rows locked for update).
        for (const l of linesRes.recordset) {
            const itemRes = await new sql.Request(tx).input('i', sql.Int, l.PaintItemID)
                .query('SELECT StockQty, AvgCost FROM paint_Item WITH (UPDLOCK, HOLDLOCK) WHERE PaintItemID=@i');
            if (!itemRes.recordset.length) throw new Error(`Paint item ${l.PaintItemID} not found.`);
            const oldQty   = Number(itemRes.recordset[0].StockQty) || 0;
            const oldAvg   = Number(itemRes.recordset[0].AvgCost) || 0;
            const oldVal   = oldQty * oldAvg;
            const inQty    = Number(l.Quantity);
            const inValue  = Number(l.LineTotal);   // includes GST + net of discount
            const newQty   = round4(oldQty + inQty);
            const newVal   = round2(oldVal + inValue);
            const newAvg   = newQty > 0 ? round4(newVal / newQty) : 0;

            await new sql.Request(tx)
                .input('i', sql.Int,           l.PaintItemID)
                .input('q', sql.Decimal(18,4), newQty)
                .input('a', sql.Decimal(18,4), newAvg)
                .query(`UPDATE paint_Item
                        SET StockQty=@q, AvgCost=@a, UpdatedAt=GETDATE()
                        WHERE PaintItemID=@i`);

            await new sql.Request(tx)
                .input('it',  sql.Int,           l.PaintItemID)
                .input('wh',  sql.Int,           g.PaintWHID)
                .input('src', sql.NVarChar(20),  'GRN')
                .input('sid', sql.Int,           id)
                .input('did', sql.Int,           l.PaintGRNDetailID)
                .input('dq',  sql.Decimal(18,4), inQty)
                .input('uc',  sql.Decimal(18,4), l.LandedUnitCost)
                .input('dv',  sql.Decimal(18,2), inValue)
                .input('rq',  sql.Decimal(18,4), newQty)
                .input('ra',  sql.Decimal(18,4), newAvg)
                .input('nt',  sql.NVarChar(200), `GRN ${g.GRNNo} finalized`)
                .input('cb',  sql.Int,           req.user?.userId || null)
                .input('cbn', sql.NVarChar(100), req.user?.userName || null)
                .query(`INSERT INTO paint_StockLedger
                            (PaintItemID, PaintWHID, SourceType, SourceDocID, SourceDetailID,
                             QuantityDelta, UnitCost, ValueDelta,
                             RunningQty, RunningAvgCost, Note, CreatedBy, CreatedByName)
                        VALUES (@it, @wh, @src, @sid, @did, @dq, @uc, @dv, @rq, @ra, @nt, @cb, @cbn)`);
        }

        // Post the GL voucher (inside the same tx).
        const voucher = await postPaintGRNVoucher(id, req.user, tx);

        await new sql.Request(tx)
            .input('id',  sql.Int, id)
            .input('vid', sql.Int, voucher ? voucher.voucherId : null)
            .input('fby', sql.Int, req.user?.userId || null)
            .input('fbn', sql.NVarChar(100), req.user?.userName || null)
            .query(`UPDATE paint_GRN
                    SET Status='Posted', VoucherID=@vid,
                        FinalizedBy=@fby, FinalizedByName=@fbn, FinalizedAt=GETDATE()
                    WHERE PaintGRNID=@id`);

        await tx.commit();
        res.json({ message: 'Paint GRN finalized', VoucherID: voucher?.voucherId || null, VoucherNo: voucher?.voucherNo || null });
    } catch (err) {
        try { await tx.rollback(); } catch (_) {}
        res.status(400).json({ error: err.message });
    }
};

// ─── Unfinalize: reverse voucher + roll back stock/avg ───────────
exports.unfinalize = async (req, res) => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const id = parseInt(req.params.id);
        const hdr = await new sql.Request(tx).input('id', sql.Int, id)
            .query('SELECT * FROM paint_GRN WITH (UPDLOCK, HOLDLOCK) WHERE PaintGRNID=@id');
        if (!hdr.recordset.length) throw new Error('Paint GRN not found.');
        const g = hdr.recordset[0];
        if (g.Status !== 'Posted') throw new Error(`Paint GRN is ${g.Status}, cannot unfinalize.`);

        // Refuse if any line has been returned via GRTN — the GRTN must be
        // unfinalized first so counts stay consistent.
        const usedRes = await new sql.Request(tx).input('id', sql.Int, id)
            .query(`SELECT SUM(ReturnedQty) AS r FROM paint_GRNDetail WHERE PaintGRNID=@id`);
        if ((Number(usedRes.recordset[0].r) || 0) > 0) {
            throw new Error('One or more lines on this GRN have been returned via a Paint GRTN. Reverse the GRTN before unfinalizing this GRN.');
        }

        const linesRes = await new sql.Request(tx).input('id', sql.Int, id)
            .query(`SELECT * FROM paint_GRNDetail WHERE PaintGRNID=@id`);

        for (const l of linesRes.recordset) {
            const itemRes = await new sql.Request(tx).input('i', sql.Int, l.PaintItemID)
                .query('SELECT StockQty, AvgCost FROM paint_Item WITH (UPDLOCK, HOLDLOCK) WHERE PaintItemID=@i');
            const oldQty = Number(itemRes.recordset[0].StockQty) || 0;
            const oldAvg = Number(itemRes.recordset[0].AvgCost) || 0;
            const oldVal = oldQty * oldAvg;
            const outQty = Number(l.Quantity);
            // Value removed uses the ORIGINAL landed cost from this GRN line
            // so the moving-avg cleanly rolls back regardless of what has
            // happened at the item level since (subsequent GRNs still shift
            // the avg — that's fine, we're just removing our contribution).
            const outValue = round2(outQty * Number(l.LandedUnitCost));
            const newQty   = round4(oldQty - outQty);
            if (newQty < 0) throw new Error(`Cannot unfinalize — item stock would go negative on paint item ${l.PaintItemID}.`);
            const newVal = round2(oldVal - outValue);
            const newAvg = newQty > 0 ? round4(Math.max(0, newVal) / newQty) : 0;

            await new sql.Request(tx)
                .input('i', sql.Int,           l.PaintItemID)
                .input('q', sql.Decimal(18,4), newQty)
                .input('a', sql.Decimal(18,4), newAvg)
                .query(`UPDATE paint_Item
                        SET StockQty=@q, AvgCost=@a, UpdatedAt=GETDATE()
                        WHERE PaintItemID=@i`);

            await new sql.Request(tx)
                .input('it',  sql.Int,           l.PaintItemID)
                .input('wh',  sql.Int,           g.PaintWHID)
                .input('src', sql.NVarChar(20),  'GRN')
                .input('sid', sql.Int,           id)
                .input('did', sql.Int,           l.PaintGRNDetailID)
                .input('dq',  sql.Decimal(18,4), -outQty)
                .input('uc',  sql.Decimal(18,4), l.LandedUnitCost)
                .input('dv',  sql.Decimal(18,2), -outValue)
                .input('rq',  sql.Decimal(18,4), newQty)
                .input('ra',  sql.Decimal(18,4), newAvg)
                .input('nt',  sql.NVarChar(200), `GRN ${g.GRNNo} unfinalized`)
                .input('cb',  sql.Int,           req.user?.userId || null)
                .input('cbn', sql.NVarChar(100), req.user?.userName || null)
                .query(`INSERT INTO paint_StockLedger
                            (PaintItemID, PaintWHID, SourceType, SourceDocID, SourceDetailID,
                             QuantityDelta, UnitCost, ValueDelta,
                             RunningQty, RunningAvgCost, Note, CreatedBy, CreatedByName)
                        VALUES (@it, @wh, @src, @sid, @did, @dq, @uc, @dv, @rq, @ra, @nt, @cb, @cbn)`);
        }

        if (g.VoucherID) {
            await postReversalVoucher(g.VoucherID, req.user, tx);
        }

        await new sql.Request(tx)
            .input('id',  sql.Int, id)
            .query(`UPDATE paint_GRN
                    SET Status='Draft',
                        VoucherID=NULL,
                        FinalizedBy=NULL, FinalizedByName=NULL, FinalizedAt=NULL
                    WHERE PaintGRNID=@id`);

        await tx.commit();
        res.json({ message: 'Paint GRN unfinalized and reverted to Draft.' });
    } catch (err) {
        try { await tx.rollback(); } catch (_) {}
        res.status(400).json({ error: err.message });
    }
};

// ─── Print-data — same shape as `get` but no permission narrowing here;
// route mounts it under the same view perm.
exports.printData = async (req, res) => {
    return exports.get(req, res);
};
