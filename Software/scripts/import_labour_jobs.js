/**
 * One-shot importer for the GR labour catalog (jobs.csv).
 *
 * Per the user's instruction "these all gr jobs", every row imports under
 * JobTypeID = 1 (GR — General Repair). Source CSV's DepartmentID and
 * VariantID columns are stored in Remarks so the data isn't lost.
 *
 * Schema mapping:
 *   CSV.ID         → InventItems.ItemNumber
 *   CSV.Name       → InventItems.ItenName
 *   CSV.Rate       → InventItems.ItemSalesPrice
 *   CSV.JobTime    → Remarks "dept=X var=Y time=Z"
 *   ItemType       = 'Service'
 *   JobTypeID      = 1 (GR)
 *   UOMId          = 1
 *   ItemStatus     = 1
 *
 * Idempotent — skips rows whose ItemNumber already exists.
 *
 *   node Software/scripts/import_labour_jobs.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { sql, getPool } = require('../config/db');

const SOURCE        = 'c:/Users/ServerDeskop/Desktop/db1/jobs.csv';
const DEFAULT_JOB_TYPE = 1;  // GR
const DEFAULT_UOM      = 1;

function parseCSV(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    const parseRow = (l) => {
        const out = []; let cur = ''; let inQ = false;
        for (let i = 0; i < l.length; i++) {
            const c = l[i];
            if (c === '"') {
                if (inQ && l[i + 1] === '"') { cur += '"'; i++; }
                else { inQ = !inQ; }
            } else if (c === ',' && !inQ) {
                out.push(cur); cur = '';
            } else { cur += c; }
        }
        out.push(cur);
        return out;
    };
    return lines.slice(1).map(parseRow);
}

async function main() {
    const text = fs.readFileSync(SOURCE, 'utf8');
    const rows = parseCSV(text);
    console.log(`Read ${rows.length} rows from ${SOURCE}`);

    // Dedupe by ID, keeping first occurrence (legacy CSV has 4 dupes)
    const seen = new Set();
    const unique = rows.filter(r => {
        const id = r[0]?.trim();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
    console.log(`After dedupe: ${unique.length} rows`);

    const pool = await getPool();

    let inserted = 0, skipped = 0, errors = 0;

    for (const r of unique) {
        const [idRaw, nameRaw, deptRaw, variantRaw, rateRaw, timeRaw] = r;
        const itemNumber = String(idRaw).trim();
        const name       = String(nameRaw || '').trim().replace(/\s+/g, ' ');
        const rate       = Number(rateRaw) || 0;
        const dept       = String(deptRaw || '').trim();
        const variant    = String(variantRaw || '').trim();
        const jobTime    = String(timeRaw || '').trim();

        if (!name || !itemNumber) { errors++; continue; }

        try {
            // Skip if this ItemNumber already exists (idempotent re-run)
            const dup = await pool.request()
                .input('n', sql.BigInt, parseInt(itemNumber))
                .query('SELECT TOP 1 ItemId FROM InventItems WHERE ItemNumber = @n');
            if (dup.recordset.length) { skipped++; continue; }

            const remarks = `dept=${dept} var=${variant} time=${jobTime}min`;

            await pool.request()
                .input('ItenName',          sql.NVarChar(200), name)
                .input('ItemNumber',        sql.BigInt,        parseInt(itemNumber))
                .input('ItemSalesPrice',    sql.Decimal(18,2), rate)
                .input('ItemPurchasePrice', sql.Decimal(18,2), 0)
                .input('UOMId',             sql.Int,           DEFAULT_UOM)
                .input('JobTypeID',         sql.Int,           DEFAULT_JOB_TYPE)
                .input('ItemType',          sql.VarChar(50),   'Service')
                .input('ItemStatus',        sql.Bit,           1)
                .input('CompanyID',         sql.Int,           1)
                .input('Remarks',           sql.NVarChar(sql.MAX), remarks)
                .input('WeightedRate',      sql.Decimal(18,5), 0)
                .input('CartonSize',        sql.Decimal(18,2), 0)
                .input('IsQuotation',       sql.Bit,           0)
                .query(`INSERT INTO InventItems (
                            ItenName, ItemNumber, ItemSalesPrice, ItemPurchasePrice,
                            UOMId, JobTypeID, ItemType, ItemStatus, CompanyID,
                            Remarks, WeightedRate, CartonSize, IsQuotation, MaintainInventory
                        ) VALUES (
                            @ItenName, @ItemNumber, @ItemSalesPrice, @ItemPurchasePrice,
                            @UOMId, @JobTypeID, @ItemType, @ItemStatus, @CompanyID,
                            @Remarks, @WeightedRate, @CartonSize, @IsQuotation, 0
                        )`);
            inserted++;
            if (inserted % 100 === 0) process.stdout.write(`\rinserted ${inserted}/${unique.length}`);
        } catch (err) {
            errors++;
            console.error(`\n  ✗ ${itemNumber} ${name}: ${err.message}`);
        }
    }
    console.log('');
    console.log(`Done. inserted=${inserted}  skipped(existing)=${skipped}  errors=${errors}`);

    const final = await pool.request().query(`
        SELECT 'Total Services' AS T, COUNT(*) AS N FROM InventItems WHERE ItemType='Service'
        UNION ALL SELECT 'Total Parts', COUNT(*) FROM InventItems WHERE ItemType='Part'
        UNION ALL SELECT 'Under GR (JobTypeID=1)', COUNT(*) FROM InventItems WHERE JobTypeID=1
        UNION ALL SELECT 'With rate > 0', COUNT(*) FROM InventItems WHERE ItemType='Service' AND ItemSalesPrice > 0;
    `);
    console.table(final.recordset);
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
