const express = require('express');
const router = express.Router();
const c = require('../controllers/hrSalaryController');
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

// Calculated salary sheet for one month
router.get( '/salary-sheet/:monthId',   requirePerm('hr_salary', 'view'),       c.getSalarySheet);
router.get( '/salary-slip/:monthId/:employeeId', requirePerm('hr_salary', 'view'), c.getEmployeeSlip);

// Voucher postings (guarded by hr_salary_post)
router.post('/post/accrual',            requirePerm('hr_salary_post'),          c.postAccrual);
router.post('/post/pay-bank',           requirePerm('hr_salary_post'),          c.postPayBank);
router.post('/post/pay-cash',           requirePerm('hr_salary_post'),          c.postPayCash);
router.get( '/postings',                requirePerm('hr_salary', 'view'),       c.listPostings);

module.exports = router;
