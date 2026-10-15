/** Customer discounts never reduce Master's defined rate (or its original fallback). */
function masterAmountDue(booking) {
    if (Number(booking.WholesalePrice) > 0) return Number(booking.WholesalePrice);
    if (Number(booking.MasterPriceBeforeDiscount) > 0) return Number(booking.MasterPriceBeforeDiscount);
    return Number(booking.NegotiatedPrice || 0);
}
module.exports = { masterAmountDue };
