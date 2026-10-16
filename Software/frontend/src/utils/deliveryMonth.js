export const deliveryMonthValue = value => value ? String(value).slice(0, 7) : '';
export const formatDeliveryMonth = value => value
    ? new Date(`${deliveryMonthValue(value)}-01T00:00:00Z`).toLocaleDateString('en-PK', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : 'Not set';
