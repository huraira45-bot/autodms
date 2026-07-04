/**
 * Paint GRTN — controller (Phase 2).
 *
 * Every line MUST reference a specific source Paint GRN detail row
 * (SourceGRNDetailID). The available return qty per line is capped by
 * (source.Quantity − source.ReturnedQty). The unit cost is snapshotted
 * from the source line's LandedUnitCost as OriginalUnitCost so the
 * reversal impact on the moving-average cost math is deterministic
 * even if the item has since been received/consumed again.
 *
 * Draft ↔ Posted state machine mirrors Paint GRN:
 *  - saveDraft is a full replace of the detail rows.
 *  - finalize: reduces stock (using OriginalUnitCost for the value delta),
 *    increments source.ReturnedQty, posts GL voucher.
 *  - unfinalize: mirror-reverses the voucher, restores stock, decrements
 *    source.ReturnedQty. Admin-only via routes.
 */
const { sql, getPool } = require('../config/db');
const { postPaintGRTNVoucher } = require('../services/paintGRTNPostingService');
const { postReversalVoucher }  = require('../services/voucherReversalService');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

// ─── List ────────────────────────────────────────────────────────
exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        const conds = ['1=1'];
        if (req.query.status) { rq.input('st', sql.NVarChar(20), req.query.status); conds.push('g.Status=@st'); }
        if (req.query.search) {
            rq.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push('(g.GRTNNo LIKE @q OR p.PartyName LIKE @q OR src.GRNNo LIKE @q)');
        }
        if (req.query.from) { rq.input('df', sql.Date, req.query.from); conds.push('g.GRTNDate >= @df'); }
        if (req.query.to)   { rq.input('dt', sql.Date, req.query.to);   conds.push('g.GRTNDate <= @dt'); }
        const r = await rq.query(`
            SELECT g.PaintGRTNID, g.GRTNNo, g.GRTNDate, g.Status,
                   g.PartyID, p.PartyName,
                   g.SourcePaintGRNID, src.GRNNo AS SourceGRNNo,
                   g.PaintWHID, w.WHDesc,
                   g.SubTotal, g.GSTTotal, g.GrandTotal,
                   g.VoucherID, g.CreatedByName, g.CreatedAt,
                   g.FinalizedByName, g.FinalizedAt
            FROM paint_GRTN g
            LEFT JOIN gen_PartiesInfo p    ON g.PartyID           = p.PartyID
            LEFT JOIN paint_GRN       src  ON g.SourcePaintGRNID  = src.PaintGRNID
            LEFT JOIN paint_Warehouse w    ON g.PaintWHID         = w.PaintWHID
            WHERE ${conds.join(' AND ')}
            ORDER BY g.PaintGRTNID DESC
        `);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Get single ──────────────────────────────────────────────────
exports.get = async (req, res) => {
    try {
        const pool = await getPool();
        const [hdr, lines] = await Promise.all([
            pool.request().input('id', sql.Int, req.params.id).query(`
                SELECT g.*, p.PartyName, w.WHDesc, w.WHCode,
                       src.GRNNo AS SourceGRNNo, src.GRNDate AS SourceGRNDate,
                       v.VoucherNo, v.Status AS VoucherStatus
                FROM paint_GRTN g
                LEFT JOIN gen_PartiesInfo p ON g.PartyID = p.PartyID
                LEFT JOIN paint_GRN src     ON g.SourcePaintGRNID = src.PaintGRNID
                LEFT JOIN paint_Warehouse w ON g.PaintWHID = w.PaintWHID
                LEFT JOIN data_FinanceVoucherInfo v ON g.VoucherID = v.VoucherID
                WHERE g.PaintGRTNID = @id`),
            pool.request().input('id', sql.Int, req.params.id).query(`
                SELECT d.*, pi.PaintCode, pi.PaintName, u.UOMName,
                       srcDet.Quantity AS SourceQty, srcDet.ReturnedQty AS SourceReturnedQty,
                       srcDet.LandedUnitCost AS SourceLandedUnitCost
                FROM paint_GRTNDetail d
                INNER JOIN paint_Item pi          ON d.PaintItemID       = pi.PaintItemID
                INNER JOIN paint_GRNDetail srcDet ON d.SourceGRNDetailID = srcDet.PaintGRNDetailID
                LEFT JOIN paint_UOM u             ON srcDet.PaintUOMID   = u.PaintUOMID
                WHERE d.PaintGRTNID = @id
                ORDER BY d.PaintGRTNDetailID`),
        ]);
        if (!hdr.recordset.length) return res.status(404).json({ error: 'Paint GRTN not found' });
        res.json({ ...hdr.recordset[0], Lines: lines.recordset });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Source Paint GRNs for a supplier: only Posted with returnable lines
exports.sourcesForSupplier = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('pid', sql.Int, parseInt(req.query.partyId))
            .query(`
                SELECT g.PaintGRNID, g.GRNNo, g.GRNDate, g.GrandTotal, g.PaintWHID, w.WHDesc,
                       SUM(d.Quantity - d.ReturnedQty) AS RemainingQty
                FROM paint_GRN g
                INNER JOIN paint_GRNDetail d ON g.PaintGRNID = d.PaintGRNID
                LEFT JOIN paint_Warehouse w  ON g.PaintWHID  = w.PaintWHID
                WHERE g.PartyID = @pid AND g.Status = 'Posted'
                GROUP BY g.PaintGRNID, g.GRNNo, g.GRNDate, g.GrandTotal, g.PaintWHID, w.WHDesc
                HAVING SUM(d.Quantity - d.ReturnedQty) > 0
                ORDER BY g.GRNDate DESC, g.PaintGRNID DESC`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Returnable lines from a source Paint GRN
exports.returnableLines = async (req, res) => {
    try {
        const pool = await getPool();
        // Optional: excludeGRTNID lets an edit-in-progress see the qty it
        // already booked as still returnable (so users can raise a return
        // qty on an existing Draft line).
        const excludeId = req.query.excludeGRTNID ? parseInt(req.query.excludeGRTNID) : null;
        const r = await pool.request()
            .input('src',  sql.Int, parseInt(req.params.sourceGrnId))
            .input('exId', sql.Int, excludeId)
            .query(`
                SELECT d.PaintGRNDetailID, d.PaintItemID, pi.PaintCode, pi.PaintName,
                       d.PaintUOMID, u.UOMName,
                       d.Quantity, d.LandedUnitCost, d.ReturnedQty,
                       -- Reserved by other Draft GRTNs (not us). Posted GRTNs
                       -- already show in ReturnedQty, so this only pulls Draft.
                       ISNULL((
                            SELECT SUM(gd.Quantity)
                            FROM paint_GRTNDetail gd
                            INNER JOIN paint_GRTN g ON gd.PaintGRTNID = g.PaintGRTNID
                            WHERE gd.SourceGRNDetailID = d.PaintGRNDetailID
                              AND g.Status = 'Draft'
                              AND (@exId IS NULL OR g.PaintGRTNID <> @exId)
                       ), 0) AS ReservedByOtherDrafts
                FROM paint_GRNDetail d
                INNER JOIN paint_Item pi  ON d.PaintItemID = pi.PaintItemID
                LEFT JOIN paint_UOM u     ON d.PaintUOMID  = u.PaintUOMID
                WHERE d.PaintGRNID = @src
                ORDER BY d.PaintGRNDetailID`);
        // Compute remaining server-side so client can't fudge it.
        const rows = r.recordset.map(x => ({
            ...x,
            Remaining: round4(Number(x.Quantity) - Number(x.ReturnedQty) - Number(x.ReservedByOtherDrafts)),
        })).filter(x => x.Remaining > 0.0001 || (excludeId != null)); // when editing, keep zero-remaining rows if excludeId, in case they were partially used
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Save (create/update Draft) ──────────────────────────────────
async function writeDraft({ pool, paintGRTNID, body, user }) {
    const { GRTNDate, PartyID, SourcePaintGRNID, PaintWHID, Remarks, Lines = [] } = body;
    if (!GRTNDate)         throw new Error('GRTNDate required');
    if (!PartyID)          throw new Error('PartyID required');
    if (!SourcePaintGRNID) throw new Error('SourcePaintGRNID required (each GRTN must reference a specific Paint GRN)');
    if (!PaintWHID)        throw new Error('PaintWHID required');
    if (!Array.isArray(Lines) || Lines.length === 0) throw new Error('At least one line required');

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // Verify source GRN is Posted + belongs to supplier + warehouse matches.
        const src = await new sql.Request(tx).input('sg', sql.Int, SourcePaintGRNID)
            .query('SELECT * FROM paint_GRN WHERE PaintGRNID=@sg');
        if (!src.recordset.length) throw new Error('Source Paint GRN not found.');
        const s = src.recordset[0];
        if (s.Status !== 'Posted')      throw new Error(`Source GRN ${s.GRNNo} is ${s.Status}. Only Posted GRNs can be returned against.`);
        if (s.PartyID !== Number(PartyID)) throw new Error(`Source GRN ${s.GRNNo} belongs to a different supplier.`);

        // Snap source detail rows for validation (qty cap + unit cost).
        const srcDetRes = await new sql.Request(tx).input('sg', sql.Int, SourcePaintGRNID)
            .query('SELECT * FROM paint_GRNDetail WITH (UPDLOCK, HOLDLOCK) WHERE PaintGRNID=@sg');
        const srcByDet = new Map(srcDetRes.recordset.map(d => [d.PaintGRNDetailID, d]));

        // If updating existing, also let the user KEEP whatever quantities
        // this Draft already had (so we don't double-count). Pull them so we
        // can subtract them from ReturnedQty when checking caps.
        let alreadyReservedByThis = new Map();
        if (paintGRTNID) {
            const cur = await new sql.Request(tx).input('id', sql.Int, paintGRTNID)
                .query('SELECT Status FROM paint_GRTN WITH (UPDLOCK, HOLDLOCK) WHERE PaintGRTNID=@id');
            if (!cur.recordset.length) throw new Error('Paint GRTN not found.');
            if (cur.recordset[0].Status !== 'Draft') throw new Error('Only Draft GRTNs can be edited.');
            const cd = await new sql.Request(tx).input('id', sql.Int, paintGRTNID)
                .query('SELECT SourceGRNDetailID, Quantity FROM paint_GRTNDetail WHERE PaintGRTNID=@id');
            for (const row of cd.recordset) {
                alreadyReservedByThis.set(row.SourceGRNDetailID,
                    (alreadyReservedByThis.get(row.SourceGRNDetailID) || 0) + Number(row.Quantity));
            }
        }

        // Validate + compute line totals.
        const computed = [];
        let subTotal = 0;
        for (const l of Lines) {
            if (!l.SourceGRNDetailID) throw new Error('Every line needs SourceGRNDetailID');
            const src = srcByDet.get(Number(l.SourceGRNDetailID));
            if (!src) throw new Error(`Source line #${l.SourceGRNDetailID} is not on the referenced GRN.`);
            const qty = round4(l.Quantity);
            if (!(qty > 0)) throw new Error(`Quantity for ${l.SourceGRNDetailID} must be > 0`);
            const cap = round4(Number(src.Quantity)
                - Number(src.ReturnedQty)
                + (alreadyReservedByThis.get(src.PaintGRNDetailID) || 0));
            if (qty - cap > 0.0001) throw new Error(`Return qty ${qty} exceeds remaining ${cap} on source line for ${src.PaintItemID}`);
            const unitCost = round4(src.LandedUnitCost);
            const lineTotal = round2(qty * unitCost);
            subTotal = round2(subTotal + lineTotal);
            computed.push({
                SourceGRNDetailID: src.PaintGRNDetailID,
                PaintItemID:       src.PaintItemID,
                Quantity:          qty,
                OriginalUnitCost:  unitCost,
                LineTotal:         lineTotal,
            });
        }
        // We snapshot GST from the source line's proportional GST for reporting only.
        // Simplification: GST portion is baked into OriginalUnitCost (which is
        // LandedUnitCost from source). So GSTTotal is 0 on GRTN — we're not
        // separately splitting it out on the return.
        const gstTotal   = 0;
        const grandTotal = subTotal;

        let id = paintGRTNID;
        if (id) {
            await new sql.Request(tx)
                .input('id',  sql.Int, id)
                .input('dt',  sql.Date, GRTNDate)
                .input('pid', sql.Int, PartyID)
                .input('sg',  sql.Int, SourcePaintGRNID)
                .input('wh',  sql.Int, PaintWHID)
                .input('rm',  sql.NVarChar(500), Remarks || null)
                .input('st',  sql.Decimal(18,2), subTotal)
                .input('gt',  sql.Decimal(18,2), gstTotal)
                .input('gr',  sql.Decimal(18,2), grandTotal)
                .query(`UPDATE paint_GRTN SET
                            GRTNDate=@dt, PartyID=@pid, SourcePaintGRNID=@sg, PaintWHID=@wh,
                            Remarks=@rm, SubTotal=@st, GSTTotal=@gt, GrandTotal=@gr
                        WHERE PaintGRTNID=@id`);
            await new sql.Request(tx).input('id', sql.Int, id)
                .query('DELETE FROM paint_GRTNDetail WHERE PaintGRTNID=@id');
        } else {
            const seq = await new sql.Request(tx).query('SELECT NEXT VALUE FOR dbo.seq_PaintGRTNNo AS n');
            const no  = `PGRTN-${String(seq.recordset[0].n).padStart(4, '0')}`;
            const ins = await new sql.Request(tx)
                .input('no',  sql.NVarChar(30), no)
                .input('dt',  sql.Date, GRTNDate)
                .input('pid', sql.Int, PartyID)
                .input('sg',  sql.Int, SourcePaintGRNID)
                .input('wh',  sql.Int, PaintWHID)
                .input('rm',  sql.NVarChar(500), Remarks || null)
                .input('st',  sql.Decimal(18,2), subTotal)
                .input('gt',  sql.Decimal(18,2), gstTotal)
                .input('gr',  sql.Decimal(18,2), grandTotal)
                .input('cby', sql.Int, user?.userId || null)
                .input('cbn', sql.NVarChar(100), user?.userName || null)
                .query(`INSERT INTO paint_GRTN
                            (GRTNNo, GRTNDate, PartyID, SourcePaintGRNID, PaintWHID, Remarks,
                             Status, SubTotal, GSTTotal, GrandTotal, CreatedBy, CreatedByName)
                        OUTPUT INSERTED.PaintGRTNID
                        VALUES (@no, @dt, @pid, @sg, @wh, @rm,
                                'Draft', @st, @gt, @gr, @cby, @cbn)`);
            id = ins.recordset[0].PaintGRTNID;
        }
        for (const c of computed) {
            await new sql.Request(tx)
                .input('h',   sql.Int,           id)
                .input('sd',  sql.Int,           c.SourceGRNDetailID)
                .input('it',  sql.Int,           c.PaintItemID)
                .input('q',   sql.Decimal(18,4), c.Quantity)
                .input('oc',  sql.Decimal(18,4), c.OriginalUnitCost)
                .input('lt',  sql.Decimal(18,2), c.LineTotal)
                .query(`INSERT INTO paint_GRTNDetail
                            (PaintGRTNID, SourceGRNDetailID, PaintItemID,
                             Quantity, OriginalUnitCost, LineTotal)
                        VALUES (@h, @sd, @it, @q, @oc, @lt)`);
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
        const id = await writeDraft({ pool, paintGRTNID: null, body: req.body, user: req.user });
        res.status(201).json({ PaintGRTNID: id });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.update = async (req, res) => {
    try {
        const pool = await getPool();
        await writeDraft({ pool, paintGRTNID: parseInt(req.params.id), body: req.body, user: req.user });
        res.json({ message: 'Paint GRTN updated' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.remove = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, req.params.id)
            .query('SELECT Status FROM paint_GRTN WHERE PaintGRTNID=@id');
        if (!r.recordset.length) return res.status(404).json({ error: 'Paint GRTN not found' });
        if (r.recordset[0].Status !== 'Draft') return res.status(423).json({ error: 'Only Draft rows can be deleted.' });
        await pool.request().input('id', sql.Int, req.params.id)
            .query('DELETE FROM paint_GRTN WHERE PaintGRTNID=@id');
        res.json({ message: 'Paint GRTN deleted' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ─── Finalize: stock down + voucher + source ReturnedQty++ ──────
exports.finalize = async (req, res) => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const id = parseInt(req.params.id);
        const hdrRes = await new sql.Request(tx).input('id', sql.Int, id)
            .query('SELECT * FROM paint_GRTN WITH (UPDLOCK, HOLDLOCK) WHERE PaintGRTNID=@id');
        if (!hdrRes.recordset.length) throw new Error('Paint GRTN not found.');
        const g = hdrRes.recordset[0];
        if (g.Status !== 'Draft') throw new Error(`Paint GRTN is already ${g.Status}.`);

        const lines = (await new sql.Request(tx).input('id', sql.Int, id)
            .query('SELECT * FROM paint_GRTNDetail WHERE PaintGRTNID=@id ORDER BY PaintGRTNDetailID')).recordset;
        if (!lines.length) throw new Error('Paint GRTN has no lines.');

        for (const l of lines) {
            // Re-check the cap under lock — nobody else could have consumed
            // the remainder between save and finalize.
            const src = await new sql.Request(tx).input('id', sql.Int, l.SourceGRNDetailID)
                .query('SELECT * FROM paint_GRNDetail WITH (UPDLOCK, HOLDLOCK) WHERE PaintGRNDetailID=@id');
            if (!src.recordset.length) throw new Error(`Source line ${l.SourceGRNDetailID} not found.`);
            const s = src.recordset[0];
            const cap = round4(Number(s.Quantity) - Number(s.ReturnedQty));
            if (Number(l.Quantity) - cap > 0.0001) {
                throw new Error(`Return qty ${l.Quantity} exceeds remaining ${cap} on source line ${l.SourceGRNDetailID}`);
            }

            // Reduce stock at OriginalUnitCost so the avg-cost math nets out.
            const itemRes = await new sql.Request(tx).input('i', sql.Int, l.PaintItemID)
                .query('SELECT StockQty, AvgCost FROM paint_Item WITH (UPDLOCK, HOLDLOCK) WHERE PaintItemID=@i');
            const oldQty = Number(itemRes.recordset[0].StockQty) || 0;
            const oldAvg = Number(itemRes.recordset[0].AvgCost) || 0;
            const outQty = Number(l.Quantity);
            const outVal = round2(outQty * Number(l.OriginalUnitCost));
            const newQty = round4(oldQty - outQty);
            if (newQty < 0) throw new Error(`Cannot return — stock would go negative on paint item ${l.PaintItemID}. Current on-hand: ${oldQty}.`);
            const newVal = round2(oldQty * oldAvg - outVal);
            const newAvg = newQty > 0 ? round4(Math.max(0, newVal) / newQty) : 0;

            await new sql.Request(tx)
                .input('i', sql.Int,           l.PaintItemID)
                .input('q', sql.Decimal(18,4), newQty)
                .input('a', sql.Decimal(18,4), newAvg)
                .query('UPDATE paint_Item SET StockQty=@q, AvgCost=@a, UpdatedAt=GETDATE() WHERE PaintItemID=@i');

            // Bump source.ReturnedQty
            await new sql.Request(tx)
                .input('id', sql.Int,           l.SourceGRNDetailID)
                .input('q',  sql.Decimal(18,4), Number(l.Quantity))
                .query('UPDATE paint_GRNDetail SET ReturnedQty = ReturnedQty + @q WHERE PaintGRNDetailID=@id');

            // Stock ledger
            await new sql.Request(tx)
                .input('it',  sql.Int,           l.PaintItemID)
                .input('wh',  sql.Int,           g.PaintWHID)
                .input('src', sql.NVarChar(20),  'GRTN')
                .input('sid', sql.Int,           id)
                .input('did', sql.Int,           l.PaintGRTNDetailID)
                .input('dq',  sql.Decimal(18,4), -outQty)
                .input('uc',  sql.Decimal(18,4), l.OriginalUnitCost)
                .input('dv',  sql.Decimal(18,2), -outVal)
                .input('rq',  sql.Decimal(18,4), newQty)
                .input('ra',  sql.Decimal(18,4), newAvg)
                .input('nt',  sql.NVarChar(200), `GRTN ${g.GRTNNo} finalized`)
                .input('cb',  sql.Int,           req.user?.userId || null)
                .input('cbn', sql.NVarChar(100), req.user?.userName || null)
                .query(`INSERT INTO paint_StockLedger
                            (PaintItemID, PaintWHID, SourceType, SourceDocID, SourceDetailID,
                             QuantityDelta, UnitCost, ValueDelta,
                             RunningQty, RunningAvgCost, Note, CreatedBy, CreatedByName)
                        VALUES (@it, @wh, @src, @sid, @did, @dq, @uc, @dv, @rq, @ra, @nt, @cb, @cbn)`);
        }

        const voucher = await postPaintGRTNVoucher(id, req.user, tx);

        await new sql.Request(tx)
            .input('id',  sql.Int, id)
            .input('vid', sql.Int, voucher ? voucher.voucherId : null)
            .input('fby', sql.Int, req.user?.userId || null)
            .input('fbn', sql.NVarChar(100), req.user?.userName || null)
            .query(`UPDATE paint_GRTN
                    SET Status='Posted', VoucherID=@vid,
                        FinalizedBy=@fby, FinalizedByName=@fbn, FinalizedAt=GETDATE()
                    WHERE PaintGRTNID=@id`);

        await tx.commit();
        res.json({ message: 'Paint GRTN finalized', VoucherID: voucher?.voucherId || null, VoucherNo: voucher?.voucherNo || null });
    } catch (err) {
        try { await tx.rollback(); } catch (_) {}
        res.status(400).json({ error: err.message });
    }
};

// ─── Unfinalize: reverse voucher + restore stock + decrement source ReturnedQty
exports.unfinalize = async (req, res) => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const id = parseInt(req.params.id);
        const hdrRes = await new sql.Request(tx).input('id', sql.Int, id)
            .query('SELECT * FROM paint_GRTN WITH (UPDLOCK, HOLDLOCK) WHERE PaintGRTNID=@id');
        if (!hdrRes.recordset.length) throw new Error('Paint GRTN not found.');
        const g = hdrRes.recordset[0];
        if (g.Status !== 'Posted') throw new Error(`Paint GRTN is ${g.Status}, cannot unfinalize.`);

        const lines = (await new sql.Request(tx).input('id', sql.Int, id)
            .query('SELECT * FROM paint_GRTNDetail WHERE PaintGRTNID=@id')).recordset;

        for (const l of lines) {
            // Put stock back at the ORIGINAL unit cost.
            const itemRes = await new sql.Request(tx).input('i', sql.Int, l.PaintItemID)
                .query('SELECT StockQty, AvgCost FROM paint_Item WITH (UPDLOCK, HOLDLOCK) WHERE PaintItemID=@i');
            const oldQty = Number(itemRes.recordset[0].StockQty) || 0;
            const oldAvg = Number(itemRes.recordset[0].AvgCost) || 0;
            const inQty  = Number(l.Quantity);
            const inVal  = round2(inQty * Number(l.OriginalUnitCost));
            const newQty = round4(oldQty + inQty);
            const newVal = round2(oldQty * oldAvg + inVal);
            const newAvg = newQty > 0 ? round4(newVal / newQty) : 0;

            await new sql.Request(tx)
                .input('i', sql.Int,           l.PaintItemID)
                .input('q', sql.Decimal(18,4), newQty)
                .input('a', sql.Decimal(18,4), newAvg)
                .query('UPDATE paint_Item SET StockQty=@q, AvgCost=@a, UpdatedAt=GETDATE() WHERE PaintItemID=@i');

            // Free the source's ReturnedQty.
            await new sql.Request(tx)
                .input('id', sql.Int,           l.SourceGRNDetailID)
                .input('q',  sql.Decimal(18,4), Number(l.Quantity))
                .query('UPDATE paint_GRNDetail SET ReturnedQty = ReturnedQty - @q WHERE PaintGRNDetailID=@id');

            await new sql.Request(tx)
                .input('it',  sql.Int,           l.PaintItemID)
                .input('wh',  sql.Int,           g.PaintWHID)
                .input('src', sql.NVarChar(20),  'GRTN')
                .input('sid', sql.Int,           id)
                .input('did', sql.Int,           l.PaintGRTNDetailID)
                .input('dq',  sql.Decimal(18,4), inQty)
                .input('uc',  sql.Decimal(18,4), l.OriginalUnitCost)
                .input('dv',  sql.Decimal(18,2), inVal)
                .input('rq',  sql.Decimal(18,4), newQty)
                .input('ra',  sql.Decimal(18,4), newAvg)
                .input('nt',  sql.NVarChar(200), `GRTN ${g.GRTNNo} unfinalized`)
                .input('cb',  sql.Int,           req.user?.userId || null)
                .input('cbn', sql.NVarChar(100), req.user?.userName || null)
                .query(`INSERT INTO paint_StockLedger
                            (PaintItemID, PaintWHID, SourceType, SourceDocID, SourceDetailID,
                             QuantityDelta, UnitCost, ValueDelta,
                             RunningQty, RunningAvgCost, Note, CreatedBy, CreatedByName)
                        VALUES (@it, @wh, @src, @sid, @did, @dq, @uc, @dv, @rq, @ra, @nt, @cb, @cbn)`);
        }

        if (g.VoucherID) await postReversalVoucher(g.VoucherID, req.user, tx);

        await new sql.Request(tx)
            .input('id', sql.Int, id)
            .query(`UPDATE paint_GRTN
                    SET Status='Draft', VoucherID=NULL,
                        FinalizedBy=NULL, FinalizedByName=NULL, FinalizedAt=NULL
                    WHERE PaintGRTNID=@id`);

        await tx.commit();
        res.json({ message: 'Paint GRTN unfinalized and reverted to Draft.' });
    } catch (err) {
        try { await tx.rollback(); } catch (_) {}
        res.status(400).json({ error: err.message });
    }
};

exports.printData = async (req, res) => exports.get(req, res);
