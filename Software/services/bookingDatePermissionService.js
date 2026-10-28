const KEY = 'sales_booking_date';
// Explicitly revocable for Group 1; GM/catalog rights cannot bypass it.
const canChangeBookingDate = user => user?.groupId === 1 && Array.isArray(user?.permissions) && user.permissions.includes(KEY);
const requireBookingDateAdmin = (req, res, next) => canChangeBookingDate(req.user) ? next()
    : res.status(403).json({ error: 'Changing booking dates requires the Administrator role and Change Booking Date admin right.', missing: KEY });
module.exports = { KEY, canChangeBookingDate, requireBookingDateAdmin };
