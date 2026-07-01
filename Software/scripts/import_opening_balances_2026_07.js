/**
 * Owner import 2026-07-01: 94 party opening balances via a single JV.
 *
 * For each row:
 *   - If `useExistingCode` is set, resolve that GLCode and post to its GLCAID
 *     (no new account created).
 *   - Otherwise, create a new L4 leaf under the given parent, using the
 *     smallest free suffix (mirrors the fixed accountController gap-filler).
 *
 * A single JV voucher aggregates every Dr/Cr, then a balancing line is
 * posted to Capital 301001001 for the Cr-heavy difference (Cr > Dr, so
 * Capital gets Dr'd).
 *
 * Idempotent: refuses to run twice by looking for VoucherNo starting with
 * 'JV-OB-2026-07' in data_FinanceVoucherInfo. Run once per environment.
 */
const { sql, getPool } = require('../config/db');

const CAPITAL_CODE = '301001001';
const VOUCHER_PREFIX = 'JV-OB-2026-07';
const VOUCHER_DATE = new Date('2026-07-01T00:00:00');

// -- ROWS ---------------------------------------------------------------------
// Each row: { title, parent, dr, cr, useExistingCode? }
// Parents come from CLAUDE-verified COA:
//   301002 DIRECTORS/PARTNERS ADVANCES        (Equity - Advances group)
//   102006 MASTER CHANGAN MOTORS (CURRENT A/C)
//   102008 TRADE RECEIVABLES - PARTS PARTIES
//   102003 SISTER CONCERN (RECEIVABLE)
//   102004 STAFF RECEIVABLES & ADVANCES
//   201001 TRADE PAYABLES
//   201002 CUSTOMER ADVANCES - VEHICLE PARTIES
//   102007 TRADE RECEIVABLES - WORKSHOP PARTIES
const ROWS = [
    { title: 'RUMANZA MEMBERSHIP (DHA)',                          parent: '301002', dr: 1800000.00, cr: 0 },
    { title: 'SEHAR HOUSE (32 KANAL)',                            parent: '301002', dr: 747925.00,  cr: 0 },
    { title: 'COURTESY R/A (MCML)',                               parent: '102006', dr: 80000.00,   cr: 0 },
    { title: 'HH Traders',                                        parent: '102008', dr: 75120.00,   cr: 0 },
    { title: 'HANNAN OIL TRADERS',                                parent: '102008', dr: 40000.00,   cr: 0 },
    { title: 'TOYOTA HOUSE',                                      parent: '102008', dr: 0,          cr: 10000.00 },
    { title: 'ARSHAD AUTOS',                                      parent: '102008', dr: 8140.00,    cr: 0 },
    { title: 'PSO SALEEM PETROLEUM SERVICE (TIBA SULTAN PUR)',    parent: '102003', dr: 921144.22,  cr: 0 },
    { title: 'FATIMA DIAGNOSTIC CENTRE',                          parent: '102003', dr: 2000.00,    cr: 0 },
    { title: 'FARUKH SHABBIR (G.M AFTER SALES)',                  parent: '102004', dr: 18000.00,   cr: 0 },
    { title: 'MUHAMMAD NAEEM (HELPER TEH)',                       parent: '102004', dr: 5000.00,    cr: 0 },
    { title: 'MUHAMMAD ASGHAR ALI',                               parent: '102004', dr: 3500.00,    cr: 0 },
    { title: 'EVENT MASTER',                                      parent: '201001', dr: 200000.00,  cr: 0 },
    { title: 'OWAIS NAJAM 32304-1506350-7',                       parent: '201002', dr: 0, cr: 20597940.00 },
    { title: 'ADNAN YASEEN 32304-7105780-3',                      parent: '201002', dr: 0, cr: 10299000.00 },
    { title: 'SAQIB NAZIR 36502-5395078-5',                       parent: '201002', dr: 0, cr: 10298980.00 },
    { title: 'ALI RAZA MITRU 36602-9147120-1',                    parent: '201002', dr: 0, cr: 10298980.00 },
    { title: 'HAMID YAQOOB 33202-1588598-3',                      parent: '201002', dr: 0, cr: 10298980.00 },
    { title: 'XARA TAREEN #36302-3114834-8',                      parent: '201002', dr: 0, cr: 10298980.00 },
    { title: 'AL-TAJ COTTON INDUSTRIES & OIL MILLS',              parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'HASSAAN GHAFFAR 32303-4714257-9',                   parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'REHAN UMAR 33105-9261105-1',                        parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'BIN ADAM TRADERS HPA FBL',                          parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'KHALID MAHMOOD AHMAD CNIC: 36302-3952498-3',        parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'MOOSA BILAL LATIF 33303-6091645-5',                 parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'HUSSAIN POULTRY TRADERS A/C BIPL',                  parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'MOHSIN RAZA SARWAR 36302-8694141-1',                parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'ANJUM RIAZ 36201-7507387-1',                        parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'MASOOD AHMAD A/C MBL',                              parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'ALLAH TAWAKAL POULTRY BROKER A/C BAHL',             parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'A&Z OILS (PRIVATE ) LIMITED',                       parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'MUHAMMAD IMRAN KHAN',                               parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'SAYAD MUHAMMAD SAFDAR SHAH',                        parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'HAFIZ USMAN RAFIQUE 36302-3517020-1',               parent: '201002', dr: 0, cr: 10298970.00 },
    { title: 'MUZAMMIL IFRAHIM A/C MBL',                          parent: '201002', dr: 0, cr: 10198980.00 },
    { title: 'AWAIS COMMISSION AGENT A/C MBL',                    parent: '201002', dr: 0, cr: 10198980.00 },
    { title: 'WAQAS TRADERS A/C BANK ISLAMI PAKISTAN LTD.',       parent: '201002', dr: 0, cr:  9229980.00 },
    { title: 'SHAFIQ-UL-REHMAN A/C UBL',                          parent: '201002', dr: 0, cr:  8873000.00 },
    { title: 'PALWASHA ARSHAD CNIC: 32303-7091367-2',             parent: '201002', dr: 0, cr:  8248000.00 },
    { title: 'IMRAN WASEEM PRINTING PRESS & GRAPHIC A/C BAHL',    parent: '201002', dr: 0, cr:  8107980.00 },
    { title: 'CORTBIRD A/C FBL',                                  parent: '201002', dr: 0, cr:  8107980.00 },
    { title: 'MUHAMMAD NAEDEEM 35202-1252764-7',                  parent: '201002', dr: 0, cr:  8107980.00 },
    { title: 'MUHAMMAD JAVED A/C MBL',                            parent: '201002', dr: 0, cr:  5098980.00 },
    { title: 'MUHAMMAD RIAZ HPA FBL',                             parent: '201002', dr: 0, cr:  4272780.00 },
    { title: 'MUHAMMAD AMIN HPA MMBL',                            parent: '201002', dr: 0, cr:  3297735.00 },
    { title: 'HAMIDA PARVEEN HPA FBL',                            parent: '201002', dr: 0, cr:  3297735.00 },
    { title: 'MUHAMMAD AKRAM 36302-5529431-1',                    parent: '201002', dr: 0, cr:  3297735.00 },
    { title: 'ALI RAMZAN A/C BOP',                                parent: '201002', dr: 0, cr:  3297735.00 },
    { title: 'ABDUL SHAKOOR 32202-2549236-1',                     parent: '201002', dr: 0, cr:  3297735.00 },
    { title: 'MUHAMMAD SAEED A/C BAFL',                           parent: '201002', dr: 0, cr:  3297735.00 },
    { title: 'MUHAMMAD NADEEM 32304-1612328-1',                   parent: '201002', dr: 0, cr:  3297735.00 },
    { title: 'ALI WAQAS KHAN A/C BOP',                            parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'ABU JUNDAL HPA UBL',                                parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'MUHAMMAD BILAL HPA UBL',                            parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'AHSAN ALTAF A/C BOP',                               parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'RANA ABU BAKAR HPA JS BANK LTD',                    parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'ALI ABBAS A/C BOP',                                 parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'LABAN ZIA A/C BOP',                                 parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'GHULAM MURTAZA HPA MMBL',                           parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'AHSAN ULLAH HPA UBL',                               parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'ALI RAZA A/C UBL 33106-3884855-9',                  parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'HAMZA RASHEED HPA UNITED BANK LIMITED',             parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'HAFIZ MUHAMMAD ABID FIAZ A/C BOP',                  parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'MUHAMMAD IMRAN HPA JS BANK',                        parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'ABDUL QAYYUM A/C BOP',                              parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'SAFDAR ALI A/C BOP',                                parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'SAYAD SHAZAIB ALI A/C BOP',                         parent: '201002', dr: 0, cr:  3249000.00 },
    { title: 'SHAKIR HUSSAIN A/C MBL',                            parent: '201002', dr: 0, cr:  2993235.00 },
    { title: 'AL HASEEB POULTRY SERVICES HPA BANK AL HABIB',      parent: '201002', dr: 0, cr:  2993235.00 },
    { title: 'KASHIF HUSSAIN CNIC: 32201-5100713-5',              parent: '201002', dr: 0, cr:  2349000.00 },
    { title: 'ALI AKBAR A/C BOP',                                 parent: '201002', dr: 0, cr:  2349000.00 },
    { title: 'U-TRACK NTN-3836260-7',                             parent: '201002', dr: 0, cr:  2000000.00 },
    { title: 'FIAZ AHMAD MALIK CNIC: 32302-1712991-9',            parent: '201002', dr: 0, cr:  2000000.00 },
    { title: 'MUHAMMAD ANWAR SAJJAD 36603-81109008-7',            parent: '201002', dr: 0, cr:  2000000.00 },
    { title: 'ABDUL MANAN 36302-67853119-9',                      parent: '201002', dr: 0, cr:  2000000.00 },
    { title: 'NUCHEM (PVT) LTD NTN: 4379570-6',                   parent: '201002', dr: 0, cr:  2000000.00 },
    { title: 'MR SOHAIB DANISH',                                  parent: '201002', dr: 0, cr:  2000000.00 },
    { title: 'MUKHTAR HUSSAIN MARRAL 36602-4505539-7',            parent: '201002', dr: 0, cr:  2000000.00 },
    { title: 'HASEEB KHAN 36302-6496956-3',                       parent: '201002', dr: 0, cr:  2000000.00 },
    { title: 'QADIR BAKSH',                                       parent: '201002', dr: 0, cr:  2000000.00 },
    { title: 'MUHAMMAD TAHIR CNIC;36303-2094155-7',               parent: '201002', dr: 0, cr:  1000000.00 },
    { title: 'MUHAMMAD HUSSAIN CNIC: 31102-6095827-7',            parent: '201002', dr: 0, cr:  1000000.00 },
    { title: 'MUHAMMAD JAVID BILAL CNIC: 36303-5909977-5',        parent: '201002', dr: 500000.00, cr: 0 },
    { title: 'CHAUDHARY RIAZ AHMAD 36302-3599746-9',              parent: '201002', dr: 0, cr:   230000.00 },
    { title: 'SADIA JAWAD CNIC;32102-0362037-2',                  parent: '201002', dr: 0, cr:   220000.00 },
    { title: 'MUHAMMAD MUZAMIL B&P-12071',                        parent: '201002', dr: 0, cr:   200000.00 },
    { title: 'HUZAIFA ALI 36202-1623231-5',                       parent: '201002', dr: 0, cr:   200000.00 },
    { title: 'IMRAN AHMAD C/O DARWAISH CNIC: 32302-7741146-5',    parent: '201002', dr: 0, cr:    75000.00 },
    { title: 'SIKANDAR KHAN C/O ALAM ZAIB CNIC: 36302-2529531-1', parent: '201002', dr: 29980.00, cr: 0 },
    { title: 'FAST NATIONAL UNIVERSITY OF COMPUTER & EMERGING SCINCES, MULTAN CAMPUS',
                                                                    parent: '102007', dr: 22606.00,  cr: 0 },
    // Owner assigned to existing 102004091 (Staff Receivables & Advances)
    { title: 'MOHSIN RAUF CR MANAGER',                            useExistingCode: '102004091', dr: 20000.00, cr: 0 },
    { title: 'CMM GOOD WILL LABOUR EXPENCE GR',                   parent: '102007', dr: 19140.00,  cr: 0 },
    // Existing GENERAL CUSTOMER A/C at 102007011 (system role)
    { title: 'GENERAL CUSTOMER A/C',                              useExistingCode: '102007011', dr: 0, cr: 1442492.00 },
    { title: 'ZOHAIB UL REHMAN C/O NASIR & SONS B&P',             parent: '102007', dr: 5000.00,   cr: 0 },
];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function loadParent(request, code) {
    const r = await request.query(
        `SELECT GLCAID, GLCode, GLTitle, Companyid, AccountLevelOne, AccountLevelTwo, AccountlevelThree, GLType, GLNature
         FROM GLChartOFAccount WHERE GLCode='${code}'`);
    if (!r.recordset.length) throw new Error(`Parent COA ${code} not found on this DB.`);
    return r.recordset[0];
}

async function findExistingByCode(pool, code) {
    const r = await pool.request()
        .input('c', sql.NVarChar(50), code)
        .query('SELECT GLCAID, GLTitle FROM GLChartOFAccount WHERE GLCode=@c AND isParent=0');
    if (!r.recordset.length) throw new Error(`Explicit GLCode ${code} not found (or is a parent).`);
    return r.recordset[0].GLCAID;
}

async function allocateNextLeaf(tx, parent, title) {
    // Same gap-filling logic as accountController.createAccount: smallest
    // free suffix under the parent, 001-999 for L4.
    for (let attempt = 0; attempt < 20; attempt++) {
        const gapRes = await new sql.Request(tx)
            .input('parent', sql.NVarChar(50), parent.GLCode)
            .input('skip',   sql.Int, attempt)
            .query(`
                SELECT v.number AS FreeSuffix
                FROM master.dbo.spt_values v
                WHERE v.type = 'P'
                  AND v.number BETWEEN 1 AND 999
                  AND NOT EXISTS (
                    SELECT 1 FROM GLChartOFAccount c
                    WHERE c.GLLevel = 4
                      AND c.GLCode = @parent + RIGHT('000' + CAST(v.number AS VARCHAR(4)), 3)
                  )
                ORDER BY v.number
                OFFSET @skip ROWS FETCH NEXT 1 ROWS ONLY`);
        if (!gapRes.recordset.length) {
            throw new Error(`Parent ${parent.GLCode} is full (no free suffix ≤ 999).`);
        }
        const suffix = gapRes.recordset[0].FreeSuffix;
        const newCode = parent.GLCode + String(suffix).padStart(3, '0');
        try {
            const ins = await new sql.Request(tx)
                .input('code', sql.NVarChar(50),  newCode)
                .input('ttl',  sql.NVarChar(200), title.slice(0, 200))
                .input('typ',  sql.NVarChar(50),  parent.GLType)
                .input('nat',  sql.NVarChar(50),  parent.GLNature)
                .input('co',   sql.Int,           parent.Companyid)
                .input('a1',   sql.NVarChar(50),  parent.AccountLevelOne)
                .input('a2',   sql.NVarChar(50),  parent.AccountLevelTwo)
                .input('a3',   sql.NVarChar(50),  parent.AccountlevelThree)
                .query(`INSERT INTO GLChartOFAccount
                            (GLCode, GLTitle, GLType, isParent, GLNature, Status, GLLevel, ReadOnly,
                             Companyid, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour)
                        OUTPUT INSERTED.GLCAID
                        VALUES (@code, @ttl, @typ, 0, @nat, 1, 4, 0,
                                @co, @a1, @a2, @a3, @code)`);
            return { glcaid: ins.recordset[0].GLCAID, code: newCode };
        } catch (insErr) {
            if (insErr.number !== 2601 && insErr.number !== 2627) throw insErr;
        }
    }
    throw new Error(`Failed to allocate leaf under ${parent.GLCode} after 20 attempts.`);
}

(async () => {
    const pool = await getPool();

    // Idempotency guard
    const dup = await pool.request()
        .input('p', sql.NVarChar(50), VOUCHER_PREFIX + '%')
        .query(`SELECT TOP 1 VoucherNo FROM data_FinanceVoucherInfo WHERE VoucherNo LIKE @p`);
    if (dup.recordset.length) {
        console.error(`Refusing to run — voucher '${dup.recordset[0].VoucherNo}' already exists. Delete it first if you need to re-import.`);
        process.exit(2);
    }

    // Resolve parents once
    const parentCodes = [...new Set(ROWS.filter(r => !r.useExistingCode).map(r => r.parent))];
    const parents = {};
    for (const code of parentCodes) parents[code] = await loadParent(pool.request(), code);
    console.log(`Loaded ${Object.keys(parents).length} parent COAs.`);

    // Resolve capital account
    const capital = await pool.request()
        .input('c', sql.NVarChar(50), CAPITAL_CODE)
        .query('SELECT GLCAID FROM GLChartOFAccount WHERE GLCode=@c AND isParent=0');
    if (!capital.recordset.length) throw new Error(`Capital account ${CAPITAL_CODE} not found.`);
    const capitalGLCAID = capital.recordset[0].GLCAID;

    // Resolve JV voucher type
    const vt = await pool.request().query("SELECT Voucherid FROM GLVoucherType WHERE Title='JV'");
    if (!vt.recordset.length) throw new Error('JV voucher type missing.');
    const jvTypeId = vt.recordset[0].Voucherid;

    const seq = await pool.request().query('SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo');
    const voucherNo = `${VOUCHER_PREFIX}-${String(seq.recordset[0].nextNo).padStart(4, '0')}`;

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const lines = [];

        // Reuse an existing leaf, or create a fresh one
        for (let i = 0; i < ROWS.length; i++) {
            const row = ROWS[i];
            let glcaid;
            let code;
            if (row.useExistingCode) {
                glcaid = await findExistingByCode(pool, row.useExistingCode);
                code   = row.useExistingCode;
            } else {
                const parent = parents[row.parent];
                const made = await allocateNextLeaf(tx, parent, row.title);
                glcaid = made.glcaid;
                code   = made.code;
            }
            lines.push({ glcaid, dr: round2(row.dr), cr: round2(row.cr), title: row.title, code });
            if ((i + 1) % 10 === 0 || i === ROWS.length - 1) {
                console.log(`   [${i + 1}/${ROWS.length}] resolved`);
            }
        }

        const totalDr = round2(lines.reduce((s, l) => s + l.dr, 0));
        const totalCr = round2(lines.reduce((s, l) => s + l.cr, 0));
        const diff = round2(totalCr - totalDr);   // positive = Cr-heavy → Dr Capital
        console.log(`Total Dr: ${totalDr.toLocaleString('en-PK')}`);
        console.log(`Total Cr: ${totalCr.toLocaleString('en-PK')}`);
        console.log(`Balancing to Capital ${CAPITAL_CODE}: ${Math.abs(diff).toLocaleString('en-PK')} on the ${diff > 0 ? 'Dr' : 'Cr'} side.`);

        const capLine = diff > 0
            ? { glcaid: capitalGLCAID, dr: diff, cr: 0, title: 'CAPITAL — Opening Balance plug', code: CAPITAL_CODE }
            : diff < 0
                ? { glcaid: capitalGLCAID, dr: 0, cr: Math.abs(diff), title: 'CAPITAL — Opening Balance plug', code: CAPITAL_CODE }
                : null;
        if (capLine) lines.push(capLine);

        const grandDr = round2(lines.reduce((s, l) => s + l.dr, 0));
        const grandCr = round2(lines.reduce((s, l) => s + l.cr, 0));
        if (Math.abs(grandDr - grandCr) > 0.01) {
            throw new Error(`Voucher not balanced: Dr ${grandDr} vs Cr ${grandCr}.`);
        }
        const totalAmount = Math.max(grandDr, grandCr);

        // Insert voucher header
        const hdr = await new sql.Request(tx)
            .input('vd',    sql.DateTime, VOUCHER_DATE)
            .input('vno',   sql.NVarChar(50), voucherNo)
            .input('vtId',  sql.Int, jvTypeId)
            .input('rem',   sql.NVarChar(sql.MAX), 'Opening balances 2026-07-01 (owner import)')
            .input('tot',   sql.Decimal(18,2), totalAmount)
            .input('src',   sql.NVarChar(20), 'VOUCHER')
            .query(`INSERT INTO data_FinanceVoucherInfo
                        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                         Status, Posted, SourceDocType, CreatedByName)
                    OUTPUT INSERTED.VoucherID
                    VALUES (@vd, @vno, @vtId, @rem, @tot,
                            'Draft', 0, @src, 'OpeningBalanceImport')`);
        const voucherId = hdr.recordset[0].VoucherID;

        for (const l of lines) {
            await new sql.Request(tx)
                .input('vid', sql.Int, voucherId)
                .input('gl',  sql.Int, l.glcaid)
                .input('nar', sql.NVarChar(sql.MAX), `Opening balance — ${l.title}`)
                .input('dr',  sql.Decimal(18,2), l.dr)
                .input('cr',  sql.Decimal(18,2), l.cr)
                .query(`INSERT INTO data_FinanceVoucherDetail
                            (VoucherID, GLCAID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @nar, @dr, @cr)`);
        }

        // Flip to Posted so the balanced-entry trigger fires
        await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .query(`UPDATE data_FinanceVoucherInfo
                    SET Status='Posted', Posted=1, PostedAt=GETDATE()
                    WHERE VoucherID=@vid`);

        await tx.commit();
        console.log(`\n✓ Posted voucher ${voucherNo} (VoucherID=${voucherId}), ${lines.length} lines, Dr=Cr=${totalAmount.toLocaleString('en-PK')}.`);
    } catch (err) {
        await tx.rollback();
        console.error('\n✗ Rolled back:', err.message);
        process.exit(1);
    } finally {
        await pool.close();
    }
})();
