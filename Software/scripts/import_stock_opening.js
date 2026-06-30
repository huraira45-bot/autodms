/**
 * import_stock_opening.js
 *
 * Imports the spare-parts catalog + opening stock-on-hand from
 *   ../../stock report updated 2.xlsx
 *
 * The xlsx sheet is "Rate Update Log" with columns:
 *   Item No. | Item Name | Location | Closing Qty | New Purchase Rate | Total Value
 *
 * Items are grouped into category sections that end with a "XYZ TOTAL" footer
 * row (no Item No., the category name + word "TOTAL" sits in col 2). The
 * categories observed in the file are ACCESSORIES, BODY PARTS, MECHANICAL
 * PARTS, OIL & CHEMICAL, SUBLET PARTS.
 *
 * Steps:
 *   1. Read + parse the sheet, group items by category section.
 *   2. Create InventCategory rows for any missing categories.
 *   3. Create InventItems rows for every part — Number, ItenName, CategoryID,
 *      BinLocation, ItemPurchasePrice (sales price = 0), UOMId, WHID.
 *   4. Post a stock arrival (data_StockArrivalInfo + StockArrivalDetail)
 *      that puts the closing quantity on-hand for each item.
 *   5. Post a Journal Voucher (JV-OB-STOCK-NNNN) that Dr's INVENTORY_PARTS
 *      and Cr's CAPITAL ACCOUNT (301001001) for the total stock value, so
 *      the GL ties to the inventory subledger.
 *
 * Usage:
 *     node Software/scripts/import_stock_opening.js [--dry-run]
 */
const path = require('path');
const fs   = require('fs');
const xlsx = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');

const XLSX_PATH      = path.join(__dirname, '..', '..', 'stock report updated 2.xlsx');
const CAPITAL_CODE   = '301001001';   // owner-instructed plug account
const DRY            = process.argv.includes('--dry-run');

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const toNum = (v) => {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[, ]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
};

async function main() {
    if (!fs.existsSync(XLSX_PATH)) {
        console.error(`xlsx not found at ${XLSX_PATH}`);
        process.exit(1);
    }

    // ── 1. Parse spreadsheet ──────────────────────────────────────────────
    const wb = xlsx.readFile(XLSX_PATH);
    const ws = wb.Sheets[wb.SheetNames[0]];
    // Raw 2-D array so we can detect section footer rows.
    const matrix = xlsx.utils.sheet_to_json(ws, { defval: '', header: 1, raw: true });
    console.log(`Read ${matrix.length} rows from xlsx.`);

    const items = [];
    let currentBucket = [];
    const categoriesSeen = [];
    let totalQtyXlsx = 0, totalValXlsx = 0;

    for (let r = 0; r < matrix.length; r++) {
        const row = matrix[r] || [];
        const c1 = String(row[0] ?? '').trim();
        const c2 = String(row[1] ?? '').trim();
        const c3 = String(row[2] ?? '').trim();
        const c4 = toNum(row[3]);
        const c5 = toNum(row[4]);
        const c6 = toNum(row[5]);

        // Section footer? "XYZ TOTAL" in col 2, no item no.
        if (!c1 && /\bTOTAL\b/i.test(c2)) {
            // Assign every accumulated item to the category named in this footer.
            const catName = c2.replace(/\s*TOTAL\s*$/i, '').trim().toUpperCase();
            for (const it of currentBucket) it.category = catName;
            categoriesSeen.push({ name: catName, items: currentBucket.length, qty: c4, value: c6 });
            currentBucket = [];
            continue;
        }

        // Header row / blank separator — skip
        if (!c1 || c1.toLowerCase() === 'item no.' || c2.toLowerCase() === 'item name') continue;

        // Real item row
        const it = {
            itemNumber: c1,
            itemName:   c2,
            location:   c3,
            qty:        Number(c4) || 0,
            rate:       Number(c5) || 0,
            value:      Number(c6) || 0,
            category:   '',   // filled when we hit the next footer
        };
        currentBucket.push(it);
        items.push(it);
        totalQtyXlsx += it.qty;
        totalValXlsx += it.value;
    }

    // Anything still in the bucket after the last footer goes uncategorized
    if (currentBucket.length) {
        console.warn(`(!) ${currentBucket.length} items appear AFTER the last category footer — they will be UNCATEGORIZED.`);
    }

    console.log(`Parsed ${items.length} items across ${categoriesSeen.length} categories.`);
    console.log(`Spreadsheet totals — Qty: ${totalQtyXlsx.toLocaleString()}, Value: ${r2(totalValXlsx).toLocaleString()}`);
    console.log('Per-category:');
    for (const c of categoriesSeen) {
        console.log(`  ${c.name.padEnd(22)} items=${String(c.items).padStart(4)}  qty=${c.qty.toLocaleString()}  value=${r2(c.value).toLocaleString()}`);
    }

    if (!items.length) { console.error('No items parsed.'); process.exit(2); }

    // ── 2. Load DB state ──────────────────────────────────────────────────
    const pool = await getPool();

    const catRes = await pool.request().query('SELECT CategoryID, CategoryName FROM InventCategory');
    const catByName = new Map(catRes.recordset.map(r => [String(r.CategoryName || '').toUpperCase(), r.CategoryID]));
    console.log(`COA / Categories — existing: ${catRes.recordset.length}`);

    const uomRes = await pool.request().query("SELECT TOP 1 UOMId FROM InventUOM ORDER BY UOMId");
    if (!uomRes.recordset.length) {
        console.error('No UOM rows exist. Create at least one UOM (e.g. PIECE) under Inventory Settings before importing.');
        process.exit(3);
    }
    const defaultUomId = uomRes.recordset[0].UOMId;

    const whRes = await pool.request().query("SELECT TOP 1 WHID FROM InventWareHouse WHERE ISNULL(InActive,0) = 0 ORDER BY WHID");
    if (!whRes.recordset.length) {
        console.error('No active warehouse exists. Create one first.');
        process.exit(4);
    }
    const whid = whRes.recordset[0].WHID;
    console.log(`Default UOM: ${defaultUomId}  ·  Warehouse: ${whid}`);

    // Find INVENTORY_PARTS system-account GL
    const sysRes = await pool.request().input('rk', sql.NVarChar(50), 'INVENTORY_PARTS')
        .query('SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey=@rk');
    if (!sysRes.recordset.length) {
        console.error('INVENTORY_PARTS system-account role is not mapped. Go to Settings → Accounting Setup and pick the parts inventory GL.');
        process.exit(5);
    }
    const inventoryPartsGLCAID = sysRes.recordset[0].GLCAID;

    const capRes = await pool.request().input('code', sql.NVarChar(50), CAPITAL_CODE)
        .query('SELECT GLCAID FROM GLChartOFAccount WHERE GLCode=@code');
    if (!capRes.recordset.length) { console.error(`Capital plug GL ${CAPITAL_CODE} not found in COA.`); process.exit(6); }
    const capitalGLCAID = capRes.recordset[0].GLCAID;

    // ── 3. Plan summary ───────────────────────────────────────────────────
    const newCats = [...new Set(items.map(i => i.category).filter(Boolean))]
        .filter(name => !catByName.has(name));
    console.log('--- Plan ---');
    console.log(`  Create ${newCats.length} new InventCategory rows:`);
    for (const n of newCats) console.log(`     + ${n}`);
    console.log(`  Create ${items.length} InventItems`);
    console.log(`  Post 1 stock-arrival voucher with ${items.length} detail lines (qty + rate)`);
    console.log(`  Post 1 opening JV: Dr INVENTORY_PARTS (${inventoryPartsGLCAID}) / Cr CAPITAL ${CAPITAL_CODE}  total ${r2(totalValXlsx).toLocaleString()}`);

    if (DRY) {
        console.log('--- DRY RUN — exiting without DB writes ---');
        // Show 3 sample mapped items so the user can sanity-check
        console.log('First 3 parsed items:');
        for (const it of items.slice(0, 3)) {
            console.log(`  cat=${it.category || '(none)'}  no=${it.itemNumber}  name=${it.itemName.slice(0, 30)}  loc=${it.location}  qty=${it.qty}  rate=${it.rate}`);
        }
        process.exit(0);
    }

    // ── 4. Run everything in one transaction ──────────────────────────────
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // 4a. Create missing categories
        for (const name of newCats) {
            const ins = await new sql.Request(tx)
                .input('n', sql.NVarChar(200), name)
                .query("INSERT INTO InventCategory (CategoryName, CompanyID) OUTPUT INSERTED.CategoryID VALUES (@n, 1)");
            catByName.set(name, ins.recordset[0].CategoryID);
        }
        console.log(`Created ${newCats.length} categories.`);

        // 4b. Insert items + map item-number to new ItemId
        const itemIds = [];
        for (const it of items) {
            const catId = it.category ? catByName.get(it.category) : null;
            const ins = await new sql.Request(tx)
                .input('cat', sql.Int, catId)
                .input('inum', sql.BigInt, /^\d+$/.test(it.itemNumber) ? Number(it.itemNumber) : null)
                .input('manual', sql.NVarChar(100), it.itemNumber)
                .input('nm',  sql.NVarChar(200), it.itemName)
                .input('uom', sql.Int, defaultUomId)
                .input('sp',  sql.Decimal(18,2), 0)
                .input('pp',  sql.Decimal(18,2), it.rate)
                .input('wh',  sql.Int, whid)
                .input('bin', sql.NVarChar(50), it.location || null)
                .input('wr',  sql.Numeric(18,4), it.rate)
                .query(`INSERT INTO InventItems
                            (CategoryID, ItemNumber, ManualNumber, ItenName, UOMId,
                             ItemSalesPrice, ItemPurchasePrice, WHID, BinLocation,
                             WeightedRate, ItemType, ItemStatus, CompanyID)
                        OUTPUT INSERTED.ItemId
                        VALUES (@cat, @inum, @manual, @nm, @uom,
                                @sp, @pp, @wh, @bin,
                                @wr, 'Part', 1, 1)`);
            itemIds.push({ ...it, itemId: ins.recordset[0].ItemId });
        }
        console.log(`Created ${itemIds.length} InventItems.`);

        // 4c. Stock arrival — one master doc + one detail row per item.
        const arrNoRes = await new sql.Request(tx)
            .query("SELECT ISNULL(MAX(ArrivalNo), 0) + 1 AS NextNo FROM data_StockArrivalInfo");
        const arrivalNo = arrNoRes.recordset[0].NextNo;
        const arrIns = await new sql.Request(tx)
            .input('no',  sql.Int,      arrivalNo)
            .input('dt',  sql.DateTime, new Date())
            .input('wh',  sql.Int,      whid)
            .input('cid', sql.Int,      1)
            .input('rem', sql.NVarChar(sql.MAX), 'Opening stock import from stock report updated 2.xlsx')
            .input('mn',  sql.NVarChar(50), 'OPEN-STK-01')
            .query(`INSERT INTO data_StockArrivalInfo
                        (ArrivalNo, ArrivalDate, ArrivalToWHID, CompanyID, isManual, Remarks, ManualNo, EntryUserDateTime)
                    OUTPUT INSERTED.ArrivalID
                    VALUES (@no, @dt, @wh, @cid, 1, @rem, @mn, GETDATE())`);
        const arrivalId = arrIns.recordset[0].ArrivalID;

        for (const it of itemIds) {
            if (it.qty <= 0) continue;
            await new sql.Request(tx)
                .input('aid', sql.Int,            arrivalId)
                .input('iid', sql.Int,            it.itemId)
                .input('qty', sql.Numeric(18,3),  it.qty)
                .input('rt',  sql.Numeric(18,2),  it.rate)
                .query(`INSERT INTO data_StockArrivalDetail (ArrivalID, ItemId, Quantity, StockRate)
                        VALUES (@aid, @iid, @qty, @rt)`);
        }
        console.log(`Stock arrival ${arrivalNo} posted with ${itemIds.filter(i => i.qty > 0).length} lines.`);

        // 4d. Opening JV: Dr Inventory Parts / Cr Capital
        const totalValue = r2(itemIds.reduce((s, it) => s + (it.qty * it.rate), 0));
        // Use the recomputed value (Σ qty × rate) so we tie to what the stock
        // arrival actually inserted, not to the xlsx "Total Value" column (which
        // can carry rounding).
        const vt = await new sql.Request(tx).query("SELECT Voucherid FROM GLVoucherType WHERE Title='JV'");
        if (!vt.recordset.length) throw new Error('JV voucher type missing.');
        const vtId = vt.recordset[0].Voucherid;
        const seqRes = await new sql.Request(tx).query("SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo");
        const voucherNo = `JV-OB-STK-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

        const hdr = await new sql.Request(tx)
            .input('vd',      sql.DateTime,     new Date())
            .input('vno',     sql.NVarChar(50), voucherNo)
            .input('vtId',    sql.Int,          vtId)
            .input('remarks', sql.NVarChar(sql.MAX), 'Opening stock value — spare parts catalog (from xlsx)')
            .input('total',   sql.Decimal(18,2), totalValue)
            .input('src',     sql.NVarChar(20), 'VOUCHER')
            .input('cby',     sql.Int,          0)
            .input('cbyN',    sql.NVarChar(100),'import_stock_opening')
            .query(`INSERT INTO data_FinanceVoucherInfo
                        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                         Status, Posted, SourceDocType, CreatedBy, CreatedByName)
                    OUTPUT INSERTED.VoucherID
                    VALUES (@vd, @vno, @vtId, @remarks, @total,
                            'Draft', 0, @src, @cby, @cbyN)`);
        const voucherId = hdr.recordset[0].VoucherID;

        await new sql.Request(tx)
            .input('vid', sql.Int,           voucherId)
            .input('gl',  sql.Int,           inventoryPartsGLCAID)
            .input('nar', sql.NVarChar(sql.MAX), 'Opening stock — Spare parts inventory')
            .input('dr',  sql.Decimal(18,2), totalValue)
            .input('cr',  sql.Decimal(18,2), 0)
            .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                    VALUES (@vid, @gl, @nar, @dr, @cr)`);

        await new sql.Request(tx)
            .input('vid', sql.Int,           voucherId)
            .input('gl',  sql.Int,           capitalGLCAID)
            .input('nar', sql.NVarChar(sql.MAX), 'Opening stock value — capital adjustment (per owner)')
            .input('dr',  sql.Decimal(18,2), 0)
            .input('cr',  sql.Decimal(18,2), totalValue)
            .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                    VALUES (@vid, @gl, @nar, @dr, @cr)`);

        await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .query(`UPDATE data_FinanceVoucherInfo
                    SET Status='Posted', Posted=1, PostedBy=0, PostedAt=GETDATE()
                    WHERE VoucherID=@vid`);

        await tx.commit();
        console.log('-------------------------------------');
        console.log(`Stock arrival no:     ${arrivalNo}`);
        console.log(`Opening JV posted:    ${voucherNo}`);
        console.log(`Items created:        ${itemIds.length}`);
        console.log(`Total stock value:    Rs ${totalValue.toLocaleString()}`);
        process.exit(0);
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('FATAL — transaction rolled back:', err.message);
        process.exit(7);
    }
}

main().catch(err => { console.error(err); process.exit(99); });
