function parseDmsBookingNumber(value) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error('DMS booking number is required for a new booking.');
    const number = value.trim();
    if (number.length > 100 || /[\u0000-\u001f\u007f]/.test(number))
        throw new Error('DMS booking number must be at most 100 characters without control characters.');
    return number;
}
module.exports = { parseDmsBookingNumber };
