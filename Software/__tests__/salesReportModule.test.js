const fs = require('fs');
const path = require('path');
const vm = require('vm');

jest.mock('../config/db', () => ({
    getPool: jest.fn(), sql: { DateTime: 'datetime', NVarChar: () => 'nvarchar' },
}));
const { getPool } = require('../config/db');
const router = require('../routes/salesReportsRoutes');
const controller = require('../controllers/salesReportsController');

// Execute the shared navigation definitions with icon imports stubbed. These
// are the same access functions used by the dashboard, sidebar and launcher.
const source = fs.readFileSync(path.join(__dirname, '../frontend/src/navigationConfig.js'), 'utf8')
    .replace(/import\s*{([\s\S]*?)}\s*from 'lucide-react';/, (_, names) =>
        `const { ${names.replace(/(\w+) as (\w+)/g, '$1: $2')} } = icons;`)
    .replace(/export (const|function) /g, '$1 ');
const context = { icons: new Proxy({}, { get: () => () => null }), module: { exports: {} } };
vm.runInNewContext(`${source}\nmodule.exports = { getModuleActions, getVisibleModuleGroups, getVisibleReports, getDashboardForUser };`, context);
const nav = context.module.exports;
const routes = [
    ['/booking-register', 'report:booking_register'],
    ['/cancelled-booking-register', 'report:booking_register'],
    ['/customer-balances', 'report:booking_register'],
    ['/booking-payments', 'report:booking_register'],
    ['/booking-payments/options', 'report:booking_register'],
    ['/vehicle-inventory', 'report:vehicle_inventory'],
    ['/vehicle-inventory-options', 'report:vehicle_inventory'],
    ['/vehicle-inventory-by-variant', 'report:vehicle_inventory'],
    ['/vehicle-inventory-ledger', 'report:vehicle_inventory'],
    ['/executive-performance', 'report:executive_performance'],
    ['/customer-advances-aging', 'report:customer_advances_aging'],
    ['/booking-pipeline', 'report:booking_pipeline'],
    ['/master-invoice-aging', 'report:master_invoice_aging'],
    ['/incentive-receivable-aging', 'report:incentive_receivable_aging'],
    ['/booking-account-reconciliation', 'report:booking_account_reconciliation'],
];
const no = () => false;
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
const guard = route => router.stack.find(layer => layer.route?.path === route).route.stack[0].handle;
beforeEach(() => jest.clearAllMocks());

test('dedicated module exposes all thirteen reports on the dashboard, sidebar and My Reports', () => {
    const hasModule = key => key === 'sales_reports';
    const reports = nav.getModuleActions('sales-reports', hasModule, no);
    expect(reports).toHaveLength(13);
    expect(new Set(reports.map(item => item.path)).size).toBe(13);
    expect(reports.every(item => item.description)).toBe(true);
    expect(nav.getVisibleModuleGroups(hasModule, no)).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'sales-reports', label: 'Sale Module Reports', path: '/module/sales-reports' }),
    ]));
    expect(nav.getDashboardForUser(hasModule, no).moduleCards.some(group => group.id === 'sales-reports')).toBe(true);
    expect(nav.getVisibleReports(hasModule, no).filter(item => item.moduleGroup === 'sales-reports')).toHaveLength(13);
    expect(nav.getModuleActions('reports', hasModule, no).some(item => item.path.startsWith('/reports/sales/'))).toBe(false);
});

test('analytics links choose the requested report rather than always opening the pipeline', () => {
    const paths = nav.getModuleActions('sales-reports', () => true, () => true).map(item => item.path);
    expect(paths).toEqual(expect.arrayContaining([
        '/sales/reports?tab=pipeline', '/sales/reports?tab=miAging',
        '/sales/reports?tab=incAging', '/sales/reports?tab=bvrRecon',
    ]));
});

test('without report access the module and its shortcut are hidden', () => {
    expect(nav.getModuleActions('sales-reports', no, no)).toHaveLength(0);
    expect(nav.getVisibleModuleGroups(no, no).some(group => group.id === 'sales-reports')).toBe(false);
    expect(nav.getModuleActions('sales', no, no).some(item => item.id === 's-reports')).toBe(false);
});

test.each([...new Set(routes.map(([, permission]) => permission))])('individual %s keeps access limited to its reports', permission => {
    const hasPermission = key => key === permission;
    const reports = nav.getModuleActions('sales-reports', no, hasPermission);
    expect(reports.length).toBe(permission === 'report:booking_register' ? 4 : permission === 'report:vehicle_inventory' ? 3 : 1);
    expect(reports.every(item => item.permission === permission)).toBe(true);
    expect(nav.getModuleActions('sales', no, hasPermission).find(item => item.id === 's-reports')?.path).toBe('/module/sales-reports');
});

test.each(routes)('%s enforces broad or specific report access on the server', (route, permission) => {
    const middleware = guard(route);
    for (const permissions of [['sales_reports'], [permission]]) {
        const next = jest.fn(); middleware({ user: { groupId: 2, permissions } }, response(), next);
        expect(next).toHaveBeenCalledTimes(1);
    }
    for (const permissions of [[], ['sales_executive'], ['report:trial_balance']]) {
        const next = jest.fn(), res = response(); middleware({ user: { groupId: 2, permissions } }, res, next);
        expect(next).not.toHaveBeenCalled(); expect(res.code).toBe(403);
    }
    const next = jest.fn(); middleware({ user: { groupId: 1, permissions: [] } }, response(), next);
    expect(next).toHaveBeenCalledTimes(1);
});

function database(rows) {
    const values = {}, query = jest.fn(async () => ({ recordset: rows }));
    getPool.mockResolvedValue({ request: () => ({ input(key, type, value) { values[key] = value; return this; }, query }) });
    return { query, values };
}

test('pipeline uses inquiry creation and completed cancellation dates from the actual schema', async () => {
    const { query, values } = database([{ Inquiries: 10, Bookings: 8, Allocated: 5, MasterInvoiced: 4, Delivered: 3, Cancelled: 2 }]);
    const res = response();
    await controller.bookingPipeline({ query: { from: '2026-10-01', to: '2026-10-23' } }, res);
    expect(res.code).toBe(200); expect(res.body.cancelled).toBe(2);
    expect(res.body.stages[1]).toMatchObject({ count: 8, conversion: 80 });
    expect(query.mock.calls[0][0]).toContain('OpenedAt BETWEEN @from AND @to');
    expect(query.mock.calls[0][0]).toContain("CancelledAt BETWEEN @from AND @to AND Status='Cancelled'");
    expect(query.mock.calls[0][0]).not.toContain('RequestedAt'); expect(values.from).toBeInstanceOf(Date);
});

test('invoice aging joins chassis and variant, using allocation history with an explicit date fallback', async () => {
    const { query } = database([{ BookingID: 7, DaysSinceAlloc: 9, AllocationDateEstimated: true }]);
    const res = response(); await controller.masterInvoiceAging({ query: {} }, res);
    const statement = query.mock.calls[0][0];
    expect(statement).toContain('v.VariantID = b.VehicleVariantID');
    expect(statement).toContain('veh.ChasisNo AS AllocatedChasisNo');
    expect(statement).toContain("t.ToState='Allocated' AND t.FromState<>'Allocated'");
    expect(statement).toContain('COALESCE(allocation.At,b.BookingDate,b.CreatedAt)');
    expect(statement).not.toContain('b.AllocatedAt');
    expect(res.body).toMatchObject({ total: 1, buckets: { '8-14 days': 1 } });
    expect(res.body.rows[0].AllocationDateEstimated).toBe(true);
});
