const { sql } = require('../config/db');
const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };

// Match voucher type codes, including duplicate legacy IDs for the same code.
function applyVoucherFilters(request, query, numberOnly = false) {
    const number = String(query.search || '').trim();
    const type = String(query.voucherType || '').trim();
    if (number.length > 100 || type.length > 40) fail('Voucher number or type is too long.');
    let clause = '';
    if (type) {
        request.input('voucherType', sql.NVarChar(40), type);
        clause += ' AND LTRIM(RTRIM(vt.Title))=@voucherType';
    }
    if (number) {
        const literal = number.replace(/[~%_\[]/g, char => '~' + char);
        request.input('s', sql.NVarChar(220), '%' + literal + '%');
        clause += numberOnly
            ? " AND v.VoucherNo LIKE @s ESCAPE '~'"
            : " AND (v.VoucherNo LIKE @s ESCAPE '~' OR v.Remarks LIKE @s ESCAPE '~')";
    }
    return clause;
}
module.exports = { applyVoucherFilters };
