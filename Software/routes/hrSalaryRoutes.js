const express = require('express');
const router = express.Router();
const c  = require('../controllers/hrSalaryController');
const da = require('../controllers/hrDeptAccountsController');
const { requirePerm } = require('../middleware/permissions');

// Attendance
router.get( '/attendance',              requirePerm('hr_attendance', 'view'),   c.listAttendance);
router.post('/attendance',              requirePerm('hr_attendance', 'insert'), c.saveAttendance);

// Salary entries
router.get( '/salary',                  requirePerm('hr_salary', 'view'),       c.listSalaryEntries);
router.post('/salary',                  requirePerm('hr_salary', 'insert'),     c.saveSalaryEntry);

// Fine settings
router.get( '/fine-settings',           requirePerm('hr_settings', 'view'),     c.getFineSettings);
router.post('/fine-settings',           requirePerm('hr_settings', 'edit'),     c.saveFineSettings);
router.get( '/monthly-settings',        requirePerm('hr_settings', 'view'),     c.listMonthlySettings);
router.post('/monthly-settings',        requirePerm('hr_settings', 'edit'),     c.saveMonthlySettings);

// Per-department salary GL accounts
router.get( '/dept-accounts',           requirePerm('hr_settings', 'view'),     da.list);
router.put( '/dept-accounts/:departmentId', requirePerm('hr_settings', 'edit'), da.upsert);

// Calculated salary sheet for one month
router.get( '/salary-sheet/:monthId',   requirePerm('hr_salary', 'view'),       c.getSalarySheet);
router.get( '/salary-slip/:monthId/:employeeId', requirePerm('hr_salary', 'view'), c.getEmployeeSlip);

// Voucher posting — only the Accrual JV remains per owner ask 2026-07-29.
// The old Pay Bank / Pay Cash routes were removed; actual disbursement
// clears Employee GL via existing BPV/CPV screens.
router.post('/post/accrual',            requirePerm('hr_salary_post'),          c.postAccrual);
router.get( '/postings',                requirePerm('hr_salary', 'view'),       c.listPostings);

module.exports = router;
