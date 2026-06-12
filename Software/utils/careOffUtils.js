function computeLineDiscAmt(item) {
    const price = Number(item.Price) || 0;
    const disc = Number(item.Discount) || 0;
    if (!item.DiscType || disc === 0 || price === 0) return 0;
    if (item.DiscType === 'Percent') return +(price * disc / 100).toFixed(3);
    return +Math.min(disc, price).toFixed(3);
}

function validateDiscountCap(labourItems, maxDiscountPct) {
    const totalJobAmount = labourItems.reduce((s, i) => s + (Number(i.Price) || 0), 0);
    const maxAllowed = +(totalJobAmount * (Number(maxDiscountPct) / 100)).toFixed(2);
    const totalDiscount = +labourItems.reduce((s, i) => s + computeLineDiscAmt(i), 0).toFixed(2);
    return {
        valid: totalDiscount <= maxAllowed + 0.005,
        totalDiscount,
        maxAllowed
    };
}

module.exports = { computeLineDiscAmt, validateDiscountCap };
