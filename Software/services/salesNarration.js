/**
 * Cross narration for sales-module vouchers (owner ask 2026-09-18).
 *
 * Every line of a sales voucher says in plain words what the other side of the
 * entry is: who the customer is, which vehicle it is for, which booking, and
 * which instrument moved the money (cheque no, pay order, POS ref, bank) — and
 * it ends by naming the contra account. Reading one account's ledger then tells
 * the whole story without opening the voucher.
 *
 * Chassis and engine numbers appear only once a vehicle has actually been
 * allocated; before that the narration stops at the variant rather than
 * claiming identifiers the booking does not have yet.
 */
const { sql } = require('../config/db');

/** Everything a sales narration draws on, in one query. */
async function loadNarrationContext(executor, bookingId) {
    if (!bookingId) return null;
    const r = await new sql.Request(executor)
        .input('bid', sql.Int, bookingId)
        .query(`SELECT b.BookingID, b.BookingNo,
                       pt.PartyName,
                       m.ModelName, m.ModelCode, m.BrandName,
                       v.VariantName, v.VariantCode,
                       veh.ChasisNo, veh.EngineNo, veh.Color
                FROM   dms_SalesBookings      b
                LEFT   JOIN gen_PartiesInfo   pt  ON pt.PartyID    = b.PartyID
                LEFT   JOIN dms_VehicleModel  m   ON m.ModelID     = b.VehicleModelID
                LEFT   JOIN dms_VehicleVariant v  ON v.VariantID   = b.VehicleVariantID
                LEFT   JOIN dms_Vehicle       veh ON veh.VehicleID = b.AllocatedVehicleID
                WHERE  b.BookingID = @bid`);
    return r.recordset[0] || null;
}

/**
 * "Changan Alsvin 1.6 1.3 (Chassis LS4…, Engine JL4…)" — identifiers appear
 * only once a vehicle is allocated.
 *
 * Brand, model and variant are stitched word by word, skipping words already
 * said: the catalog repeats the brand inside the model and the variant
 * ("Changan" / "Changan Alsvin 1.6" / "Changan 1.3"), and a narration reading
 * "Changan Changan Alsvin 1.6 Changan 1.3" helps nobody.
 */
function vehicleText(ctx) {
    if (!ctx) return '';
    const words = [];
    for (const token of `${ctx.BrandName || ''} ${ctx.ModelName || ctx.ModelCode || ''} ${ctx.VariantName || ''}`
            .split(/\s+/).filter(Boolean)) {
        if (!words.some(w => w.toLowerCase() === token.toLowerCase())) words.push(token);
    }
    const name = words.join(' ');
    const ids = [
        ctx.ChasisNo ? `Chassis ${ctx.ChasisNo}` : null,
        ctx.EngineNo ? `Engine ${ctx.EngineNo}` : null,
    ].filter(Boolean);
    if (!name) return ids.join(', ');
    return ids.length ? `${name} (${ids.join(', ')})` : name;
}

/**
 * The customer's name. Party names in this database often carry the CNIC
 * appended ("KHAWAJA ZAHID LATIF CNIC;36302-…"); the number belongs on the
 * document, not in the middle of every narration.
 */
const customerText = (ctx) => {
    const raw = (ctx?.PartyName || '').trim();
    if (!raw) return 'the customer';
    return raw.replace(/\s*CNIC\s*[;:].*$/i, '').trim() || raw;
};

/** "for <vehicle>, booking <no>" — the tail almost every sales line carries. */
function forVehicleAndBooking(ctx) {
    const veh = vehicleText(ctx);
    const bk = ctx?.BookingNo ? `booking ${ctx.BookingNo}` : '';
    if (veh && bk) return `for ${veh}, ${bk}`;
    if (veh) return `for ${veh}`;
    return bk ? `for ${bk}` : '';
}

/** GL account title, used to name the other side of the entry. */
async function accountTitle(executor, glcaid) {
    if (!glcaid) return '';
    const r = await new sql.Request(executor)
        .input('gl', sql.Int, glcaid)
        .query(`SELECT GLTitle FROM GLChartOFAccount WHERE GLCAID=@gl`);
    return r.recordset[0]?.GLTitle || '';
}

/** Builds one line: joins the parts, drops blanks, names the contra account. */
function line(parts, contraTitle) {
    const body = (Array.isArray(parts) ? parts : [parts])
        .filter(Boolean).join(' ')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.])/g, '$1')
        .trim();
    return contraTitle ? `${body} — contra: ${contraTitle}` : body;
}

/**
 * How the money moved, in words: "by cheque #88213 deposited into HBL Multan",
 * "in cash", "by POS (ref 4412) into HBL Multan", "by bank transfer into …".
 */
function instrumentText({ mode, chequeNo, posRef, payOrderNo, payOrderBank, bankTitle }) {
    switch (mode) {
        case 'Cash':
            return 'in cash';
        case 'Cheque':
            return `by cheque #${chequeNo || '(no number)'}`
                 + (bankTitle ? ` deposited into ${bankTitle}` : '');
        case 'POS':
            return `by POS${posRef ? ` (ref ${posRef})` : ''}`
                 + (bankTitle ? ` into ${bankTitle}` : '');
        case 'PayOrder':
            return `by Pay Order ${payOrderNo || '(no number)'}`
                 + (payOrderBank ? ` drawn on ${payOrderBank}` : '');
        case 'BankTransfer':
        default:
            return 'by bank transfer' + (bankTitle ? ` into ${bankTitle}` : '');
    }
}

module.exports = {
    loadNarrationContext,
    vehicleText,
    customerText,
    forVehicleAndBooking,
    accountTitle,
    line,
    instrumentText,
};
