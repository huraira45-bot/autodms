export function masterAmountDue(booking) {
    if (Number(booking.MasterAgreedAmount) > 0) return Number(booking.MasterAgreedAmount);
    if (Number(booking.WholesalePrice) > 0) return Number(booking.WholesalePrice);
    return Number(booking.MasterPriceBeforeDiscount || booking.NegotiatedPrice || 0);
}
