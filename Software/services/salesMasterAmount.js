/** Only an explicit Master agreement overrides the variant rate or original fallback. */
function masterAmountDue(booking) {
    if (Number(booking.MasterAgreedAmount) > 0) return Number(booking.MasterAgreedAmount);
    if (Number(booking.WholesalePrice) > 0) return Number(booking.WholesalePrice);
    if (Number(booking.MasterPriceBeforeDiscount) > 0) return Number(booking.MasterPriceBeforeDiscount);
    return Number(booking.NegotiatedPrice || 0);
}
module.exports = { masterAmountDue };
