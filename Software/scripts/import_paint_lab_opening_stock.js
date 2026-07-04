/**
 * One-off importer for Paint Lab opening stock from
 * C:\Users\ServerDeskop\Desktop\db1\paint\paintlabitem.xlsx (128 rows).
 *
 * What it does:
 *  1. Ensures a "Gram" UOM exists on paint_UOM (added with Scale 0.001).
 *  2. For each row inserts a paint_Item with PaintCode / PaintName /
 *     PaintUOMID = Gram / StockQty (grams) / AvgCost (per-gram Pur Rate).
 *     PaintCode = Item No. if present, else the numeric Item Code
 *     (per owner ask 2026-07-05). Rows whose code already exists are
 *     skipped so re-runs are idempotent.
 *  3. Posts ONE opening-balance JV dated 2026-06-27:
 *        Dr  PAINT_INVENTORY   <sum(qty * rate)>
 *        Cr  Capital (301001001) <same>
 *     JV number pulled from seq_Voucher_JV via nextVoucherNo() so the JV
 *     sequence stays monotonic.
 *
 * DRY RUN:  node scripts\import_paint_lab_opening_stock.js
 * COMMIT:   node scripts\import_paint_lab_opening_stock.js --commit
 *
 * Constant to override if you rerun with a different date/GL/xlsx path:
 *   XLSX_PATH, OPENING_DATE, CAPITAL_GLCODE.
 */
require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const { sql, getPool } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');

// ── Tunables ────────────────────────────────────────────────
// Pass the xlsx path as the first non-flag argument; falls back to the dev path.
// e.g. on live:  node scripts\import_paint_lab_opening_stock.js "D:\paint\paintlabitem.xlsx"
const XLSX_PATH      = process.argv.find(a => a.endsWith('.xlsx'))
    || 'C:/Users/ServerDeskop/Desktop/db1/paint/paintlabitem.xlsx';
const OPENING_DATE   = '2026-06-27';        // date printed at the top of the xlsx
const GRAM_UOM_NAME  = 'Gram';
const CAPITAL_GLCODE = '301001001';         // Capital account (owner's earlier ref)
const COMMIT         = process.argv.includes('--commit');
const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
    const pool = await getPool();
    console.log(`\nMode: ${COMMIT ? 'COMMIT (writes will happen)' : 'DRY RUN (no writes)'}\n`);

    // ── 1. Read xlsx ────────────────────────────────────────
    if (!require('fs').existsSync(XLSX_PATH)) {
        console.error(`xlsx not found at ${XLSX_PATH}`);
        process.exit(1);
    }
    const wb = XLSX.readFile(XLSX_PATH);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Rows 0 = title, 1 = column headers, 2+ = data
    const items = [];
    for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[0]) continue;
        const itemCode = String(r[0]).trim();
        const itemNo   = r[1] ? String(r[1]).trim() : '';
        const itemName = r[2] ? String(r[2]).trim() : '';
        const qty      = Number(r[3]) || 0;
        const rate     = Number(r[4]) || 0;
        if (!itemName) continue;
        const paintCode = itemNo || itemCode;    // fallback per owner ask
        items.push({ paintCode, itemName, qty, rate });
    }
    const totalValue = items.reduce((a, x) => a + x.qty * x.rate, 0);
    console.log(`  Parsed ${items.length} valid rows from xlsx.`);
    console.log(`  Total stock value: PKR ${fmt(totalValue)}\n`);

    // ── 2. Resolve UOM + GL accounts ────────────────────────
    // Gram UOM
    let uomId = (await pool.request()
        .input('n', sql.NVarChar(50), GRAM_UOM_NAME)
        .query(`SELECT PaintUOMID FROM paint_UOM WHERE UOMName=@n`))
        .recordset[0]?.PaintUOMID;
    if (!uomId) {
        if (COMMIT) {
            const ins = await pool.request()
                .input('n', sql.NVarChar(50), GRAM_UOM_NAME)
                .input('s', sql.Decimal(18,4), 0.001)
                .query(`INSERT INTO paint_UOM (UOMName, Scale)
                        OUTPUT INSERTED.PaintUOMID VALUES (@n, @s)`);
            uomId = ins.recordset[0].PaintUOMID;
            console.log(`  ✓ Created "${GRAM_UOM_NAME}" UOM (PaintUOMID=${uomId}, Scale=0.001).`);
        } else {
            console.log(`  → "${GRAM_UOM_NAME}" UOM does not exist; will be created on --commit.`);
        }
    } else {
        console.log(`  "${GRAM_UOM_NAME}" UOM already exists (PaintUOMID=${uomId}).`);
    }

    // PAINT_INVENTORY role
    const paintInvGL = (await pool.request().query(
        `SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='PAINT_INVENTORY'`
    )).recordset[0]?.GLCAID;
    if (!paintInvGL) {
        console.error(`  ✗ PAINT_INVENTORY not mapped in Accounting Setup. Map it before --commit.`);
        if (COMMIT) process.exit(1);
    } else {
        console.log(`  PAINT_INVENTORY GLCAID=${paintInvGL}`);
    }

    // Capital account (by GLCode)
    const capital = (await pool.request()
        .input('c', sql.NVarChar(50), CAPITAL_GLCODE)
        .query(`SELECT GLCAID, GLCode, GLTitle FROM GLChartOFAccount WHERE GLCode=@c`))
        .recordset[0];
    if (!capital) {
        console.error(`  ✗ Capital account (GLCode=${CAPITAL_GLCODE}) not found in COA.`);
        if (COMMIT) process.exit(1);
    } else {
        console.log(`  Capital: ${capital.GLCode} ${capital.GLTitle} (GLCAID=${capital.GLCAID})`);
    }

    // ── 3. Existing item codes so we skip duplicates on re-run ──
    const existing = new Set((await pool.request().query(
        `SELECT PaintCode FROM paint_Item`
    )).recordset.map(r => r.PaintCode.toUpperCase()));

    const toInsert = items.filter(x => !existing.has(x.paintCode.toUpperCase()));
    const toSkip   = items.length - toInsert.length;
    console.log(`\n  ${toInsert.length} items will be inserted; ${toSkip} already exist (skipped).\n`);

    // Preview first few
    console.log(`  Preview:`);
    console.log(`  ${'PaintCode'.padEnd(24)} ${'Item Name'.padEnd(38)} ${'Qty (g)'.padStart(12)} ${'Rate/g'.padStart(10)} ${'Value'.padStart(14)}`);
    for (const x of toInsert.slice(0, 10)) {
        console.log(`  ${x.paintCode.padEnd(24)} ${x.itemName.slice(0, 38).padEnd(38)} ${fmt(x.qty).padStart(12)} ${fmt(x.rate).padStart(10)} ${fmt(x.qty*x.rate).padStart(14)}`);
    }
    if (toInsert.length > 10) console.log(`  … and ${toInsert.length - 10} more.`);

    const openingValue = toInsert.reduce((a, x) => a + x.qty * x.rate, 0);
    console.log(`\n  Opening JV amount (only NEW items): PKR ${fmt(openingValue)}`);

    if (!COMMIT) {
        console.log(`\nDRY RUN complete. To actually import, re-run with --commit:`);
        console.log(`  node scripts\\import_paint_lab_opening_stock.js --commit\n`);
        process.exit(0);
    }

    // ── 4. Insert items ────────────────────────────────────
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        let inserted = 0;
        for (const it of toInsert) {
            await new sql.Request(tx)
                .input('code', sql.NVarChar(50),  it.paintCode)
                .input('name', sql.NVarChar(200), it.itemName)
                .input('uom',  sql.Int,           uomId)
                .input('q',    sql.Decimal(18,4), it.qty)
                .input('r',    sql.Decimal(18,4), it.rate)
                .query(`INSERT INTO paint_Item
                            (PaintCode, PaintName, PaintUOMID,
                             GSTDefaultOn, IsActive, StockQty, AvgCost)
                        VALUES (@code, @name, @uom, 1, 1, @q, @r)`);
            inserted++;
        }
        console.log(`\n  ✓ Inserted ${inserted} paint_Item rows.`);

        // ── 5. Opening JV ──────────────────────────────────
        if (openingValue > 0.01) {
            const vt = await new sql.Request(tx).query(
                `SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='JV' ORDER BY Voucherid`);
            const vtId = vt.recordset[0].Voucherid;
            const voucherNo = await nextVoucherNo(tx, 'JV');
            const narration = `Paint Lab opening stock — ${toInsert.length} items @ ${OPENING_DATE}`;

            // SourceDocType left NULL — pure journal voucher, no source doc.
            // The CK_VoucherInfo_SourceDocType whitelist doesn't accept
            // arbitrary values so we avoid it entirely for opening entries.
            const hdr = await new sql.Request(tx)
                .input('vd',   sql.DateTime,          new Date(OPENING_DATE + 'T12:00:00'))
                .input('vno',  sql.NVarChar(50),      voucherNo)
                .input('vtId', sql.Int,               vtId)
                .input('rem',  sql.NVarChar(sql.MAX), narration)
                .input('tot',  sql.Decimal(18,2),     openingValue)
                .input('cbn',  sql.NVarChar(100),     'system-paint-opening-stock')
                .query(`INSERT INTO data_FinanceVoucherInfo
                            (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                             Status, Posted, CreatedByName)
                        OUTPUT INSERTED.VoucherID
                        VALUES (@vd, @vno, @vtId, @rem, @tot,
                                'Draft', 0, @cbn)`);
            const vid = hdr.recordset[0].VoucherID;

            await new sql.Request(tx)
                .input('vid', sql.Int, vid)
                .input('gl',  sql.Int, paintInvGL)
                .input('nar', sql.NVarChar(sql.MAX), 'Paint Lab opening stock — Dr Paint Inventory')
                .input('dr',  sql.Decimal(18,2), openingValue)
                .query(`INSERT INTO data_FinanceVoucherDetail
                            (VoucherID, GLCAID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @nar, @dr, 0)`);
            await new sql.Request(tx)
                .input('vid', sql.Int, vid)
                .input('gl',  sql.Int, capital.GLCAID)
                .input('nar', sql.NVarChar(sql.MAX), 'Paint Lab opening stock — Cr Capital')
                .input('cr',  sql.Decimal(18,2), openingValue)
                .query(`INSERT INTO data_FinanceVoucherDetail
                            (VoucherID, GLCAID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @nar, 0, @cr)`);

            await new sql.Request(tx)
                .input('vid', sql.Int, vid)
                .query(`UPDATE data_FinanceVoucherInfo
                        SET Status='Posted', Posted=1, PostedAt=GETDATE()
                        WHERE VoucherID=@vid`);
            console.log(`  ✓ Posted opening JV ${voucherNo} for PKR ${fmt(openingValue)}.`);
        }

        await tx.commit();
        console.log(`\nDone.\n`);
        process.exit(0);
    } catch (e) {
        try { await tx.rollback(); } catch {}
        console.error(`\n  ✗ FAILED: ${e.message}`);
        process.exit(1);
    }
})().catch((e) => { console.error('import failed:', e.message); process.exit(1); });
