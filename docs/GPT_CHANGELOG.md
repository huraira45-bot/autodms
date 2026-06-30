# GPT Change Log

This file documents changes made by GPT/Codex in this repository.

The goal is simple: every future code, documentation, configuration, or repository-management change should have a written trail that explains what changed, why it changed, and how it was checked.

## Documentation Rules

For each change, record:

- Date.
- Files changed.
- Reason for the change.
- Summary of the change.
- Verification performed.
- Notes or risks.

If the working tree already contains unrelated user changes, record them as pre-existing and do not attribute them to GPT/Codex.

## Current Baseline

Date: 2026-06-15

At the time this change log was created, the working tree already had uncommitted source changes that were not made by GPT/Codex in this turn:

- `Software/controllers/partyController.js`
- `Software/frontend/src/App.jsx`
- `Software/frontend/src/pages/Customers.jsx`
- `Software/frontend/src/pages/JobCardForm.jsx`
- `Software/routes/partyRoutes.js`
- `Software/server.js`
- `Software/controllers/partsReportsController.js`
- `Software/controllers/salesReportsController.js`
- `Software/controllers/serviceCampaignController.js`
- `Software/controllers/serviceReportsController.js`
- `Software/frontend/src/components/CampaignBox.jsx`
- `Software/frontend/src/pages/ServiceCampaignsAdmin.jsx`
- `Software/frontend/src/pages/reports/Parts.jsx`
- `Software/frontend/src/pages/reports/Sales.jsx`
- `Software/frontend/src/pages/reports/Service.jsx`
- `Software/routes/partsReportsRoutes.js`
- `Software/routes/salesReportsRoutes.js`
- `Software/routes/serviceCampaignRoutes.js`
- `Software/routes/serviceReportsRoutes.js`

These files should be treated carefully. GPT/Codex should not revert or overwrite them unless explicitly asked.

## Previous GPT/Codex Changes

### 2026-06-12 - Findings Report

Files changed:

- `gptfindings.md`

Reason:

- User asked for a saved file containing the codebase read-through findings.

Summary:

- Added a repository-level architecture and findings summary covering backend, frontend, database, migrations, tests, risks, and practical starting points.

Verification:

- File was created successfully.

Notes:

- Documentation-only change.

### 2026-06-12 - Local Git Setup

Files changed:

- `.gitignore`
- `.git/` repository metadata

Reason:

- User asked to connect the project to GitHub.

Summary:

- Initialized a local Git repository on `main`.
- Added a root `.gitignore`.
- Ignored environment files, dependencies, build outputs, uploads, backups, database backup files, Excel files, and customer data.
- Created initial commit `d022dd2 Initial commit`.

Verification:

- Confirmed commit existed with `git log --oneline -1`.
- Confirmed no Git remote was configured yet.

Notes:

- GitHub push was not completed because no GitHub remote URL was provided and GitHub CLI was not installed.

### 2026-06-12 - Frontend User-Friendliness Report

Files changed:

- `frontend_user_friendliness_report.md`

Reason:

- User asked for a report explaining how to make the frontend extremely user friendly without touching application code.

Summary:

- Added a UX/product report covering dashboards, navigation, design system consistency, forms, tables, workflow redesign, module-specific recommendations, accessibility, performance, reporting UX, and roadmap phases.

Verification:

- File was created successfully.

Notes:

- Documentation-only change.
- This file is currently uncommitted as of the 2026-06-15 baseline.

## Change Entries

### 2026-06-15 - Add GPT Change Log

Files changed:

- `docs/GPT_CHANGELOG.md`

Reason:

- User asked to document every change GPT/Codex makes.

Summary:

- Added this dedicated change log.
- Recorded documentation rules.
- Recorded the current working-tree baseline.
- Recorded prior GPT/Codex changes from this conversation.

Verification:

- File was created successfully.

Notes:

- Documentation-only change.

### 2026-06-15 - Frontend UX Foundation Pass

Files changed:

- `Software/frontend/src/App.jsx`
- `Software/frontend/src/components/CommandPalette.jsx`
- `Software/frontend/src/components/WorkspaceTopBar.jsx`
- `Software/frontend/src/pages/Dashboard.jsx`
- `Software/frontend/src/index.css`
- `docs/GPT_CHANGELOG.md`

Reason:

- User asked to make the frontend extremely user friendly and to document every change.

Summary:

- Added an app-wide command/search palette for fast navigation across pages, reports, and common work areas.
- Added a workspace top bar with breadcrumbs, current page context, date, and search entry point.
- Replaced the old dashboard with a role-aware daily workspace that surfaces practical actions based on assigned modules.
- Added dashboard work-area panels, report shortcuts, better birthday handling, empty states, and warning states.
- Added shared global styling for focus states, workspace shell, command palette, action cards, dashboard panels, empty states, and responsive layouts.
- Kept changes focused on frontend UX shell and dashboard; no backend business logic was changed.

Verification:

- `npx.cmd eslint src\components\CommandPalette.jsx src\components\WorkspaceTopBar.jsx src\pages\Dashboard.jsx src\App.jsx` passed.
- `npm.cmd run build` passed.
- Initial `npm run build` failed because PowerShell blocked `npm.ps1`; reran successfully through `npm.cmd`.
- Full `npm.cmd run lint` was attempted and failed due to many pre-existing lint errors in unrelated frontend files, plus uncommitted files that already existed before this UX pass.
- `npm.cmd run dev -- --host 127.0.0.1 --port 5173` started successfully in the foreground; detached/background launches were cleaned up by the execution environment before the port stayed open.

Notes:

- Existing uncommitted source changes were present before this pass and were not reverted.
- Build output under `Software/frontend/dist/` remains ignored by Git.
- Temporary Vite log files created during dev-server troubleshooting are ignored by Git through `*.log`.
- Vite reported a large bundle warning after build; this is not caused by a compile error and should be addressed later with route-level code splitting.

### 2026-06-15 - Frontend Feedback And Safer Confirmation Pass

Files changed:

- `Software/frontend/src/App.jsx`
- `Software/frontend/src/components/FeedbackProvider.jsx`
- `Software/frontend/src/context/FeedbackContext.jsx`
- `Software/frontend/src/index.css`
- `Software/frontend/src/pages/VoucherEntry.jsx`
- `Software/frontend/src/pages/GRN.jsx`
- `Software/frontend/src/pages/GRTN.jsx`
- `Software/frontend/src/pages/JobCardForm.jsx`
- `Software/frontend/src/pages/StoreSale.jsx`
- `Software/frontend/src/pages/SSR.jsx`
- `docs/GPT_CHANGELOG.md`

Reason:

- Continue the frontend user-friendliness makeover by replacing disruptive browser popups with consistent in-app feedback and safer confirmations for high-impact transaction flows.

Summary:

- Added a shared `FeedbackProvider` with toast notifications and async confirmation dialogs.
- Added `FeedbackContext`/`useFeedback` so pages can use the feedback system without mixing hooks and components in one file.
- Wired `FeedbackProvider` into the authenticated app shell.
- Added global CSS for toast notifications, confirmation dialogs, focus states, and action buttons.
- Replaced browser `alert()` and `window.confirm()` usage in priority transaction screens:
  - Finance voucher save/delete/post/unfinalize reason validation.
  - GRN save/finalize/unfinalize request flows.
  - GRTN save/finalize/unfinalize request flows.
  - Job Card finalization and unfinalize request validation.
  - Store Sale validation/finalize flow.
  - Store Sale Return validation/finalize flow.
- Added clearer user-facing language for financial/inventory consequences before finalizing/posting.

Verification:

- `npm.cmd run build` passed.
- `npx.cmd eslint src\components\FeedbackProvider.jsx src\context\FeedbackContext.jsx src\App.jsx` passed.
- `rg -n "alert\(|window\.confirm" ...` against the edited priority pages returned no matches.
- `git diff --check` passed for the frontend files touched in this pass.

Notes:

- Full frontend lint was not rerun in this pass because it is already known to fail on unrelated pre-existing lint issues.
- Existing uncommitted changes in `StoreSale.jsx` and `JobCardForm.jsx` were preserved and worked with rather than reverted.
- Build still reports the existing large bundle warning; route-level code splitting remains a future improvement.

### 2026-06-15 - Non-Job-Card UI Polish Pass

Files changed:

- `Software/frontend/src/App.jsx`
- `Software/frontend/src/components/UXPrimitives.jsx`
- `Software/frontend/src/index.css`
- `Software/frontend/src/pages/Customers.jsx`
- `Software/frontend/src/pages/sales/BookingsList.jsx`
- `docs/GPT_CHANGELOG.md`

Reason:

- User asked to continue updating the UI but leave the Job Card screen alone.

Summary:

- Added reusable UI primitives for consistent non-job-card screens:
  - `PageHeader`
  - `FilterBar`
  - `SearchField`
  - `EmptyState`
  - `StatusPill`
  - `DataCard`
- Added a visible sidebar "Search menu" trigger that opens the command palette and advertises `Ctrl K`.
- Added global styles for page headers, filter bars, search fields, data cards, status pills, and page stacking.
- Updated the Customers/Parties screen with:
  - Shared feedback toasts for load/save validation and API failures.
  - Shared status pills for party type badges.
  - Cleaner page spacing through `ux-page-stack`.
- Updated the Vehicle Bookings list with:
  - Shared `PageHeader`.
  - Shared `FilterBar`.
  - Shared `DataCard`.
  - Shared `StatusPill` for booking status.

Verification:

- `npm.cmd run build` passed.
- `npx.cmd eslint src\components\UXPrimitives.jsx src\App.jsx` passed.
- `git diff --check` passed for the files touched in this pass.
- Targeted lint including `Customers.jsx` and `BookingsList.jsx` was attempted but still reports pre-existing `react-hooks/set-state-in-effect` issues in those pages.

Notes:

- `Software/frontend/src/pages/JobCardForm.jsx` was not edited in this pass.
- Existing Job Card modifications from earlier passes remain in the working tree.
- Build still reports the existing large bundle warning.

### 2026-06-15 - Shared UI Normalization And Admin Feedback Pass

Files changed:

- `Software/frontend/src/index.css`
- `Software/frontend/src/pages/Customers.jsx`
- `Software/frontend/src/pages/sales/BookingsList.jsx`
- `Software/frontend/src/pages/WorkshopSettings.jsx`
- `docs/GPT_CHANGELOG.md`

Reason:

- User asked to fix the UI while leaving the Job Card form alone.

Summary:

- Added shared global styling for button variants, icon buttons, disabled states, form inputs, textareas, responsive 3/4-column grids, search boxes, modal shells, loading states, table empty rows, action rows, and app-wide spinner animation.
- Improved responsive behavior for shared page headers, filter bars, forms, cards, and grid layouts.
- Finished the Parties screen migration to shared `PageHeader`, `FilterBar`, `SearchField`, `DataCard`, and `EmptyState` components.
- Finished the Vehicle Bookings list migration to shared search, empty-state, table card, and clickable-row behavior.
- Replaced Workshop Settings browser alerts/confirms with the app feedback toast and confirmation dialog system for business types, order types, bay deactivation, bay save, counter save, and manager assignment errors.
- Removed a now-unused `React` import from `WorkshopSettings.jsx`.

Verification:

- `npm.cmd run build` passed.
- `rg -n "alert\(|window\.confirm|window\.prompt" ...` against `WorkshopSettings.jsx`, `Customers.jsx`, and `BookingsList.jsx` returned no matches.
- `git diff --check -- Software/frontend/src/index.css Software/frontend/src/pages/Customers.jsx Software/frontend/src/pages/sales/BookingsList.jsx Software/frontend/src/pages/WorkshopSettings.jsx` passed, with only Git line-ending warnings.
- Focused lint was rerun on `WorkshopSettings.jsx`, `Customers.jsx`, `BookingsList.jsx`, and `UXPrimitives.jsx`; it still fails only on existing `react-hooks/set-state-in-effect` findings in data-loading effects.

Notes:

- `Software/frontend/src/pages/JobCardForm.jsx` was not edited in this pass.
- A scan showed `JobCardForm.jsx` does not use the shared class names normalized in this pass.
- Build still reports the existing large bundle warning.

### 2026-06-15 - Maintenance Screens Feedback Pass

Files changed:

- `Software/frontend/src/pages/Accessories.jsx`
- `Software/frontend/src/pages/LabourServices.jsx`
- `Software/frontend/src/pages/InventorySettings.jsx`
- `Software/frontend/src/pages/Settings.jsx`
- `Software/frontend/src/pages/PartsIssue.jsx`
- `Software/frontend/src/pages/SubletRepair.jsx`
- `Software/frontend/src/pages/WorkshopCustomers.jsx`
- `docs/GPT_CHANGELOG.md`

Reason:

- Continue the non-Job-Card frontend UI cleanup by removing disruptive browser popups from common maintenance and workshop screens.

Summary:

- Replaced native browser `alert()` and `window.confirm()` usage with the shared feedback toast and confirmation dialog system in:
  - Accessories master save/deactivate flows.
  - Labour & Services save flow.
  - Inventory Settings category, brand, UOM, and warehouse add flows.
  - Master Settings department, designation, category, and UOM add flows.
  - Parts Issue validation, success, and API error flows.
  - Sublet Repair validation, save, delete confirmation, and API error flows.
  - Workshop Customers customer and vehicle save flows.
- Updated Accessories with shared status pills, empty state, loading state, icon buttons, and modal shell classes.
- Updated Labour & Services with a shared empty state and modal shell classes.
- Removed redundant local spinner CSS where the app-wide spinner class now covers the behavior.
- Removed unused React default imports from the touched files.

Verification:

- `npm.cmd run build` passed.
- `rg -n "alert\(|window\.confirm|window\.prompt" ...` against the touched files returned no matches.
- `git diff --check` passed for the touched files, with only Git line-ending warnings.
- Focused lint was rerun on the touched files; it still fails only on existing `react-hooks/set-state-in-effect` findings and one existing `react-hooks/exhaustive-deps` warning in data-loading effects.

Notes:

- `Software/frontend/src/pages/JobCardForm.jsx` was not edited in this pass.
- Build still reports the existing large bundle warning.

### 2026-06-15 - Finance And HR Feedback Pass

Files changed:

- `Software/frontend/src/pages/ChartOfAccounts.jsx`
- `Software/frontend/src/pages/Employees.jsx`
- `Software/frontend/src/pages/HRSettings.jsx`
- `docs/GPT_CHANGELOG.md`

Reason:

- Continue removing disruptive browser feedback from non-Job-Card screens and make finance/HR administration flows feel consistent with the shared app UI.

Summary:

- Replaced `alert()` usage in Chart of Accounts account creation and bank-account toggles with shared toast notifications.
- Replaced employee save and technician-toggle feedback with shared toast notifications.
- Replaced HR Settings department, designation, manager, and reporting-line save errors with shared toast notifications.
- Added success feedback for Chart of Accounts, Employees, and HR Settings actions.
- Updated HR Settings and related master settings screens to use the shared `PageHeader` layout.
- Removed unused React/default imports and a stale Chart of Accounts icon import.

Verification:

- `npm.cmd run build` passed.
- `rg -n "alert\(|window\.confirm|window\.prompt" ...` against `ChartOfAccounts.jsx`, `Employees.jsx`, and `HRSettings.jsx` returned no matches.
- `git diff --check` passed for the touched files, with only Git line-ending warnings.
- Focused lint was rerun on the touched files; it still fails only on existing `react-hooks/set-state-in-effect` findings in data-loading effects.

Notes:

- `Software/frontend/src/pages/JobCardForm.jsx` was not edited in this pass.
- Build still reports the existing large bundle warning.

### 2026-06-15 - Sales Admin Confirmation Pass

Files changed:

- `Software/frontend/src/pages/sales/VehicleModelsAdmin.jsx`
- `Software/frontend/src/pages/sales/VehicleVariantsAdmin.jsx`
- `Software/frontend/src/pages/sales/VehicleInventoryAdmin.jsx`
- `Software/frontend/src/pages/sales/IncentivePoliciesAdmin.jsx`
- `docs/GPT_CHANGELOG.md`

Reason:

- Continue the frontend UI cleanup by replacing browser delete confirmations in sales administration screens.

Summary:

- Replaced destructive `window.confirm()` calls with the shared async confirmation dialog for:
  - Vehicle model deletion.
  - Vehicle variant deletion.
  - Vehicle chassis deletion.
  - Incentive policy deletion.
- Added clearer confirmation copy describing why each delete may be blocked by related records.
- Removed unused React default imports from the touched sales admin files.
- Replaced an empty catch block in the incentive policy editor with visible inline error handling.

Verification:

- `npm.cmd run build` passed.
- `rg -n "alert\(|window\.confirm|window\.prompt|import React" ...` against the touched sales admin files returned no matches.
- `git diff --check` passed for the touched files, with only Git line-ending warnings.
- Focused lint was rerun on the touched files; it still fails on existing `react-hooks/set-state-in-effect` findings and the existing `react-refresh/only-export-components` pattern in `VehicleModelsAdmin.jsx`.

Notes:

- `Software/frontend/src/pages/JobCardForm.jsx` was not edited in this pass.
- Build still reports the existing large bundle warning.

### 2026-06-15 - CRO Admin Confirmation Pass

Files changed:

- `Software/frontend/src/pages/InquiriesAdmin.jsx`
- `Software/frontend/src/pages/KYCFlagsAdmin.jsx`
- `Software/frontend/src/pages/SurveyTemplatesAdmin.jsx`
- `Software/frontend/src/pages/RemindersAdmin.jsx`
- `docs/GPT_CHANGELOG.md`

Reason:

- Continue replacing browser-native confirmations in non-Job-Card administration screens with the shared app confirmation dialog.

Summary:

- Replaced destructive/cautionary `window.confirm()` calls with the shared async confirmation dialog for:
  - Inquiry deletion.
  - KYC flag deletion.
  - Survey template deletion.
  - Reminder cancellation.
  - Reminder back-fill.
- Added clearer confirmation copy describing permanent deletes, acknowledgment removal, and reminder back-fill behavior.
- Removed unused React default imports from the touched CRO admin files.
- Removed unused icon imports from Reminders and Survey Templates.

Verification:

- `npm.cmd run build` passed.
- `rg -n "alert\(|window\.confirm|window\.prompt|import React" ...` against the touched CRO admin files returned no matches.
- `git diff --check` passed for the touched files, with only Git line-ending warnings.
- Focused lint was rerun on the touched files; it still fails only on existing `react-hooks/set-state-in-effect` findings in data-loading effects.

Notes:

- `Software/frontend/src/pages/JobCardForm.jsx` was not edited in this pass.
- Build still reports the existing large bundle warning.

### 2026-06-15 - Campaign Survey Complaint Confirmation Pass

Files changed:

- `Software/frontend/src/pages/CampaignsAdmin.jsx`
- `Software/frontend/src/pages/SurveysAdmin.jsx`
- `Software/frontend/src/pages/ComplaintDetail.jsx`
- `Software/frontend/src/pages/ServiceCampaignsAdmin.jsx`
- `Software/frontend/src/pages/sales/BookingDetail.jsx`
- `docs/GPT_CHANGELOG.md`

Reason:

- Continue replacing browser-native confirmations in non-Job-Card operational screens with the shared app confirmation dialog.

Summary:

- Replaced `window.confirm()` calls with shared async confirmation dialogs for:
  - Campaign send now, cancel, and draft delete.
  - Survey delete and cancel.
  - Complaint mark-resolved.
  - Service campaign close.
  - Booking document delete.
- Added clearer confirmation copy for irreversible deletes, campaign sending, cancellation, and close behavior.
- Removed unused React default imports and unused icons/props exposed by focused lint in the touched files.

Verification:

- `npm.cmd run build` passed.
- `rg -n "alert\(|window\.confirm|window\.prompt|import React" ...` against the touched files returned no matches.
- `git diff --check` passed for the touched files, with only Git line-ending warnings.
- Focused lint was rerun on the touched files; it still fails only on existing `react-hooks/set-state-in-effect` findings plus one existing `react-hooks/exhaustive-deps` warning in `BookingDetail.jsx`.

Notes:

- `Software/frontend/src/pages/JobCardForm.jsx` was not edited in this pass.
- Prompt-based reason flows still need a dedicated input-modal pass.
- Build still reports the existing large bundle warning.
