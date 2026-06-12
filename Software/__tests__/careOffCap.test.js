const { computeLineDiscAmt, validateDiscountCap } = require('../utils/careOffUtils');

describe('computeLineDiscAmt', () => {
    test('percent discount', () => {
        expect(computeLineDiscAmt({ Price: 100, Discount: 10, DiscType: 'Percent' })).toBe(10);
    });
    test('amount discount', () => {
        expect(computeLineDiscAmt({ Price: 100, Discount: 25, DiscType: 'Amount' })).toBe(25);
    });
    test('amount discount capped at line price', () => {
        expect(computeLineDiscAmt({ Price: 50, Discount: 100, DiscType: 'Amount' })).toBe(50);
    });
    test('no DiscType returns 0', () => {
        expect(computeLineDiscAmt({ Price: 100, Discount: 10, DiscType: null })).toBe(0);
    });
    test('zero price returns 0', () => {
        expect(computeLineDiscAmt({ Price: 0, Discount: 10, DiscType: 'Percent' })).toBe(0);
    });
    test('zero discount returns 0', () => {
        expect(computeLineDiscAmt({ Price: 100, Discount: 0, DiscType: 'Percent' })).toBe(0);
    });
    test('percent rounds to 3 decimal places', () => {
        expect(computeLineDiscAmt({ Price: 33.33, Discount: 10, DiscType: 'Percent' })).toBe(3.333);
    });
});

describe('validateDiscountCap', () => {
    test('exactly at cap — valid', () => {
        const items = [
            { Price: 50, Discount: 5, DiscType: 'Amount' },
            { Price: 50, Discount: 5, DiscType: 'Amount' }
        ];
        const result = validateDiscountCap(items, 10);
        expect(result.valid).toBe(true);
        expect(result.totalDiscount).toBe(10);
        expect(result.maxAllowed).toBe(10);
    });
    test('one rupee over cap — invalid', () => {
        const items = [
            { Price: 50, Discount: 5.01, DiscType: 'Amount' },
            { Price: 50, Discount: 5, DiscType: 'Amount' }
        ];
        const result = validateDiscountCap(items, 10);
        expect(result.valid).toBe(false);
        expect(result.totalDiscount).toBe(10.01);
    });
    test('mixed percent and value — within cap', () => {
        const items = [
            { Price: 50, Discount: 10, DiscType: 'Percent' }, // = 5 rupees
            { Price: 50, Discount: 3, DiscType: 'Amount' }    // = 3 rupees
        ];
        const result = validateDiscountCap(items, 10); // max = 10 rupees
        expect(result.valid).toBe(true);
        expect(result.totalDiscount).toBe(8);
    });
    test('mixed percent and value — over cap', () => {
        const items = [
            { Price: 50, Discount: 15, DiscType: 'Percent' }, // = 7.5 rupees
            { Price: 50, Discount: 3, DiscType: 'Amount' }    // = 3 rupees
        ];
        const result = validateDiscountCap(items, 10); // max = 10 rupees
        expect(result.valid).toBe(false);
        expect(result.totalDiscount).toBe(10.5);
    });
    test('no discounts (no Care-Off case) — valid', () => {
        const items = [{ Price: 100, Discount: 0, DiscType: null }];
        const result = validateDiscountCap(items, 10);
        expect(result.valid).toBe(true);
        expect(result.totalDiscount).toBe(0);
    });
    test('zero cap — any discount is invalid', () => {
        const items = [{ Price: 100, Discount: 0.01, DiscType: 'Amount' }];
        const result = validateDiscountCap(items, 0);
        expect(result.valid).toBe(false);
    });
    test('removing a line increases headroom', () => {
        // two lines, discount uses full cap
        const withBoth = [
            { Price: 50, Discount: 5, DiscType: 'Amount' },
            { Price: 50, Discount: 5, DiscType: 'Amount' }
        ];
        expect(validateDiscountCap(withBoth, 10).valid).toBe(true);

        // remove first line — total job amount drops to 50, max drops to 5, discount still 5 → still valid (exactly)
        const withOne = [{ Price: 50, Discount: 5, DiscType: 'Amount' }];
        expect(validateDiscountCap(withOne, 10).valid).toBe(true);

        // now add a line with higher discount — would have been fine with 2 lines, now invalid
        const overflow = [{ Price: 50, Discount: 6, DiscType: 'Amount' }];
        expect(validateDiscountCap(overflow, 10).valid).toBe(false);
    });
    test('adding a new line increases cap headroom', () => {
        // single line at cap
        const one = [{ Price: 100, Discount: 10, DiscType: 'Amount' }];
        expect(validateDiscountCap(one, 10).valid).toBe(true);

        // adding a second line raises total amount → raises cap → now have 20 max, still only 10 used
        const two = [
            { Price: 100, Discount: 10, DiscType: 'Amount' },
            { Price: 100, Discount: 0, DiscType: null }
        ];
        const result = validateDiscountCap(two, 10);
        expect(result.valid).toBe(true);
        expect(result.maxAllowed).toBe(20);
    });
});
