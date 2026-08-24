// v3: two things in one transaction.
//
// PART A — item-level AvgCost corrections (same rate-only, quantity-
// untouched method as v2) for 5 items never previously fixed:
//   233 STEEL PUTTEN (R-M)     -- two bad GRNs (#5, #10), never corrected
//   228 THINER LOCAL (R-M)     -- fixed once (08-07), re-broken by GRN#21
//   273 ULTIMATE POLISH        -- never corrected
//   274 WHITE KARVAAN 6846     -- never corrected (worst case, Rs8734/g)
//   276 Plastic primer 4300    -- never corrected
//
// PART B — a correcting JV for JC B&P-1111 (Job Card 1450). Its Paint
// Issue PI-0339 finalized and posted voucher JV-0706 (Dr Cost of Sold
// (Paint) 55,432.20 / Cr Paint Material Stock 55,432.20) BEFORE these
// items were corrected -- 6 of PI-0339's frozen lines used the wrong
// rate (NIPPON THINNER, 2K CLEAR, 2K HARDNER x2, THINER LOCAL, Plastic
// Primer 4300). Total overcharge = PKR 11,785.33 (computed by comparing
// each frozen paint_IssueDetail.IssueUnitCost against its correct rate).
// This reverses exactly that amount: Dr Paint Material Stock / Cr Cost
// of Sold (Paint), bringing the job's true paint COGS to 43,646.87.
// paint_IssueDetail rows themselves are NOT rewritten (going-forward
// only, per owner decision) -- this is a GL-level correction only.
//
// Run from Software/: node scripts\fix_paint_gram_mis_entries_v3_bp1111.js
require('dotenv').config();
const { sql, getPool } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

const ITEMS = [
    {
        label: 'STEEL PUTTEN (R-M)', paintItemID: 233, expectedCurrentAvg: 1.9767,
        preQty: 0, preAvg: 0, gramsPerUnit: 1000,
        badGrns: [{ qty: 16, rate: 530 }, { qty: 15.9999, rate: 530 }],
        note: 'Correction: PGRN-0005 + PGRN-0058 rate re-derived (32 cans total x Rs530, not 32g)',
    },
    {
        label: 'THINER LOCAL (R-M)', paintItemID: 228, expectedCurrentAvg: 1.4980,
        preQty: 3700.0001, preAvg: 0.4750, gramsPerUnit: 800,
        badGrns: [{ qty: 10, rate: 380 }],
        note: 'Correction: PGRN-0069 rate re-derived from pre-GRN baseline (10 cans x Rs380, not 10g)',
    },
    {
        label: 'ULTIMATE POLISH', paintItemID: 273, expectedCurrentAvg: 75.2944,
        preQty: 786, preAvg: 13.59, gramsPerUnit: 473,
        badGrns: [{ qty: 2, rate: 6400 }],
        note: 'Correction: PGRN-0061 rate re-derived from pre-GRN baseline (2 cans x Rs6400, not 2g)',
    },
    {
        label: 'WHITE KARVAAN 6846', paintItemID: 274, expectedCurrentAvg: 8734.6765,
        preQty: 0, preAvg: 0, gramsPerUnit: 4000,
        badGrns: [{ qty: 2, rate: 2200 }, { qty: 2, rate: 8800 }],
        note: 'Correction: PGRN-0064 + PGRN-0066 rate re-derived (4 cans total, not 4g) -- opening stock was already fully consumed before these GRNs',
    },
    {
        label: 'Plastic primer 4300', paintItemID: 276, expectedCurrentAvg: 53.2727,
        preQty: 101.9894, preAvg: 1.8931, gramsPerUnit: 900,
        badGrns: [{ qty: 3, rate: 1800 }],
        note: 'Correction: PGRN-0069 rate re-derived from pre-GRN baseline (3 cans x Rs1800, not 3g)',
    },
];

const COST_OF_SOLD_PAINT_GLCAID = 32809;
const PAINT_MATERIAL_STOCK_GLCAID = 32184;
const JOB_CARD_ID = 1450; // B&P-1111
const OVERCHARGE_AMOUNT = 11785.33;

(async () => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // ---- Part A: item-level rate corrections ----
        for (const it of ITEMS) {
            const row = (await new sql.Request(tx).input('id', sql.Int, it.paintItemID)
                .query('SELECT PaintCode, StockQty, AvgCost FROM paint_Item WITH (UPDLOCK, HOLDLOCK) WHERE PaintItemID=@id')).recordset[0];
            if (!row) throw new Error(`Paint item ${it.paintItemID} not found.`);
            const curQty = Number(row.StockQty);
            const curAvg = Number(row.AvgCost);
            if (Math.abs(curAvg - it.expectedCurrentAvg) > 0.02) {
                throw new Error(`${it.label} (${row.PaintCode}): AvgCost changed since diagnosis -- expected ${it.expectedCurrentAvg}, found ${curAvg}. Stopping.`);
            }

            let qty = it.preQty, val = it.preQty * it.preAvg;
            for (const g of it.badGrns) { qty += g.qty * it.gramsPerUnit; val += g.qty * g.rate; }
            const targetAvg = round4(val / qty);

            const whRes = await new sql.Request(tx).input('id', sql.Int, it.paintItemID)
                .query('SELECT TOP 1 PaintWHID FROM paint_StockLedger WHERE PaintItemID=@id ORDER BY LedgerID DESC');
            const whId = whRes.recordset[0]?.PaintWHID;
            if (!whId) throw new Error(`Could not resolve warehouse for item ${it.paintItemID}.`);

            const dVal = round2((targetAvg - curAvg) * curQty);
            await new sql.Request(tx)
                .input('it', sql.Int, it.paintItemID).input('wh', sql.Int, whId)
                .input('src', sql.NVarChar(20), 'ADJUSTMENT').input('dq', sql.Decimal(18,4), 0)
                .input('uc', sql.Decimal(18,4), targetAvg).input('dv', sql.Decimal(18,2), dVal)
                .input('rq', sql.Decimal(18,4), curQty).input('ra', sql.Decimal(18,4), targetAvg)
                .input('nt', sql.NVarChar(200), it.note)
                .query(`INSERT INTO paint_StockLedger (PaintItemID, PaintWHID, SourceType, QuantityDelta, UnitCost, ValueDelta, RunningQty, RunningAvgCost, Note)
                        VALUES (@it, @wh, @src, @dq, @uc, @dv, @rq, @ra, @nt)`);
            await new sql.Request(tx).input('id', sql.Int, it.paintItemID).input('a', sql.Decimal(18,4), targetAvg)
                .query(`UPDATE paint_Item SET AvgCost=@a, UpdatedAt=GETDATE() WHERE PaintItemID=@id`);
            console.log(`${it.label} (${row.PaintCode}): qty stays ${curQty}, AvgCost ${curAvg} -> ${targetAvg}`);
        }

        // ---- Part B: correcting JV for B&P-1111's overstated paint COGS ----
        const jcCheck = await new sql.Request(tx).input('id', sql.Int, JOB_CARD_ID)
            .query('SELECT JobCardNo, IsFinalized FROM Addata_JobCardInfo WHERE JobCardId=@id');
        if (!jcCheck.recordset.length) throw new Error('Job card 1450 not found.');
        if (!jcCheck.recordset[0].IsFinalized) throw new Error('JC 1450 is not finalized -- no GL correction needed, only the item-level fix above applies.');

        const already = await new sql.Request(tx).input('jc', sql.Int, JOB_CARD_ID)
            .query(`SELECT TOP 1 VoucherID FROM data_FinanceVoucherDetail WHERE JobCardID=@jc AND Narration LIKE 'Correction: PI-0339 paint cost overstated%'`);
        if (already.recordset.length) throw new Error(`Correction already posted (VoucherID ${already.recordset[0].VoucherID}).`);

        const vt = await new sql.Request(tx).query("SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='JV'");
        if (!vt.recordset.length) throw new Error('JV voucher type not found.');
        const voucherNo = await nextVoucherNo(tx, 'JV');
        const narration = `Correction: PI-0339 paint cost overstated on JC-B&P-1111 -- 6 lines (NIPPON THINNER, 2K CLEAR, 2K HARDNER x2, THINER LOCAL, Plastic Primer 4300) used gram-mis-entered rates before they were fixed. True COGS 43,646.87, posted 55,432.20.`;

        const hdr = await new sql.Request(tx)
            .input('vd', sql.DateTime, new Date()).input('vno', sql.NVarChar(50), voucherNo)
            .input('vt', sql.Int, vt.recordset[0].Voucherid).input('rem', sql.NVarChar(sql.MAX), narration)
            .input('tot', sql.Decimal(18,2), OVERCHARGE_AMOUNT).input('src', sql.NVarChar(50), 'VOUCHER')
            .query(`INSERT INTO data_FinanceVoucherInfo (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount, Status, Posted, SourceDocType)
                    OUTPUT INSERTED.VoucherID VALUES (@vd, @vno, @vt, @rem, @tot, 'Draft', 0, @src)`);
        const voucherId = hdr.recordset[0].VoucherID;

        await new sql.Request(tx).input('vid', sql.Int, voucherId).input('gl', sql.Int, PAINT_MATERIAL_STOCK_GLCAID)
            .input('nar', sql.NVarChar(sql.MAX), narration).input('dr', sql.Decimal(18,2), OVERCHARGE_AMOUNT).input('jc', sql.Int, JOB_CARD_ID)
            .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit, JobCardID) VALUES (@vid, @gl, @nar, @dr, 0, @jc)`);
        await new sql.Request(tx).input('vid', sql.Int, voucherId).input('gl', sql.Int, COST_OF_SOLD_PAINT_GLCAID)
            .input('nar', sql.NVarChar(sql.MAX), narration).input('cr', sql.Decimal(18,2), OVERCHARGE_AMOUNT).input('jc', sql.Int, JOB_CARD_ID)
            .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit, JobCardID) VALUES (@vid, @gl, @nar, 0, @cr, @jc)`);

        await new sql.Request(tx).input('vid', sql.Int, voucherId)
            .query(`UPDATE data_FinanceVoucherInfo SET Status='Posted', Posted=1, PostedAt=GETDATE() WHERE VoucherID=@vid`);

        await tx.commit();
        console.log(`\nPosted correcting JV ${voucherNo} (VoucherID ${voucherId}) for PKR ${OVERCHARGE_AMOUNT} -- Dr Paint Material Stock / Cr Cost of Sold (Paint). B&P-1111's paint COGS is now correctly 43,646.87.`);
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('FAILED:', err.message);
        process.exit(1);
    }
    process.exit(0);
})();
