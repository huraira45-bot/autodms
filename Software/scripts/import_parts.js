/**
 * Bulk-import the parts catalog from the .xls files in C:\Users\ServerDeskop\Desktop\db1\parts.
 *
 * One XLS file per category — filename (sans extension) becomes the category name.
 * Each row maps to:
 *   Item Code     → InventItems.ItemNumber
 *   Item No.      → InventItems.ManualNumber
 *   Item Name     → InventItems.ItenName
 *   Location      → InventItems.Remarks (BinLocation)
 *   Stock Qty     → opening stock (data_StockArrivalDetail)
 *   Purchase Rate → InventItems.ItemPurchasePrice + WeightedRate + StockRate
 *
 * Categories are created (if missing) under InventCategory; matched by name.
 * Opening stock goes into one shared data_StockArrivalInfo row dated today
 * so the Inventory Valuation report picks it up as "QtyIn".
 *
 * Idempotent: rows whose ItemNumber already exists are skipped.
 *
 *   node Software/scripts/import_parts.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { sql, getPool } = require('../config/db');

const PARTS_DIR = 'c:/Users/ServerDeskop/Desktop/db1/parts';
const DEFAULT_WHID = 3;    // "Master" warehouse — the only one that exists post-wipe
const DEFAULT_UOM  = 1;

const trim = (s) => String(s ?? '').trim();

async function getOrCreateCategory(pool, name) {
    const ex = await pool.request()
        .input('n', sql.NVarChar(100), name)
        .query('SELECT TOP 1 CategoryID FROM InventCategory WHERE CategoryName = @n');
    if (ex.recordset.length) return ex.recordset[0].CategoryID;
    const ins = await pool.request()
        .input('n', sql.NVarChar(100), name)
        .query(`INSERT INTO InventCategory (CategoryName, ItemNature, CompanyID)
                OUTPUT INSERTED.CategoryID
                VALUES (@n, 0, 1)`);
    return ins.recordset[0].CategoryID;
}

async function main() {
    const files = fs.readdirSync(PARTS_DIR).filter(f => /\.xls?$/i.test(f));
    console.log(`Found ${files.length} part files in ${PARTS_DIR}:`, files.join(', '));

    const pool = await getPool();

    // One shared "opening stock" arrival header (today's date) for all imports.
    // ArrivalID is an IDENTITY column — let SQL Server assign it.
    const hdrRes = await pool.request()
        .input('date', sql.DateTime, new Date())
        .input('rem',  sql.NVarChar(200), 'Opening stock — parts catalog import')
        .input('fid',  sql.Int, 3)
        .input('wh',   sql.Int, DEFAULT_WHID)
        .query(`INSERT INTO data_StockArrivalInfo
                (EntryUserDateTime, ArrivalDate, CompanyID, FiscalID, ArrivalToWHID, ToBranchID, IsTaxable, Remarks)
                OUTPUT INSERTED.ArrivalID
                VALUES (GETDATE(), @date, 1, @fid, @wh, 1, 0, @rem)`);
    const arrivalId = hdrRes.recordset[0].ArrivalID;
    console.log(`Created opening-stock arrival header ArrivalID=${arrivalId}`);

    let totalInserted = 0, totalSkipped = 0, totalErrors = 0;
    const summary = [];

    for (const file of files) {
        const categoryName = path.basename(file, path.extname(file));
        const wb = XLSX.readFile(path.join(PARTS_DIR, file));
        const sh = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });

        const dataRows = rows.slice(2).filter(r => trim(r[0]) && trim(r[2])); // need code + name
        console.log(`\n--- ${file} (${dataRows.length} data rows) ---`);

        const catId = await getOrCreateCategory(pool, categoryName);
        console.log(`  CategoryID=${catId}  "${categoryName}"`);

        let inserted = 0, skipped = 0, errors = 0;
        for (const r of dataRows) {
            const itemCode  = trim(r[0]);
            const itemNo    = trim(r[1]);
            const name      = trim(r[2]).replace(/\s+/g, ' ');
            const location  = trim(r[3]);
            const stockQty  = Number(r[4]) || 0;
            const rate      = Number(r[5]) || 0;

            try {
                const dup = await pool.request()
                    .input('n', sql.BigInt, parseInt(itemCode))
                    .query('SELECT TOP 1 ItemId FROM InventItems WHERE ItemNumber = @n');
                if (dup.recordset.length) { skipped++; continue; }

                const ins = await pool.request()
                    .input('ItenName',          sql.NVarChar(200), name)
                    .input('ItemNumber',        sql.BigInt,        parseInt(itemCode))
                    .input('ManualNumber',      sql.NVarChar(100), itemNo || null)
                    .input('Remarks',           sql.NVarChar(sql.MAX), location || null)
                    .input('ItemSalesPrice',    sql.Decimal(18,2), rate)
                    .input('ItemPurchasePrice', sql.Decimal(18,2), rate)
                    .input('WeightedRate',      sql.Decimal(18,5), rate)
                    .input('UOMId',             sql.Int, DEFAULT_UOM)
                    .input('CategoryID',        sql.Int, catId)
                    .input('WHID',              sql.Int, DEFAULT_WHID)
                    .input('ItemType',          sql.VarChar(50), 'Part')
                    .input('ItemStatus',        sql.Bit, 1)
                    .input('CompanyID',         sql.Int, 1)
                    .input('CartonSize',        sql.Decimal(18,2), 0)
                    .input('IsQuotation',       sql.Bit, 0)
                    .query(`INSERT INTO InventItems (
                                ItenName, ItemNumber, ManualNumber, Remarks,
                                ItemSalesPrice, ItemPurchasePrice, WeightedRate,
                                UOMId, CategoryID, WHID, ItemType, ItemStatus,
                                CompanyID, CartonSize, IsQuotation, MaintainInventory
                            ) OUTPUT INSERTED.ItemId
                              VALUES (
                                @ItenName, @ItemNumber, @ManualNumber, @Remarks,
                                @ItemSalesPrice, @ItemPurchasePrice, @WeightedRate,
                                @UOMId, @CategoryID, @WHID, @ItemType, @ItemStatus,
                                @CompanyID, @CartonSize, @IsQuotation, 1
                            )`);
                const newItemId = ins.recordset[0].ItemId;

                // Opening stock — only if qty > 0
                if (stockQty > 0) {
                    await pool.request()
                        .input('aid', sql.Int, arrivalId)
                        .input('iid', sql.Int, newItemId)
                        .input('qty', sql.Decimal(18,2), stockQty)
                        .input('rate', sql.Decimal(18,2), rate)
                        .query(`INSERT INTO data_StockArrivalDetail (ArrivalID, ItemId, Quantity, StockRate)
                                VALUES (@aid, @iid, @qty, @rate)`);
                }
                inserted++;
            } catch (err) {
                errors++;
                console.error(`  ✗ ${itemCode} ${name}: ${err.message}`);
            }
        }
        console.log(`  → inserted=${inserted} skipped=${skipped} errors=${errors}`);
        summary.push({ Category: categoryName, Inserted: inserted, Skipped: skipped, Errors: errors });
        totalInserted += inserted; totalSkipped += skipped; totalErrors += errors;
    }

    console.log('\n=== Summary ===');
    console.table(summary);
    console.log(`TOTAL: inserted=${totalInserted}  skipped=${totalSkipped}  errors=${totalErrors}`);

    const final = await pool.request().query(`
        SELECT 'Parts'    AS T, COUNT(*) AS N FROM InventItems WHERE ItemType='Part'
        UNION ALL SELECT 'Services',   COUNT(*) FROM InventItems WHERE ItemType='Service'
        UNION ALL SELECT 'Categories', COUNT(*) FROM InventCategory
        UNION ALL SELECT 'Opening-stock rows', COUNT(*) FROM data_StockArrivalDetail
        UNION ALL SELECT 'Total stock units', SUM(Quantity) FROM data_StockArrivalDetail;
    `);
    console.table(final.recordset);
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
