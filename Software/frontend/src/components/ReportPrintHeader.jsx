/**
 * ReportPrintHeader — kept as a thin re-export of the unified
 * PrintBusinessHeader component (owner ask 2026-07-04).
 *
 * ReportShell and any legacy report page that still does
 * `import ReportPrintHeader from '../components/ReportPrintHeader'` keeps
 * working; new code should import PrintBusinessHeader directly.
 */
export { default } from './PrintBusinessHeader';
export { getBusinessProfile } from '../utils/businessProfile';
