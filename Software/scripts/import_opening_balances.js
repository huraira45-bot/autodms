/**
 * import_opening_balances.js
 *
 * Reads ../../chart_of_accounts_updated (1).xlsx, then:
 *   1. Identifies every level-4 (leaf) GL row that has a non-zero closing
 *      balance.
 *   2. Compares against existing GLChartOFAccount. Creates any missing
 *      leaves (and their level-2/3 parents if those are also missing).
 *   3. Posts ONE Opening Balance Journal Voucher (JV-OB-...) with a Dr
 *      line for every account where the spreadsheet says Dr, and a Cr
 *      line for every Cr account. Total Dr must equal Total Cr — script
 *      aborts (no DB writes) if it doesn't balance.
 *
 * Usage:
 *     node Software/scripts/import_opening_balances.js [--dry-run]
 *
 * --dry-run prints what would happen without touching the DB.
 */
const path  = require('path');
const fs    = require('fs');
const xlsx  = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');

const XLSX_PATH = path.join(__dirname, '..', '..', 'COA_Opening_Balances.xlsx');
const DRY = process.argv.includes('--dry-run');

// ── tiny helpers ──────────────────────────────────────────────────────────
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const cleanNum = (v) => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[, ]/g, '').replace(/^-$/, '0');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
};

async function main() {
    if (!fs.existsSync(XLSX_PATH)) {
        console.error(`xlsx not found at ${XLSX_PATH}`);
        process.exit(1);
    }

    // ── 1. Parse spreadsheet ──────────────────────────────────────────────
    // The new file has 3 title/blank rows before the column headers, so we
    // auto-detect the header row by scanning for one that contains an
    // account-code column.
    const wb = xlsx.readFile(XLSX_PATH);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matrix = xlsx.utils.sheet_to_json(ws, { defval: '', header: 1 });

    let headerRow = -1;
    for (let i = 0; i < Math.min(matrix.length, 20); i++) {
        const cells = (matrix[i] || []).map(c => String(c).trim().toLowerCase());
        if (cells.some(c => c === 'a/c #' || c === 'gl code' || c === 'glcode' || c === 'code')
            && cells.some(c => c.includes('debit')) && cells.some(c => c.includes('credit'))) {
            headerRow = i;
            break;
        }
    }
    if (headerRow < 0) {
        console.error('Could not locate the header row in the xlsx. Looked for "A/C #" / "GL Code" + Debit + Credit columns in the first 20 rows.');
        process.exit(1);
    }
    const headers = (matrix[headerRow] || []).map(h => String(h).trim());
    const rows = matrix.slice(headerRow + 1).map(r => {
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
        return obj;
    });

    console.log(`Read ${rows.length} data rows from xlsx (header on row ${headerRow + 1}).`);
    if (!rows.length) { console.error('Empty sheet.'); process.exit(1); }

    const sample = rows[0];
    const KEY_CODE  = ['A/C #', 'GL Code', 'GLCode', 'Code'].find(k => k in sample);
    const KEY_TITLE = ['TITLE OF ACCOUNT', 'Account Title', 'Title', 'GLTitle'].find(k => k in sample);
    const KEY_LEVEL = ['Lvl', 'Level', 'GLLevel'].find(k => k in sample);
    const KEY_NATURE= ['Nature', 'GLNature'].find(k => k in sample);
    const KEY_DR    = ['Opening Debit', 'Closing Debit', 'Debit'].find(k => k in sample);
    const KEY_CR    = ['Opening Credit', 'Closing Credit', 'Credit'].find(k => k in sample);
    const KEY_BAL   = ['Closing Balance', 'Balance'].find(k => k in sample);
    const KEY_SIDE  = ['Dr/Cr', 'Side'].find(k => k in sample);
    if (!KEY_CODE || !KEY_TITLE || !KEY_LEVEL || !KEY_DR || !KEY_CR) {
        console.error('xlsx missing required columns. Detected keys:', Object.keys(sample));
        process.exit(1);
    }

    // ── 2. Build account index from xlsx ──────────────────────────────────
    const KEY_PARENT = ['Parent?', 'IsParent', 'Parent'].find(k => k in sample);
    const allRows = rows
        .filter(r => r[KEY_CODE] !== '' && r[KEY_CODE] != null)
        .map(r => ({
            code:   String(r[KEY_CODE]).trim(),
            title:  String(r[KEY_TITLE] || '').trim(),
            level:  parseInt(r[KEY_LEVEL]) || 0,
            nature: String(r[KEY_NATURE] || '').trim(),
            parent: KEY_PARENT ? String(r[KEY_PARENT] || '').trim() : '',
            dr:     cleanNum(r[KEY_DR]),
            cr:     cleanNum(r[KEY_CR]),
            side:   String(r[KEY_SIDE] || '').trim(),
        }));

    // Skip parent/group rows (owner instruction: "ignore the parent group
    // account, use single account") — only post the leaf-level rows so a
    // parent that has both an own-balance and children isn't double-counted.
    // A row is treated as a leaf when its Parent? flag is "No" / blank / 0,
    // OR when its Level = 4. Parents with Parent?=Yes are skipped even if
    // they have balances.
    const isParentRow = (r) => {
        const p = (r.parent || '').toLowerCase();
        if (p === 'yes' || p === 'y' || p === 'true' || p === '1') return true;
        if (p === 'no'  || p === 'n' || p === 'false'|| p === '0') return false;
        return r.level < 4;     // fallback when Parent? column is blank
    };
    // Owner instruction: exclude Revenue (4xxx) and Expenses (5xxx) from
    // opening balances — only Balance Sheet items (Assets, Liabilities,
    // Equity) carry forward. Revenue/Expense reset at year-end and their
    // net effect lives in Retained Earnings.
    const isBalanceSheet = (code) => code[0] === '1' || code[0] === '2' || code[0] === '3';
    const leafRows = allRows.filter(r =>
        !isParentRow(r)
        && isBalanceSheet(r.code)
        && (Math.abs(r.dr) + Math.abs(r.cr)) > 0
    );
    console.log(`Found ${leafRows.length} balance-sheet leaf rows with non-zero opening balance (Revenue/Expense excluded).`);

    const opening = leafRows.map(r => {
        const balanceFromSplit = r.dr - r.cr;
        const balanceFromBalance = cleanNum(r[KEY_BAL]);
        const balance = balanceFromBalance || balanceFromSplit;
        const sideLabel = (r.side || '').toLowerCase();
        const isDr = sideLabel === 'dr' ? true
                    : sideLabel === 'cr' ? false
                    : balance >= 0;
        return {
            code: r.code, title: r.title, level: r.level,
            amount: r2(Math.abs(balance)),
            isDr,
        };
    }).filter(x => x.amount > 0);

    let totalDr = r2(opening.filter(x =>  x.isDr).reduce((s, x) => s + x.amount, 0));
    let totalCr = r2(opening.filter(x => !x.isDr).reduce((s, x) => s + x.amount, 0));
    console.log(`Opening balance totals — Dr: ${totalDr.toLocaleString()}  Cr: ${totalCr.toLocaleString()}`);

    // Owner instruction: any credit-side shortfall (Assets > Liab + Equity)
    // gets plugged into Capital Account 301001001 as the balancing Cr line.
    const PLUG_CODE = '301001001';
    const gap = r2(totalDr - totalCr);
    if (gap > 0.5) {
        console.log(`Adding plug to Capital Account ${PLUG_CODE}: Cr ${gap.toLocaleString()}`);
        opening.push({
            code: PLUG_CODE, title: 'CAPITAL ACCOUNT (plug)',
            level: 4, amount: gap, isDr: false,
        });
        totalCr = r2(totalCr + gap);
    } else if (gap < -0.5) {
        console.log(`Adding plug to Capital Account ${PLUG_CODE}: Dr ${Math.abs(gap).toLocaleString()}`);
        opening.push({
            code: PLUG_CODE, title: 'CAPITAL ACCOUNT (plug)',
            level: 4, amount: Math.abs(gap), isDr: true,
        });
        totalDr = r2(totalDr + Math.abs(gap));
    }

    // Per-top-level (first digit of GLCode) breakdown so we can see where
    // the imbalance is coming from. 1=Assets, 2=Liabilities, 3=Equity,
    // 4=Revenue, 5=Expenses.
    const buckets = { 1: { dr: 0, cr: 0 }, 2: { dr: 0, cr: 0 }, 3: { dr: 0, cr: 0 }, 4: { dr: 0, cr: 0 }, 5: { dr: 0, cr: 0 } };
    for (const x of opening) {
        const k = x.code[0];
        if (!buckets[k]) buckets[k] = { dr: 0, cr: 0 };
        if (x.isDr) buckets[k].dr += x.amount; else buckets[k].cr += x.amount;
    }
    console.log('Per-group totals:');
    const LBL = { '1': 'ASSETS', '2': 'LIABILITIES', '3': 'EQUITY', '4': 'REVENUE', '5': 'EXPENSES' };
    for (const k of Object.keys(buckets)) {
        const b = buckets[k];
        console.log(`  ${k} ${LBL[k] || ''.padEnd(11)}  Dr: ${b.dr.toLocaleString().padStart(20)}  Cr: ${b.cr.toLocaleString().padStart(20)}  Net: ${(b.dr - b.cr).toLocaleString()}`);
    }

    if (Math.abs(totalDr - totalCr) > 0.5) {
        console.error(`!! Opening balances are NOT balanced. Difference: ${(totalDr - totalCr).toFixed(2)}`);
        console.error('   No accounts will be created and no voucher will be posted. Fix the sheet and re-run.');
        process.exit(2);
    }

    // ── 3. Load existing COA ──────────────────────────────────────────────
    const pool = await getPool();
    const coaRes = await pool.request().query('SELECT GLCAID, GLCode, GLTitle, GLLevel, isParent FROM GLChartOFAccount');
    const coaByCode = new Map(coaRes.recordset.map(r => [r.GLCode, r]));
    console.log(`COA currently has ${coaRes.recordset.length} accounts in the DB.`);

    // ── 4. Identify missing parents + leaves we need to create ────────────
    const missingCodesOrdered = [];
    const seen = new Set();
    const ensureChain = (leafCode) => {
        // Build the parent chain by prefixing: first 3 digits, then 6, then 9
        // (since GLCode is hierarchical: level1=1ch, level2=3ch, level3=6ch, level4=9ch).
        const tail = (code) => {
            if (code.length === 1) return [];     // level 1 root
            if (code.length === 3) return [code.slice(0, 1)];
            if (code.length === 6) return [code.slice(0, 1), code.slice(0, 3)];
            if (code.length === 9) return [code.slice(0, 1), code.slice(0, 3), code.slice(0, 6)];
            return [];
        };
        const chain = [...tail(leafCode), leafCode];
        for (const code of chain) {
            if (!coaByCode.has(code) && !seen.has(code)) {
                seen.add(code);
                missingCodesOrdered.push(code);
            }
        }
    };
    for (const row of opening) ensureChain(row.code);

    if (missingCodesOrdered.length === 0) {
        console.log('All accounts already exist in the COA. Nothing to create.');
    } else {
        console.log(`Need to create ${missingCodesOrdered.length} missing accounts.`);
    }

    // Look up xlsx-source row for each missing code so we can use its title/level/nature
    const xlsxByCode = new Map(allRows.map(r => [r.code, r]));

    // ── 5. Plan summary ───────────────────────────────────────────────────
    console.log('--- Plan ---');
    console.log(`  Create ${missingCodesOrdered.length} GL accounts`);
    console.log(`  Post 1 Opening Balance JV with ${opening.length} lines`);
    console.log(`     total Dr: ${totalDr.toLocaleString()}`);
    console.log(`     total Cr: ${totalCr.toLocaleString()}`);
    if (DRY) {
        console.log('--- DRY RUN — exiting without DB writes ---');
        if (missingCodesOrdered.length) {
            console.log('First 10 missing codes that would be created:');
            for (const c of missingCodesOrdered.slice(0, 10)) {
                const src = xlsxByCode.get(c);
                console.log(`  ${c}  ${src ? src.title : '(parent — synthesized title)'}  L${src?.level || (c.length === 1 ? 1 : c.length === 3 ? 2 : c.length === 6 ? 3 : 4)}`);
            }
        }
        process.exit(0);
    }

    // ── 6. Create missing accounts in dependency order ────────────────────
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        for (const code of missingCodesOrdered) {
            const src   = xlsxByCode.get(code);
            const level = src?.level || (code.length === 1 ? 1 : code.length === 3 ? 2 : code.length === 6 ? 3 : 4);
            const title = (src?.title || `ACCOUNT ${code}`).toUpperCase();
            const natureLabel = (src?.nature || '').toLowerCase();
            // GLNature is 1 for Asset/Expense (Dr) and 2 for Liability/Income (Cr).
            // The xlsx labels include "Dr"/"Cr" we can read from. If absent, fall
            // back to the leading digit: 1/5 = Asset/Expense, 2-4 = Liability/Income.
            let gln;
            if (natureLabel.includes('dr') || natureLabel.includes('asset') || natureLabel.includes('expense')) gln = 1;
            else if (natureLabel.includes('cr') || natureLabel.includes('liab') || natureLabel.includes('income')) gln = 2;
            else gln = (code[0] === '1' || code[0] === '5') ? 1 : 2;
            const isParent = level < 4 ? 1 : 0;

            const ins = await new sql.Request(tx)
                .input('code',    sql.NVarChar(50),  code)
                .input('title',   sql.NVarChar(255), title)
                .input('level',   sql.TinyInt,       level)
                .input('nature',  sql.TinyInt,       gln)
                .input('isParent',sql.Int,           isParent)
                .query(`INSERT INTO GLChartOFAccount
                            (GLCode, GLTitle, GLType, isParent, GLNature, GLLevel,
                             AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour,
                             CompanyID, Status, ReadOnly)
                        OUTPUT INSERTED.GLCAID
                        VALUES (@code, @title, @nature, @isParent, @nature, @level,
                                '01', '0', '0', '0', 1, 1, 0)`);
            coaByCode.set(code, { GLCAID: ins.recordset[0].GLCAID, GLCode: code, GLTitle: title, GLLevel: level, isParent });
        }
        console.log(`Created ${missingCodesOrdered.length} accounts.`);

        // ── 7. Resolve every leaf line to a GLCAID ────────────────────────
        const lines = [];
        for (const o of opening) {
            const acct = coaByCode.get(o.code);
            if (!acct) throw new Error(`Could not resolve account ${o.code} after creation step — aborting.`);
            lines.push({
                GLCAID: acct.GLCAID,
                Debit:  o.isDr  ? o.amount : 0,
                Credit: !o.isDr ? o.amount : 0,
                Narration: `Opening balance — ${o.code} ${o.title}`,
            });
        }

        // ── 8. Post the Opening Balance JV ───────────────────────────────
        const vt = await new sql.Request(tx).query("SELECT Voucherid FROM GLVoucherType WHERE Title='JV'");
        if (!vt.recordset.length) throw new Error('JV voucher type missing — run migration 001.');
        const vtId = vt.recordset[0].Voucherid;

        const seqRes = await new sql.Request(tx).query("SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo");
        const voucherNo = `JV-OB-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

        const hdr = await new sql.Request(tx)
            .input('vd',      sql.DateTime,     new Date())
            .input('vno',     sql.NVarChar(50), voucherNo)
            .input('vtId',    sql.Int,          vtId)
            .input('remarks', sql.NVarChar(sql.MAX), 'Opening balances imported from chart_of_accounts_updated.xlsx')
            .input('total',   sql.Decimal(18,2), totalDr)
            .input('src',     sql.NVarChar(20), 'VOUCHER')
            .input('cby',     sql.Int,          0)
            .input('cbyN',    sql.NVarChar(100),'import_opening_balances')
            .query(`INSERT INTO data_FinanceVoucherInfo
                        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                         Status, Posted, SourceDocType, CreatedBy, CreatedByName)
                    OUTPUT INSERTED.VoucherID
                    VALUES (@vd, @vno, @vtId, @remarks, @total,
                            'Draft', 0, @src, @cby, @cbyN)`);
        const voucherId = hdr.recordset[0].VoucherID;

        // Detail rows
        for (const line of lines) {
            await new sql.Request(tx)
                .input('vid', sql.Int,           voucherId)
                .input('gl',  sql.Int,           line.GLCAID)
                .input('nar', sql.NVarChar(sql.MAX), line.Narration)
                .input('dr',  sql.Decimal(18,2), line.Debit)
                .input('cr',  sql.Decimal(18,2), line.Credit)
                .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @nar, @dr, @cr)`);
        }

        // Flip to Posted (balanced-entry trigger validates Dr=Cr)
        await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .query(`UPDATE data_FinanceVoucherInfo
                    SET Status='Posted', Posted=1, PostedBy=0, PostedAt=GETDATE()
                    WHERE VoucherID=@vid`);

        await tx.commit();
        console.log(`Opening JV ${voucherNo} posted with ${lines.length} lines.`);
        console.log(`   Total Dr: ${totalDr.toLocaleString()}`);
        console.log(`   Total Cr: ${totalCr.toLocaleString()}`);
        process.exit(0);
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('FATAL — transaction rolled back:', err.message);
        process.exit(3);
    }
}

main().catch(err => { console.error(err); process.exit(99); });
