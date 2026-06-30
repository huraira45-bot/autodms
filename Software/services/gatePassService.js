/**
 * Gate-pass rule engine.
 *
 * Single export — checkEligibility({ docType, docId }) → eligibility report.
 *
 *   docType: 'JOBCARD' | 'STORE_SALE'
 *   docId:   JobCardId | SaleID
 *
 * Returns:
 *   {
 *     canIssue:           boolean,
 *     blockers:           [{ code, message }],
 *     warnings:           [{ code, message }],
 *     doc: { docType, docId, docNo, customerName, vehicleRegNo, vehicleChassis,
 *            partyId, partyName, partyType, isFinalized },
 *     amountInvoiced:     decimal (walk-out customer portion only),
 *     amountReceived:     decimal,
 *     amountOutstanding:  decimal,
 *     paymentModes:       ['Cash','POS',...],
 *     passReason:         'CREDIT_PARTY' | 'PAID_FULL' | 'INSURANCE_DEP_PAID' | 'FREE_SERVICE' | null,
 *   }
 *
 * Rules (set by owner):
 *   1. PartyType in ('Customer','Both') with PartyGLID set → credit-party bypass.
 *   2. Insurance JCs: insurer portion is implicitly on credit; customer must pay
 *      the depreciation portion (the Gen-Cust Dr leg). Same check as walk-in.
 *   3. Walk-in or unresolved party → Gen-Cust Dr − Gen-Cust Cr (tagged with the
 *      doc) must be ≤ 0.01.
 *   4. Same vehicle (RegNo OR ChasisNo) with another open RO that is non-warranty
 *      AND (not finalized OR has unpaid Gen-Cust balance) → block.
 *   5. POS_CLEARING legs on any receipt → warning to confirm the card swipe.
 */
const { sql, getPool } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');

const WARRANTY_JOBCARDTYPE_CODE = 'WR';   // gen_JobCardType.CardCode for warranty

async function loadJobCard(tx, jcId) {
    const r = await new sql.Request(tx)
        .input('id', sql.Int, jcId)
        .query(`SELECT jc.JobCardId, jc.JobCardNo, jc.VehicleRegNo, jc.ChasisNo,
                       jc.PartyID, jc.PartyGLID, jc.IsFinalized, jc.JobCardType,
                       jct.CardCode AS JobCardTypeCode, jct.Title AS JobCardTypeTitle,
                       p.PartyName, p.PartyType,
                       ISNULL(jc.BringByName, p.PartyName) AS CustomerName
                FROM Addata_JobCardInfo jc
                LEFT JOIN gen_JobCardType jct ON jct.JobCardTypeId = jc.JobCardType
                LEFT JOIN gen_PartiesInfo p    ON p.PartyID         = jc.PartyID
                WHERE jc.JobCardId = @id`);
    return r.recordset[0] || null;
}

async function loadStoreSale(tx, saleId) {
    const r = await new sql.Request(tx)
        .input('id', sql.Int, saleId)
        .query(`SELECT s.SaleID, s.InvoiceNo, s.CustomerName, s.VehicleName,
                       s.PartyID, s.IsFinalized, s.NetPayable, s.PaymentMode,
                       p.PartyName, p.PartyType, p.PartyGLID
                FROM data_StoreSaleInfo s
                LEFT JOIN gen_PartiesInfo p ON p.PartyID = s.PartyID
                WHERE s.SaleID = @id`);
    return r.recordset[0] || null;
}

// Walk-out balance for a JOB CARD: Σ Dr − Σ Cr on Gen-Cust tagged with the JC,
// where the leg has NO PartyID. PartyID-tagged legs sit on the credit-party's
// own GL and are settled later via party statement.
async function loadJobCardWalkOutBalance(tx, genCustGL, jcId) {
    const sumQ = await new sql.Request(tx)
        .input('gl', sql.Int, genCustGL)
        .input('jc', sql.Int, jcId)
        .query(`SELECT
                    ISNULL(SUM(CASE WHEN d.Debit  > 0 THEN d.Debit  ELSE 0 END), 0) AS Dr,
                    ISNULL(SUM(CASE WHEN d.Credit > 0 THEN d.Credit ELSE 0 END), 0) AS Cr
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                WHERE v.Status='Posted'
                  AND d.GLCAID=@gl
                  AND d.PartyID IS NULL
                  AND d.JobCardID=@jc`);
    const { Dr, Cr } = sumQ.recordset[0] || { Dr: 0, Cr: 0 };
    return { invoiced: Number(Dr || 0), received: Number(Cr || 0) };
}

// Which payment-mode accounts were touched on receipts against this JC?
// Used to flag POS so the user can confirm a physical swipe before opening.
async function loadJobCardPaymentModes(tx, genCustGL, jcId) {
    const q = await new sql.Request(tx)
        .input('gl', sql.Int, genCustGL)
        .input('jc', sql.Int, jcId)
        .query(`SELECT DISTINCT g.GLCode, g.GLTitle, sa.RoleKey
                FROM data_FinanceVoucherDetail crLeg
                INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = crLeg.VoucherID
                INNER JOIN data_FinanceVoucherDetail drLeg ON drLeg.VoucherID = v.VoucherID AND drLeg.Debit > 0
                INNER JOIN GLChartOFAccount g ON g.GLCAID = drLeg.GLCAID
                LEFT JOIN dms_SystemAccounts sa ON sa.GLCAID = drLeg.GLCAID
                WHERE v.Status='Posted'
                  AND crLeg.GLCAID=@gl AND crLeg.PartyID IS NULL AND crLeg.Credit > 0
                  AND crLeg.JobCardID=@jc`);
    return q.recordset;
}

// Which payment-mode accounts were touched on the store-sale's finalize voucher?
// Store sales bundle the receipt into the finalize voucher, so we look at the
// voucher whose SourceDocType='STORE_SALE' and SourceDocID=SaleID.
async function loadStoreSalePaymentModes(tx, saleId) {
    const q = await new sql.Request(tx)
        .input('sl', sql.Int, saleId)
        .query(`SELECT DISTINCT g.GLCode, g.GLTitle, sa.RoleKey
                FROM data_FinanceVoucherInfo v
                INNER JOIN data_FinanceVoucherDetail drLeg ON drLeg.VoucherID = v.VoucherID AND drLeg.Debit > 0
                INNER JOIN GLChartOFAccount g ON g.GLCAID = drLeg.GLCAID
                LEFT JOIN dms_SystemAccounts sa ON sa.GLCAID = drLeg.GLCAID
                WHERE v.Status='Posted'
                  AND v.SourceDocType='STORE_SALE' AND v.SourceDocID=@sl
                  AND sa.RoleKey IN ('CASH_BOOK', 'POS_CLEARING', 'CHEQUES_ON_HAND')`);
    return q.recordset;
}

// Find other open ROs on the same vehicle. "Open" = not finalized OR has unpaid
// walk-out balance. Warranty jobs are exempted per owner rule.
async function findOtherOpenROsOnVehicle(tx, currentJcId, regNo, chasisNo, genCustGL) {
    if (!regNo && !chasisNo) return [];
    const q = await new sql.Request(tx)
        .input('jcId',    sql.Int,          currentJcId)
        .input('reg',     sql.NVarChar(100),regNo || null)
        .input('chassis', sql.NVarChar(100),chasisNo || null)
        .input('gl',      sql.Int,          genCustGL)
        .input('warr',    sql.NVarChar(20), WARRANTY_JOBCARDTYPE_CODE)
        .query(`
            SELECT jc.JobCardId, jc.JobCardNo, jc.IsFinalized,
                   jct.CardCode AS JobCardTypeCode, jct.Title AS JobCardTypeTitle,
                   bal.OutstandingDr - bal.OutstandingCr AS Outstanding
            FROM Addata_JobCardInfo jc
            LEFT JOIN gen_JobCardType jct ON jct.JobCardTypeId = jc.JobCardType
            OUTER APPLY (
                SELECT
                  ISNULL(SUM(CASE WHEN d.Debit  > 0 THEN d.Debit  ELSE 0 END), 0) AS OutstandingDr,
                  ISNULL(SUM(CASE WHEN d.Credit > 0 THEN d.Credit ELSE 0 END), 0) AS OutstandingCr
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                WHERE v.Status='Posted'
                  AND d.GLCAID=@gl AND d.PartyID IS NULL AND d.JobCardID=jc.JobCardId
            ) bal
            WHERE jc.JobCardId <> @jcId
              AND ISNULL(jct.CardCode, '') <> @warr
              AND ((@reg     IS NOT NULL AND jc.VehicleRegNo = @reg)
                OR (@chassis IS NOT NULL AND jc.ChasisNo     = @chassis))
              AND (jc.IsFinalized = 0
                  OR (bal.OutstandingDr - bal.OutstandingCr) > 0.01)`);
    return q.recordset;
}

async function checkEligibility({ docType, docId }) {
    if (docType !== 'JOBCARD' && docType !== 'STORE_SALE') {
        throw new Error("docType must be 'JOBCARD' or 'STORE_SALE'.");
    }
    if (!Number.isFinite(Number(docId))) throw new Error('docId must be a number.');

    const pool = await getPool();
    const tx = pool;  // read-only — no transaction needed
    const genCustGL = await resolveRole('GENERAL_CUSTOMER');

    const blockers = [];
    const warnings = [];
    let doc, passReason = null;

    if (docType === 'JOBCARD') {
        const jc = await loadJobCard(tx, Number(docId));
        if (!jc) throw new Error(`Job Card ${docId} not found.`);
        doc = {
            docType, docId: jc.JobCardId, docNo: jc.JobCardNo,
            customerName: jc.CustomerName || '',
            vehicleRegNo: jc.VehicleRegNo || '',
            vehicleChassis: jc.ChasisNo || '',
            partyId: jc.PartyID || null,
            partyName: jc.PartyName || null,
            partyType: jc.PartyType || null,
            isFinalized: !!jc.IsFinalized,
            jobCardTypeCode: jc.JobCardTypeCode || null,
        };
        if (!doc.isFinalized) {
            blockers.push({ code: 'NOT_FINALIZED', message: 'Job Card is not finalized yet.' });
        }
    } else {
        const ss = await loadStoreSale(tx, Number(docId));
        if (!ss) throw new Error(`Store Sale ${docId} not found.`);
        doc = {
            docType, docId: ss.SaleID, docNo: ss.InvoiceNo,
            customerName: ss.CustomerName || '',
            vehicleRegNo: ss.VehicleName || '',
            vehicleChassis: '',
            partyId: ss.PartyID || null,
            partyName: ss.PartyName || null,
            partyType: ss.PartyType || null,
            isFinalized: !!ss.IsFinalized,
            jobCardTypeCode: null,
            netPayable: Number(ss.NetPayable || 0),
            storeSalePaymentMode: ss.PaymentMode || null,
        };
        if (!doc.isFinalized) {
            blockers.push({ code: 'NOT_FINALIZED', message: 'Store Sale is not finalized yet.' });
        }
    }

    // Rule 1 — credit party (PartyType is Customer or Both, NOT Insurance)
    const isCreditParty = doc.partyId
        && (doc.partyType === 'Customer' || doc.partyType === 'Both');
    // Rule 2 — insurance JC: customer pays dep portion via Gen-Cust legs (handled by walk-out check)

    let invoiced, received, modesTouched;
    if (docType === 'JOBCARD') {
        ({ invoiced, received } = await loadJobCardWalkOutBalance(tx, genCustGL, doc.docId));
        modesTouched = await loadJobCardPaymentModes(tx, genCustGL, doc.docId);
    } else {
        // Store sales bundle the receipt into the finalize voucher. If finalized
        // and the party isn't a credit party, the cash is already in the till —
        // outstanding is zero. For credit-party sales, the amount sits on the
        // party's PartyGLID and is settled via party statement (rule 1 bypass).
        invoiced = doc.netPayable;
        received = (doc.isFinalized && !isCreditParty) ? doc.netPayable : 0;
        modesTouched = await loadStoreSalePaymentModes(tx, doc.docId);
    }
    const outstanding = Math.round((invoiced - received) * 100) / 100;

    const paymentModes = modesTouched.map(m => m.GLTitle);
    if (modesTouched.some(m => m.RoleKey === 'POS_CLEARING')) {
        warnings.push({
            code: 'POS_USED',
            message: 'POS receipt detected — confirm the card was physically swiped before opening the gate.',
        });
    }

    if (isCreditParty) {
        passReason = 'CREDIT_PARTY';
    } else if (invoiced === 0 && received === 0) {
        // No walk-out amount on the JC at all (free service, fully insurance-paid,
        // or fully credit-party prior to finalize). Allow with a soft tag.
        passReason = 'FREE_SERVICE';
    } else if (outstanding > 0.01) {
        blockers.push({
            code: 'PAYMENT_PENDING',
            message: `Walk-out amount outstanding: PKR ${outstanding.toFixed(2)}. Post the receipt before issuing.`,
        });
    } else {
        passReason = (doc.partyType === 'Insurance') ? 'INSURANCE_DEP_PAID' : 'PAID_FULL';
    }

    // Rule 4 — multi-RO check (JOBCARD only; store sales aren't vehicle-bound)
    if (docType === 'JOBCARD' && (doc.vehicleRegNo || doc.vehicleChassis)) {
        const others = await findOtherOpenROsOnVehicle(
            tx, doc.docId, doc.vehicleRegNo, doc.vehicleChassis, genCustGL
        );
        for (const o of others) {
            const reason = !o.IsFinalized ? 'not finalized'
                : `outstanding PKR ${Number(o.Outstanding || 0).toFixed(2)}`;
            blockers.push({
                code: 'OTHER_OPEN_RO',
                message: `Another RO ${o.JobCardNo} (${o.JobCardTypeTitle || o.JobCardTypeCode || 'Job'}) on the same vehicle is ${reason}.`,
            });
        }
    }

    const canIssue = blockers.length === 0;
    return {
        canIssue,
        blockers,
        warnings,
        doc,
        amountInvoiced: invoiced,
        amountReceived: received,
        amountOutstanding: outstanding,
        paymentModes,
        passReason: canIssue ? passReason : null,
    };
}

module.exports = { checkEligibility };
