# AutoDMS — Dealership Management System

## Project Layout
```
db1/
├── Software/                   ← backend (Node/Express) + frontend (React/Vite)
│   ├── server.js               ← entry point, route registration
│   ├── .env                    ← DB connection string + JWT_SECRET
│   ├── config/
│   │   ├── db.js               ← mssql connection pool
│   │   └── modules.js          ← 22 RBAC module definitions
│   ├── middleware/
│   │   └── auth.js             ← JWT verify → req.user
│   ├── controllers/            ← business logic
│   ├── routes/                 ← express routers
│   ├── uploads/                ← multer file uploads
│   └── frontend/               ← Vite + React SPA
│       └── src/
│           ├── context/AuthContext.jsx   ← login, JWT, hasModule()
│           ├── pages/                   ← one file per screen
│           └── App.jsx                  ← routes + sidebar
├── .claude/PROJECT_STATE.md    ← living project state doc (update it)
├── schema.sql                  ← full DB schema (source of truth for tables)
└── *.sql                       ← setup scripts (already applied)
```

## Running the Project
```powershell
# Backend (from db1/Software/)
npm run dev          # nodemon server.js on :5000

# Frontend (from db1/Software/frontend/)
npm run dev          # Vite on :5173
```

## Tech Stack
- **Backend**: Node.js + Express, `mssql` (ODBC Driver 17), `bcryptjs`, `jsonwebtoken`
- **Frontend**: React 18 + Vite, React Router v6, Axios, Lucide-React icons
- **Database**: SQL Server (localhost), database `temp_db1`, Windows Auth

## Critical Conventions

### Authentication
- JWT in `localStorage` key `dms_token`; Axios interceptor in `main.jsx` attaches it
- `req.user` = `{ userId, userName, groupId, groupTitle, modules: [...] }`
- Permission check: `req.user.modules.includes('module_key')` or `hasModule('module_key')` in React
- 401 from server → interceptor clears token and reloads to `/`

### Password Hashing
- Legacy `GLUser` passwords may use FIS proprietary hash (no `$2b` prefix)
- New DMS passwords always use bcrypt (`$2b$10$...`)
- Detection: `if (user.UserPassword.startsWith('$2b'))` → bcrypt; else → legacy plain compare

### Finalize State Machine
- `IsFinalized` bit column on `Addata_JobCardInfo`, `data_PurchaseInfo`, `data_PurchaseReturnInfo`
- Workflow: `PENDING → AM_APPROVED → COMPLETED` (or `REJECTED` from either active state)
- HTTP 423 returned when mutating a finalized record
- Entity map in `finalizeController.js` is the whitelist — only JOBCARD, GRN, GRTN are valid

### Database Patterns
- Legacy stored procedures (`sp_SavePurchaseGRN`, `sp_SavePurchaseReturn`, etc.) return new IDs — do a follow-up UPDATE to set creator fields, do NOT modify the SP
- Use `new sql.Request(transaction)` for each query inside a transaction loop (avoids "parameter already declared" errors)
- Views (`vw_WorkshopJobCards`, `vw_PurchaseGRNHeader`, `vw_PurchaseReturnHeader`) are used by list endpoints — update them when adding columns

### Frontend Patterns
- `<fieldset disabled={isFinalized}>` to grey-out an entire form section
- Route protection: `<ProtectedRoute moduleKey="...">` wrapper in App.jsx
- All API calls use relative paths (Axios baseURL = `http://localhost:5000`)
- `hasModule(key)` from `useAuth()` for conditional UI rendering

## SQL Quirks (Windows/PowerShell)
- Pass strings with `$` to sqlcmd via PowerShell heredoc `@'...'@` (single-quoted) — double-quoted strings expand `$2b` → nothing
- Do NOT use bash for sqlcmd calls; use PowerShell only
- Split DDL statements with PRINT/GO into separate sqlcmd invocations to avoid parser errors

## Module Keys (RBAC)
| Key | Module |
|-----|--------|
| `workshop_customers` | Workshop Customers |
| `workshop_jobs` | Job Cards (create + search) |
| `workshop_labour` | Labour & Services |
| `workshop_sublet` | Sublet Repairs |
| `workshop_parts_issue` | Parts Issue to Job Card |
| `workshop_settings` | Workshop Settings |
| `parts_spare` | Spare Parts master |
| `procurement_grn` | Receiving (GRN) |
| `procurement_grtn` | Returns (GRTN) |
| `sales_store` | Store Sale |
| `sales_ssr` | Sale Returns (SSR) |
| `inventory_settings` | Parts Config |
| `finance_coa` | Chart of Accounts |
| `finance_vouchers` | Vouchers (CPV/CRV/BPV/BRV/JV) |
| `crm_parties` | Credit Parties |
| `hr_employees` | Employees |
| `hr_settings` | HR Config |
| `admin_users` | User Management |
| `admin_permissions` | Role Permissions |
| `finalize` | Finalize records |
| `am_approve` | Account Manager: approve unfinalize |
| `admin_unfinalize` | Admin: perform unfinalize |

## Key DB Tables
| Table | Purpose |
|-------|---------|
| `GLUser` | Login credentials (legacy FIS system) |
| `GLUserGroup` | Roles |
| `dms_ModulePermissions` | Role ↔ module mapping |
| `dms_UnfinalizeRequests` | Unfinalize approval workflow |
| `Addata_JobCardInfo` | Workshop job cards |
| `data_PurchaseInfo` | GRN (goods received notes) |
| `data_PurchaseReturnInfo` | GRTN (goods return notes) |
| `InventItems` | Spare parts / inventory items |
| `InventWareHouse` | Warehouses |
| `gen_PartiesInfo` | Parties (customers + suppliers) |
| `gen_EmployeeInfo` | Employees |
| `GLChartOFAccount` | Chart of accounts |
| `GLvMAIN` / `GLvDetail` | GL voucher entries |
