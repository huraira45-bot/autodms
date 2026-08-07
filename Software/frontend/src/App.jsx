import React, { useState, Children } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, matchPath } from 'react-router-dom';
import {
    Car, Users, Building, Settings as SettingsIcon, LayoutDashboard, Database,
    Wrench, Package, FileInput, FileOutput, ShoppingCart, Undo2, Landmark,
    CreditCard, Wallet, Receipt, ArrowLeftRight, ClipboardList, UserCircle,
    BoxSelect, PlusCircle, ExternalLink, SlidersHorizontal, LogOut, ShieldCheck, UsersRound, Unlock, UserCheck,
    FileBarChart, ListChecks, Headphones, UserCog, Truck, Percent, Bell, MessageSquare, Megaphone, Layers, Ban, Search,
    TrendingUp, ChevronDown, ChevronRight as ChevronRightIcon,
    Paintbrush, FileClock,
} from 'lucide-react';

// Collapsible sidebar section — clicking the header toggles the child
// NavLinks in / out. Open state is remembered per-title in localStorage so
// the sidebar comes back the way the user left it after refresh. Only
// renders the header when at least one child is actually going to show
// (children that would evaluate to falsy are automatically filtered).
// Owner ask 2026-07-03.
// Odoo-style collapsible sidebar section. Open state persists per-title in
// localStorage. Auto-hides if no children are visible under current RBAC.
// Owner ask 2026-07-03 (redesigned as compact ERP shell).
function NavSection({ title, children }) {
    const visibleChildren = Children.toArray(children).filter(c => c && c !== false);
    if (visibleChildren.length === 0) return null;
    const storageKey = 'sidebarSec:' + title;
    const [open, setOpen] = useState(() => {
        const stored = localStorage.getItem(storageKey);
        return stored === null ? true : stored === '1';
    });
    const toggle = () => {
        setOpen(v => {
            const next = !v;
            try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch {}
            return next;
        });
    };
    return (
        <div className="erp-nav-group">
            <div className="erp-nav-group-title" onClick={toggle}>
                <span>{title}</span>
                {open ? <ChevronDown size={11} /> : <ChevronRightIcon size={11} />}
            </div>
            {open && visibleChildren}
        </div>
    );
}

import { AuthProvider, useAuth } from './context/AuthContext';
import { isDemoMode } from './demoMode';

import Dashboard          from './pages/Dashboard';
import ModuleLauncher     from './pages/ModuleLauncher';
import Chat               from './pages/Chat';
import JobKiosk           from './pages/JobKiosk';
import Charity            from './pages/reports/Charity';
import UnfinalizeLog      from './pages/reports/UnfinalizeLog';
import RevenueSplit       from './pages/reports/RevenueSplit';
import ExpenseByDepartment from './pages/reports/ExpenseByDepartment';
import CashCreditExpense  from './pages/reports/CashCreditExpense';
import FinancialDashboard from './pages/reports/FinancialDashboard';
import FinancialRatios from './pages/reports/FinancialRatios';
import BuPnL              from './pages/reports/BuPnL';
import StoreSalePnL       from './pages/reports/StoreSalePnL';
import { getVisibleModuleGroups } from './navigationConfig';
import Login              from './pages/Login';
import Employees          from './pages/Employees';
import HRSettings         from './pages/HRSettings';
import HrAttendance       from './pages/hr/HrAttendance';
import HrSalarySheet      from './pages/hr/HrSalarySheet';
import HrMessSheet        from './pages/hr/HrMessSheet';
import HrEmployeeSalary   from './pages/hr/HrEmployeeSalary';
import HrFineSettings     from './pages/hr/HrFineSettings';
import HrDeptSalaryAccounts from './pages/hr/HrDeptSalaryAccounts';
import HrSalarySlipPrint  from './pages/hr/HrSalarySlipPrint';
import HrSalarySheetPrint from './pages/hr/HrSalarySheetPrint';
import HrBankLetterPrint  from './pages/hr/HrBankLetterPrint';
import HrCashLetterPrint  from './pages/hr/HrCashLetterPrint';
import Customers          from './pages/Customers';
import PartyBusinessAccess from './pages/PartyBusinessAccess';
import Vehicles           from './pages/Vehicles';
import Parts              from './pages/Parts';
import Services           from './pages/Services';
import InventorySettings  from './pages/InventorySettings';
// Paint Lab (owner ask 2026-07-04) — separate paint inventory + costing module
import PaintDashboard     from './pages/paint/PaintDashboard';
import PaintItems         from './pages/paint/PaintItems';
import PaintSettings      from './pages/paint/PaintSettings';
import PaintPlaceholder   from './pages/paint/PaintPlaceholder';
import PaintGRN           from './pages/paint/PaintGRN';
import PaintGRNPrint      from './pages/paint/PaintGRNPrint';
import PaintGRTN          from './pages/paint/PaintGRTN';
import PaintGRTNPrint     from './pages/paint/PaintGRTNPrint';
import PaintIssue         from './pages/paint/PaintIssue';
import PaintIssuePrint    from './pages/paint/PaintIssuePrint';
import PaintReports       from './pages/paint/PaintReports';
import GRN                from './pages/GRN';
import GRTN               from './pages/GRTN';
import StoreSale          from './pages/StoreSale';
import SSR                from './pages/SSR';
import ChartOfAccounts    from './pages/ChartOfAccounts';
import BusinessProfile    from './pages/BusinessProfile';
import CreditInvoicePrint from './pages/CreditInvoicePrint';
import JobCardGSTPrint    from './pages/JobCardGSTPrint';
import JobCardPSTPrint    from './pages/JobCardPSTPrint';
import JobCardDepreciationPrint from './pages/JobCardDepreciationPrint';
import VehicleHistory     from './pages/VehicleHistory';
import VoucherEntry       from './pages/VoucherEntry';
import VoucherDepartmentTagging from './pages/VoucherDepartmentTagging';
import WorkshopCustomers  from './pages/WorkshopCustomers';
import JobCardList        from './pages/JobCardList';
import JobCardForm        from './pages/JobCardForm';
import WorkOrderPrint     from './pages/WorkOrderPrint';
import StoreSalePrint     from './pages/StoreSalePrint';
import GRNPrint           from './pages/GRNPrint';
import GRTNPrint          from './pages/GRTNPrint';
import SSRPrint           from './pages/SSRPrint';
import VoucherPrint       from './pages/VoucherPrint';
import PartsIssue         from './pages/PartsIssue';
import SubletRepair       from './pages/SubletRepair';
import LabourServices     from './pages/LabourServices';
import WorkshopSettings   from './pages/WorkshopSettings';
import CareOffAdmin       from './pages/CareOffAdmin';
import CareOffElevationRequests from './pages/CareOffElevationRequests';
import SystemAccounts     from './pages/SystemAccounts';
import TaxRates           from './pages/TaxRates';
import ReceivePayment     from './pages/ReceivePayment';
import Cheques            from './pages/Cheques';
import MakePayment        from './pages/MakePayment';
import POSSettlement      from './pages/POSSettlement';
import BankAccounts       from './pages/BankAccounts';
import CRDFollowUps       from './pages/CRDFollowUps';
import VoucherBrowser     from './pages/VoucherBrowser';
import TrialBalance       from './pages/TrialBalance';
import TrialBalanceExtract from './pages/reports/TrialBalanceExtract';
import GLDetail           from './pages/GLDetail';
import PartyStatement     from './pages/PartyStatement';
import DailyCashBook      from './pages/DailyCashBook';
import TaxSummary         from './pages/TaxSummary';
import { PnL, PnLByDepartment, BalanceSheet, DayBook }      from './pages/reports/Financials';
import { ReceivablesAging, PayablesAging, InsuranceAging, WalkInOutstanding }  from './pages/reports/Aging';
import { PartyOpenInvoices, StoreSaleReceivables, StoreSaleReceivablesCustom } from './pages/reports/PartyReports';
import SSReceivablesHiddenPartiesAdmin from './pages/reports/SSReceivablesHiddenPartiesAdmin';
import { POSPending, ChequesOnHand, BankBalances, TaxRateHistory } from './pages/reports/Operational';
import { DiscountGiven, SalesRegister, GrossMargin, GenCustReconciliation } from './pages/reports/Workshop';
import { InventoryValuation } from './pages/reports/Inventory';
import { VoucherAudit, SystemAccountAudit }                 from './pages/reports/Audit';
import Accessories        from './pages/Accessories';
import JobController      from './pages/JobController';
import GatePass           from './pages/GatePass';
import UsersAdmin           from './pages/admin/UsersAdmin';
import RolePermissions      from './pages/admin/RolePermissions';
import UnfinalizeRequests   from './pages/UnfinalizeRequests';
import CROWorkspace         from './pages/CROWorkspace';
import ComplaintDetail      from './pages/ComplaintDetail';
import CROReports           from './pages/CROReports';
import SurveysAdmin         from './pages/SurveysAdmin';
import SurveyTemplatesAdmin from './pages/SurveyTemplatesAdmin';
import RemindersAdmin       from './pages/RemindersAdmin';
import KYCFlagsAdmin        from './pages/KYCFlagsAdmin';
import InquiriesAdmin       from './pages/InquiriesAdmin';
import CampaignsAdmin       from './pages/CampaignsAdmin';
import VehicleModelsAdmin   from './pages/sales/VehicleModelsAdmin';
import VehicleVariantsAdmin from './pages/sales/VehicleVariantsAdmin';
import VehicleInventoryAdmin from './pages/sales/VehicleInventoryAdmin';
import BookingsList         from './pages/sales/BookingsList';
import NewBooking           from './pages/sales/NewBooking';
import BookingDetail        from './pages/sales/BookingDetail';
import NegotiationQueue     from './pages/sales/NegotiationQueue';
import IncentivePoliciesAdmin from './pages/sales/IncentivePoliciesAdmin';
import MasterIncentive       from './pages/sales/MasterIncentive';
import SalesRecovery         from './pages/sales/SalesRecovery';
import HierarchyTargets      from './pages/sales/HierarchyTargets';
import SalesReportsV2        from './pages/sales/SalesReportsV2';
import IncentiveDisbursement from './pages/sales/IncentiveDisbursement';
import DraftVouchers         from './pages/sales/DraftVouchers';
import CancellationQueue from './pages/sales/CancellationQueue';
import SalesInquiryQueue from './pages/sales/SalesInquiryQueue';
import ServiceCampaignsAdmin from './pages/ServiceCampaignsAdmin';

// Module-scoped reports
import { JobCardRegister, AdvisorPerformance, ServiceRevenueSummary, InsuranceClaims, MechanicProductivity } from './pages/reports/Service';
import { TaxInvoiceTracker } from './pages/reports/TaxInvoiceTracker';
import { StoreSaleTaxInvoiceTracker } from './pages/reports/StoreSaleTaxInvoiceTracker';
import { StockMovement, ReorderAlert, PartsSalesRegister, PartsPurchaseSummary, PartsIssuedToJc, PartsSoldFinalized, ItemLedger } from './pages/reports/Parts';
import { BookingRegister, VehicleInventory, ExecutivePerformance, CustomerAdvancesAging } from './pages/reports/Sales';
import SurveyPublic         from './pages/SurveyPublic';
import CommandPalette       from './components/CommandPalette';
import WorkspaceTopBar      from './components/WorkspaceTopBar';
import { FeedbackProvider } from './components/FeedbackProvider';

function ProtectedRoute({ moduleKey, anyModules, action = 'view', children }) {
    const { user, loading, hasModule, hasPermission } = useAuth();
    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    // `anyModules` = ['cro_workspace','cro_dept_responder','cro_admin'] etc.
    // Pass when a screen is reachable via multiple roles (owner ask 2026-07-04
    // for the CRO Workspace: an advisor granted only cro_dept_responder must
    // still be able to land on the page — the server further scopes what
    // they can actually see).
    if (anyModules && anyModules.length) {
        if (!anyModules.some(k => hasModule(k))) {
            return (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                    You do not have permission to access this module.
                </div>
            );
        }
    } else if (moduleKey) {
        // Try the granular permission first; fall back to legacy module check
        // for workflow/report keys that have no action suffix. The final
        // hasModule() fallback covers bundle-style keys like 'reports' that
        // are derived from any report:* grant (see derivedModulesFromPermissions).
        const allowed = action
            ? hasPermission(moduleKey, action) || hasPermission(moduleKey) || hasModule(moduleKey)
            : hasModule(moduleKey);
        if (!allowed) {
            return (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                    You do not have permission to access this module.
                </div>
            );
        }
    }
    return children;
}

function Sidebar() {
    // Owner ask 2026-07-05: replaced the endless 100+ NavLink list with a
    // compact 10-item module-group launcher. Detailed child screens live
    // on module landing pages (see ModuleLauncher.jsx) — click a group in
    // the sidebar to open its actions grid.
    // Real security stays on the backend and on <ProtectedRoute>; the
    // sidebar just hides groups whose child screens the user can't reach.
    const { hasModule, hasPermission } = useAuth();
    const groups = getVisibleModuleGroups(hasModule, hasPermission);

    const canChat = hasModule('chat_use') || hasModule('chat_admin');
    return (
        <aside className="erp-sidebar">
            <nav>
                {groups.map(g => {
                    const Icon = g.icon;
                    return (
                        <NavLink key={g.id} to={g.path}
                            className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}
                            end={g.id === 'dashboard'}
                            title={g.description}>
                            <Icon size={18} /> {g.label}
                        </NavLink>
                    );
                })}
                {canChat && <ChatNavLink />}
            </nav>
        </aside>
    );
}

// Sidebar chat link with a live unread badge. Polls /chat/channels every 30s
// and also listens on the shared socket so new messages update the badge
// immediately even when the user is on a different page.
function ChatNavLink() {
    const [unread, setUnread] = React.useState(0);
    React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const r = await axios.get('/api/chat/channels');
                if (!cancelled) setUnread(r.data.reduce((s, c) => s + (Number(c.UnreadCount) || 0), 0));
            } catch { /* not authed for chat */ }
        };
        load();
        const iv = setInterval(load, 30000);
        return () => { cancelled = true; clearInterval(iv); };
    }, []);
    return (
        <NavLink to="/chat"
            className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}
            title="Internal chat">
            <MessageSquare size={18} /> Chat
            {unread > 0 && (
                <span style={{ marginLeft: 'auto', background: '#ef4444', color: 'white',
                               borderRadius: 10, padding: '0 6px', fontSize: '0.65rem', fontWeight: 700 }}>
                    {unread}
                </span>
            )}
        </NavLink>
    );
}

// Legacy detailed nav lives below — kept for the old scrolling sidebar if
// we ever need to fall back. Not rendered by the current Sidebar.
function LegacySidebar() {
    const { hasModule, hasPermission } = useAuth();
    const canReport = (slug) => hasPermission(`report:${slug}`);
    const anyReport = (...slugs) => slugs.some(s => canReport(s));

    return (
        <aside className="erp-sidebar">
            <nav>
                <NavLink to="/" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'} end>
                    <LayoutDashboard size={16} /> Dashboard
                </NavLink>

                {/* Workshop */}
                <NavSection title="WORKSHOP & SERVICE">

                {hasModule('workshop_customers') && (
                    <NavLink to="/workshop/customers" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <UserCircle size={20} /> Workshop Customers
                    </NavLink>
                )}
                {hasModule('workshop_jobs') && (
                    <NavLink to="/workshop/jobs/new" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <PlusCircle size={20} /> Create Job Card
                    </NavLink>
                )}
                {hasModule('workshop_jobs') && (
                    <NavLink to="/workshop/jobs" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <ClipboardList size={20} /> Search Job Cards
                    </NavLink>
                )}
                {hasModule('workshop_jobs') && (
                    <NavLink to="/workshop/vehicle-history" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Car size={20} /> Vehicle History
                    </NavLink>
                )}
                {hasModule('workshop_labour') && (
                    <NavLink to="/workshop/services" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Wrench size={20} /> Labour & Services
                    </NavLink>
                )}
                {hasModule('workshop_sublet') && (
                    <NavLink to="/workshop/sublet" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <ExternalLink size={20} /> Sublet Repairs
                    </NavLink>
                )}
                {hasModule('workshop_settings') && (
                    <NavLink to="/workshop/settings" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <SlidersHorizontal size={20} /> Workshop Settings
                    </NavLink>
                )}
                {hasModule('workshop_settings') && (
                    <NavLink to="/workshop/campaigns" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Megaphone size={20} /> Service Campaigns
                    </NavLink>
                )}
                {hasModule('workshop_careoff') && (
                    <NavLink to="/workshop/care-off" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <UserCheck size={20} /> Care-Off Management
                    </NavLink>
                )}
                {hasModule('workshop_accessories') && (
                    <NavLink to="/workshop/accessories" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Package size={20} /> Accessories
                    </NavLink>
                )}
                {hasModule('workshop_controller') && (
                    <NavLink to="/workshop/controller" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <ClipboardList size={20} /> Job Controller
                    </NavLink>
                )}
                {hasModule('workshop_gatepass') && (
                    <NavLink to="/gatepass" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <ShieldCheck size={20} /> Gate Pass
                    </NavLink>
                )}
                {canReport('job_card_register') && (
                    <NavLink to="/reports/service/job-card-register" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Job Card Register
                    </NavLink>
                )}
                {canReport('tax_invoice_tracker') && (
                    <NavLink to="/reports/service/tax-invoice-tracker" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Tax Invoice Tracker
                    </NavLink>
                )}
                {canReport('advisor_performance') && (
                    <NavLink to="/reports/service/advisor-performance" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Advisor Performance
                    </NavLink>
                )}
                {canReport('revenue_summary') && (
                    <NavLink to="/reports/service/revenue-summary" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Service Revenue
                    </NavLink>
                )}
                {canReport('insurance_claims') && (
                    <NavLink to="/reports/service/insurance-claims" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Insurance Claims
                    </NavLink>
                )}
                {canReport('mechanic_productivity') && (
                    <NavLink to="/reports/service/mechanic-productivity" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Mechanic Productivity
                    </NavLink>
                )}
                </NavSection>

                {/* Parts & Inventory */}
                <NavSection title="PARTS & INVENTORY">

                {hasModule('parts_spare') && (
                    <NavLink to="/parts" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Package size={20} /> Spare Parts
                    </NavLink>
                )}
                {canReport('inventory_valuation') && (
                    <NavLink to="/reports/inventory-valuation" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Inventory On-Hand
                    </NavLink>
                )}
                {canReport('stock_movement') && (
                    <NavLink to="/reports/parts/stock-movement" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Stock Movement
                    </NavLink>
                )}
                {canReport('reorder_alert') && (
                    <NavLink to="/reports/parts/reorder-alert" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Reorder Alert
                    </NavLink>
                )}
                {canReport('parts_sales_register') && (
                    <NavLink to="/reports/parts/sales-register" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Parts Sales Register
                    </NavLink>
                )}
                {canReport('purchase_summary') && (
                    <NavLink to="/reports/parts/purchase-summary" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Parts Purchase Summary
                    </NavLink>
                )}
                {canReport('parts_issued_to_jc') && (
                    <NavLink to="/reports/parts/issued-to-jc" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Parts Issued to Job Cards
                    </NavLink>
                )}
                {canReport('item_ledger') && (
                    <NavLink to="/reports/parts/item-ledger" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Item Ledger
                    </NavLink>
                )}
                {canReport('store_sale_tax_invoice_tracker') && (
                    <NavLink to="/reports/parts/tax-invoice-tracker" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Store Sale Tax Invoice Tracker
                    </NavLink>
                )}
                {hasModule('procurement_grn') && (
                    <NavLink to="/grn" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileInput size={20} /> Receiving (GRN)
                    </NavLink>
                )}
                {hasModule('procurement_grtn') && (
                    <NavLink to="/grtn" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileOutput size={20} /> Returns (GRTN)
                    </NavLink>
                )}
                {hasModule('sales_store') && (
                    <NavLink to="/store-sale" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <ShoppingCart size={20} /> Store Sale (Spares)
                    </NavLink>
                )}
                {hasModule('sales_ssr') && (
                    <NavLink to="/ssr" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Undo2 size={20} /> Sale Returns (SSR)
                    </NavLink>
                )}
                {hasModule('workshop_parts_issue') && (
                    <NavLink to="/parts-issue" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <BoxSelect size={20} /> Parts Issue (Job Card)
                    </NavLink>
                )}
                {hasModule('inventory_settings') && (
                    <NavLink to="/inventory-settings" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Database size={20} /> Parts Config
                    </NavLink>
                )}
                </NavSection>

                {/* Paint Lab — separate internal paint inventory + costing (owner ask 2026-07-04) */}
                <NavSection title="PAINT LAB">
                    {hasModule('paint_lab_dashboard') && (
                        <NavLink to="/paint/dashboard" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <Paintbrush size={20} /> Paint Dashboard
                        </NavLink>
                    )}
                    {hasModule('paint_lab_items') && (
                        <NavLink to="/paint/items" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <Layers size={20} /> Paint Items
                        </NavLink>
                    )}
                    {hasModule('paint_lab_grn') && (
                        <NavLink to="/paint/grn" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <FileInput size={20} /> Paint GRN
                        </NavLink>
                    )}
                    {hasModule('paint_lab_grtn') && (
                        <NavLink to="/paint/grtn" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <Undo2 size={20} /> Paint GRTN
                        </NavLink>
                    )}
                    {hasModule('paint_lab_issue') && (
                        <NavLink to="/paint/issue" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <ClipboardList size={20} /> Paint Issue
                        </NavLink>
                    )}
                    {hasModule('paint_lab_reports') && (
                        <NavLink to="/paint/reports" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <FileBarChart size={20} /> Paint Reports
                        </NavLink>
                    )}
                    {hasModule('paint_lab_settings') && (
                        <NavLink to="/paint/settings" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <SlidersHorizontal size={20} /> Paint Settings
                        </NavLink>
                    )}
                </NavSection>

                {/* Finance */}
                <NavSection title="FINANCE & ACCOUNTS">

                {hasModule('finance_coa') && (
                    <NavLink to="/coa" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Landmark size={20} /> Chart of Accounts
                    </NavLink>
                )}
                {hasModule('finance_vouchers') && (
                    <>
                        <NavLink to="/vouchers/cpv" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <Wallet size={20} /> Cash Payment (CPV)
                        </NavLink>
                        <NavLink to="/vouchers/crv" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <Receipt size={20} /> Cash Receipt (CRV)
                        </NavLink>
                        <NavLink to="/vouchers/bpv" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <CreditCard size={20} /> Bank Payment (BPV)
                        </NavLink>
                        <NavLink to="/vouchers/brv" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <Landmark size={20} /> Bank Receipt (BRV)
                        </NavLink>
                        <NavLink to="/vouchers/jv" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <ArrowLeftRight size={20} /> Journal Voucher (JV)
                        </NavLink>
                        <NavLink to="/vouchers/browse" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <ClipboardList size={20} /> Voucher Browser
                        </NavLink>
                    </>
                )}
                {hasModule('accounting_setup') && (
                    <>
                    <NavLink to="/accounting/setup" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <SettingsIcon size={20} /> Accounting Setup
                    </NavLink>
                    <NavLink to="/accounting/tax-rates" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <SlidersHorizontal size={20} /> Tax Rates
                    </NavLink>
                    <NavLink to="/accounting/bank-accounts" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Landmark size={20} /> Bank Accounts
                    </NavLink>
                    </>
                )}
                {hasModule('settings_business_profile') && (
                    <NavLink to="/settings/business-profile" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <SettingsIcon size={20} /> Business Profile
                    </NavLink>
                )}
                {hasModule('payments') && (
                    <>
                    <NavLink to="/payments/receive" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Receipt size={20} /> Receive Payment
                    </NavLink>
                    <NavLink to="/payments/make" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Wallet size={20} /> Make Payment
                    </NavLink>
                    <NavLink to="/payments/pos-settlement" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <CreditCard size={20} /> POS Settlement
                    </NavLink>
                    </>
                )}
                {hasModule('finance_cheques') && (
                    <NavLink to="/payments/cheques" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Receipt size={20} /> Cheque Clearance
                    </NavLink>
                )}
                </NavSection>

                {/* Owner ask 2026-07-17: split flat ACCOUNT REPORTS list into
                    focused collapsible sub-groups so finding the right report
                    is faster. Each NavSection remembers its open/closed state
                    per-user via localStorage. */}
                <NavSection title="FINANCIAL STATEMENTS">
                {canReport('trial_balance')         && <NavLink to="/reports/trial-balance"      className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><FileBarChart size={20} /> Trial Balance</NavLink>}
                {canReport('trial_balance_extract') && <NavLink to="/reports/trial-balance-extract" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><FileBarChart size={20} /> TB Extract</NavLink>}
                {canReport('gl_detail')             && <NavLink to="/reports/gl-detail"          className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> GL Detail</NavLink>}
                {canReport('pnl')                   && <NavLink to="/reports/pnl"                className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> Profit &amp; Loss</NavLink>}
                {canReport('pnl_department')        && <NavLink to="/reports/pnl-department"      className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> P&amp;L by Department</NavLink>}
                {canReport('balance_sheet')         && <NavLink to="/reports/balance-sheet"      className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> Balance Sheet</NavLink>}
                {canReport('day_book')              && <NavLink to="/reports/day-book"           className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> Day Book</NavLink>}
                </NavSection>

                <NavSection title="PARTY LEDGERS & AGING">
                {canReport('customer_statement')    && <NavLink to="/reports/customer-statement" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><UserCog size={20} /> Customer Statement</NavLink>}
                {canReport('supplier_statement')    && <NavLink to="/reports/supplier-statement" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><Truck size={20} /> Supplier Statement</NavLink>}
                {canReport('party_open_invoices')   && <NavLink to="/reports/party-open-invoices" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><Users size={20} /> Party Open Invoices</NavLink>}
                {canReport('store_sale_receivables') && <NavLink to="/reports/store-sale-receivables" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><Wallet size={20} /> Store Sale Receivables</NavLink>}
                {canReport('receivables_aging')     && <NavLink to="/reports/receivables-aging"  className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> Receivables Aging</NavLink>}
                {canReport('payables_aging')        && <NavLink to="/reports/payables-aging"     className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> Payables Aging</NavLink>}
                {canReport('insurance_aging')       && <NavLink to="/reports/insurance-aging"    className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> Insurance Aging</NavLink>}
                {canReport('walkin_outstanding')    && <NavLink to="/reports/walkin-outstanding" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> Walk-in JC Pending</NavLink>}
                </NavSection>

                <NavSection title="CASH & BANK">
                {canReport('daily_cash_book')       && <NavLink to="/reports/daily-cash-book"    className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><Wallet size={20} /> Daily Cash Book</NavLink>}
                {canReport('bank_balances')         && <NavLink to="/reports/bank-balances"      className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><Landmark size={20} /> Bank Balances</NavLink>}
                {canReport('pos_pending')           && <NavLink to="/reports/pos-pending"        className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><CreditCard size={20} /> POS Pending</NavLink>}
                {canReport('cheques_on_hand')       && <NavLink to="/reports/cheques-on-hand"    className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><Receipt size={20} /> Cheques on Hand</NavLink>}
                </NavSection>

                <NavSection title="TAX">
                {canReport('tax_summary')           && <NavLink to="/reports/tax-summary"        className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><Percent size={20} /> Tax Summary</NavLink>}
                {canReport('tax_rate_history')      && <NavLink to="/reports/tax-rate-history"   className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><Percent size={20} /> Tax Rate History</NavLink>}
                </NavSection>

                <NavSection title="SALES ANALYTICS">
                {canReport('sales_register')        && <NavLink to="/reports/sales-register"     className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> Sales Register</NavLink>}
                {canReport('gross_margin')          && <NavLink to="/reports/gross-margin"       className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> Gross Margin</NavLink>}
                {canReport('discount_given')        && <NavLink to="/reports/discount-given"     className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> Discount Given</NavLink>}
                </NavSection>

                <NavSection title="AUDIT">
                {canReport('gencust_reconciliation')&& <NavLink to="/reports/gencust-reconciliation" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> Gen-Customer Recon</NavLink>}
                {canReport('voucher_audit')         && <NavLink to="/reports/voucher-audit"      className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ListChecks size={20} /> Voucher Audit Trail</NavLink>}
                {canReport('system_account_audit') && <NavLink to="/reports/system-account-audit" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}><ShieldCheck size={20} /> System Account Audit</NavLink>}
                </NavSection>

                {/* Parties master (accounting side — AR/AP master) */}
                <NavSection title="PARTIES">

                {hasModule('crm_parties') && (
                    <NavLink to="/customers" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Building size={20} /> Credit Parties
                    </NavLink>
                )}
                {hasModule('crm_party_access') && (
                    <NavLink to="/party-business-access" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <ShieldCheck size={20} /> Party Business Access
                    </NavLink>
                )}
                </NavSection>

                {/* Customer Relation (CRM + CRO) */}
                <NavSection title="CUSTOMER RELATION">

                {hasModule('crd_followups') && (
                    <NavLink to="/crd/follow-ups" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Headphones size={20} /> Follow-Ups
                    </NavLink>
                )}
                {/* Owner ask 2026-07-04: advisors with only cro_dept_responder
                    must see this link so they can find their assigned
                    complaints. Label flips to "My Complaints" for that role
                    (matches the page title) — CRO desk still sees the full
                    "CRO Workspace" label. */}
                {(hasModule('cro_workspace') || hasModule('cro_admin') || hasModule('cro_dept_responder')) && (
                    <NavLink to="/cro/workspace" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Headphones size={20} />
                        {(hasModule('cro_workspace') || hasModule('cro_admin')) ? 'CRO Workspace' : 'My Complaints'}
                    </NavLink>
                )}
                {(hasModule('cro_workspace') || hasModule('cro_admin') || hasModule('cro_reports')) && (
                    <NavLink to="/cro/surveys" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <ClipboardList size={20} /> Surveys
                    </NavLink>
                )}
                {hasModule('cro_admin') && (
                    <NavLink to="/cro/survey-templates" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <ClipboardList size={20} /> Survey Templates
                    </NavLink>
                )}
                {(hasModule('cro_workspace') || hasModule('cro_admin') || hasModule('cro_reports')) && (
                    <NavLink to="/cro/reminders" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Bell size={20} /> Service Reminders
                    </NavLink>
                )}
                {(hasModule('cro_workspace') || hasModule('cro_admin') || hasModule('cro_reports')) && (
                    <NavLink to="/cro/kyc-flags" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <ShieldCheck size={20} /> KYC Flags
                    </NavLink>
                )}
                {(hasModule('cro_workspace') || hasModule('cro_admin') || hasModule('cro_reports')) && (
                    <NavLink to="/cro/inquiries" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <MessageSquare size={20} /> Inquiries
                    </NavLink>
                )}
                {(hasModule('cro_workspace') || hasModule('cro_admin') || hasModule('cro_reports')) && (
                    <NavLink to="/cro/campaigns" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Megaphone size={20} /> Campaigns
                    </NavLink>
                )}
                </NavSection>

                {/* New Vehicle Sales */}
                <NavSection title="NEW VEHICLE SALES">

                {(hasModule('sales_admin_settings') || hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/models" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Car size={20} /> Vehicle Models
                    </NavLink>
                )}
                {(hasModule('sales_admin_settings') || hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/variants" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Layers size={20} /> Vehicle Variants
                    </NavLink>
                )}
                {(hasModule('sales_admin_settings') || hasModule('sales_master_settlement') || hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/inventory" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Truck size={20} /> Vehicle Inventory
                    </NavLink>
                )}
                {(hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/bookings" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <ClipboardList size={20} /> Bookings
                    </NavLink>
                )}
                {(hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_admin_settings') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/inquiries" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Headphones size={20} /> Sales Inquiries
                    </NavLink>
                )}
                {hasModule('sales_admin_pricing') && (
                    <NavLink to="/sales/negotiations" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <ShieldCheck size={20} /> Discount Approvals
                    </NavLink>
                )}
                {(hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') || hasModule('am_approve') || hasModule('admin_unfinalize') || hasModule('sales_admin_settings')) && (
                    <NavLink to="/sales/cancellations" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Ban size={20} /> Cancellation Queue
                    </NavLink>
                )}
                {(hasModule('sales_admin_settings') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/incentive-policies" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Percent size={20} /> Incentive Policies
                    </NavLink>
                )}
                {(hasModule('sales_admin_settings') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/incentive-disbursement" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Wallet size={20} /> Staff Incentive Payout
                    </NavLink>
                )}
                {(hasModule('sales_master_settlement') || hasModule('sales_admin_settings') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/master-incentive" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <TrendingUp size={20} /> Master Incentive
                    </NavLink>
                )}
                {(hasModule('sales_recovery') || hasModule('sales_admin_settings') || hasModule('sales_gm') || hasModule('sales_agm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/recovery" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Ban size={20} /> Sales Recovery
                    </NavLink>
                )}
                {(hasModule('sales_hierarchy') || hasModule('sales_admin_settings') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/hierarchy-targets" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <UsersRound size={20} /> Hierarchy & Targets
                    </NavLink>
                )}
                {(hasModule('sales_master_settlement') || hasModule('sales_admin_settings') || hasModule('sales_gm')) && (
                    <NavLink to="/sales/draft-vouchers" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileClock size={20} /> Draft Vouchers
                    </NavLink>
                )}
                {anyReport(
                    'booking_register','vehicle_inventory','executive_performance',
                    'customer_advances_aging','booking_pipeline','master_invoice_aging',
                    'incentive_receivable_aging',
                ) && (
                    <NavLink to="/sales/reports" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Sales Reports
                    </NavLink>
                )}
                {hasModule('cro_reports') && (
                    <NavLink to="/cro/reports" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> CRO Reports
                    </NavLink>
                )}
                {canReport('booking_register') && (
                    <NavLink to="/reports/sales/booking-register" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Booking Register
                    </NavLink>
                )}
                {canReport('vehicle_inventory') && (
                    <NavLink to="/reports/sales/vehicle-inventory" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Vehicle Inventory Report
                    </NavLink>
                )}
                {canReport('executive_performance') && (
                    <NavLink to="/reports/sales/executive-performance" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Executive Performance
                    </NavLink>
                )}
                {canReport('customer_advances_aging') && (
                    <NavLink to="/reports/sales/customer-advances-aging" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <FileBarChart size={20} /> Customer Advances Aging
                    </NavLink>
                )}
                </NavSection>

                {/* HR */}
                <NavSection title="ADMIN & HR">

                {hasModule('hr_employees') && (
                    <NavLink to="/employees" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <Users size={20} /> Employees
                    </NavLink>
                )}
                {hasModule('hr_settings') && (
                    <NavLink to="/hr-settings" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <SettingsIcon size={20} /> HR Config
                    </NavLink>
                )}
                </NavSection>

                {/* Admin */}
                <NavSection title="ADMINISTRATION">

                {hasModule('admin_users') && (
                    <NavLink to="/admin/users" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <UsersRound size={20} /> User Management
                    </NavLink>
                )}
                {hasModule('admin_permissions') && (
                    <NavLink to="/admin/permissions" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                        <ShieldCheck size={20} /> Role Permissions
                    </NavLink>
                )}
                </NavSection>

                {/* Workflow */}
                <NavSection title="WORKFLOW">
                    {(hasModule('am_approve') || hasModule('admin_unfinalize')) && (
                        <NavLink to="/unfinalize-requests" className={({ isActive }) => isActive ? 'erp-nav-item active' : 'erp-nav-item'}>
                            <Unlock size={20} /> Unfinalize Requests
                        </NavLink>
                    )}
                </NavSection>
            </nav>
        </aside>
    );
}

function AppShell() {
    const { user, loading } = useAuth();
    const [commandOpen, setCommandOpen] = React.useState(false);
    const location = useLocation();
    // Print routes render bare — no sidebar, top bar, notification bell, etc.
    // so the document prints cleanly without app chrome. Owner report
    // 2026-07-02: Credit Invoice was rendering inside the main shell so print
    // output carried the sidebar and breadcrumb strip. Owner report
    // 2026-07-05: same problem for the Depreciation, GST, PST prints because
    // the earlier regex only matched literal `/print` and `/credit-invoice`.
    // Whitelist every print suffix explicitly.
    const isPrintRoute = /\/(print|credit-invoice|gst-invoice|pst-invoice|dep-print|depreciation-print)(?:\/|$|\?)/.test(location.pathname);

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>;
    if (!user) return <Login />;

    if (isPrintRoute) {
        return (
            <FeedbackProvider>
                <main style={{ background: 'white' }}>
                    <Routes>
                        <Route path="/workshop/jobs/:id/print" element={<WorkOrderPrint />} />
                        <Route path="/workshop/jobs/:id/credit-invoice" element={<CreditInvoicePrint />} />
                        <Route path="/workshop/jobs/:id/gst-invoice"    element={<JobCardGSTPrint />} />
                        <Route path="/workshop/jobs/:id/pst-invoice"    element={<JobCardPSTPrint />} />
                        <Route path="/workshop/jobs/:id/dep-print"          element={<JobCardDepreciationPrint />} />
                        <Route path="/workshop/jobs/:id/depreciation-print"  element={<JobCardDepreciationPrint />} />
                        <Route path="/store-sale/:id/print"    element={<StoreSalePrint />} />
                        <Route path="/grn/:id/print"           element={<GRNPrint />} />
                        <Route path="/grtn/:id/print"          element={<GRTNPrint />} />
                        <Route path="/ssr/:id/print"           element={<SSRPrint />} />
                        <Route path="/vouchers/:id/print"      element={<VoucherPrint />} />
                        {/* Paint Lab print routes — same chromeless shell. */}
                        <Route path="/paint/grn/:id/print"     element={<PaintGRNPrint />} />
                        <Route path="/paint/grtn/:id/print"    element={<PaintGRTNPrint />} />
                        <Route path="/paint/issue/:id/print"   element={<PaintIssuePrint />} />
                        {/* HR/Salary print routes */}
                        <Route path="/hr/salary-slip/:monthId/:employeeId/print" element={<HrSalarySlipPrint />} />
                        <Route path="/hr/salary/:monthId/print"                  element={<HrSalarySheetPrint />} />
                        <Route path="/hr/bank-letter/:monthId/print"             element={<HrBankLetterPrint />} />
                        <Route path="/hr/cash-letter/:monthId/print"             element={<HrCashLetterPrint />} />
                    </Routes>
                </main>
            </FeedbackProvider>
        );
    }

    return (
        <FeedbackProvider>
        <div className="erp-shell">
            {/* Brand cell (top-left corner) */}
            <div className="erp-brand">
                <div className="erp-brand-badge">D</div>
                <span className="erp-brand-name">DealerDesk</span>
            </div>

            {/* Top bar: breadcrumbs, search, user */}
            <WorkspaceTopBar onOpenCommand={() => setCommandOpen(true)} />

            {/* Sidebar with grouped nav (Workshop / Parts / Finance / …) */}
            <Sidebar />

            {/* Command palette lives outside grid so its fixed positioning
                isn't clipped by the workspace overflow. NotificationBell now
                renders inline inside WorkspaceTopBar. */}
            <CommandPalette
                open={commandOpen}
                onOpen={() => setCommandOpen(true)}
                onClose={() => setCommandOpen(false)}
            />

            <main className="erp-workspace">
                <div className="erp-workspace-inner">
                {isDemoMode && (
                    <div className="erp-alert warning" style={{ marginBottom: 10 }}>
                        <strong>DEMO MODE</strong>
                        <span>— UI preview only. No real backend; all data is mocked and changes are not saved.</span>
                    </div>
                )}
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/module/:groupId" element={<ModuleLauncher />} />
                    <Route path="/chat" element={
                        <ProtectedRoute anyModules={['chat_use','chat_admin']}><Chat /></ProtectedRoute>
                    } />

                    <Route path="/coa" element={
                        <ProtectedRoute moduleKey="finance_coa"><ChartOfAccounts /></ProtectedRoute>
                    } />

                    <Route path="/vouchers/cpv" element={
                        <ProtectedRoute moduleKey="finance_vouchers"><VoucherEntry forceTypeCode="CPV" title="Cash Payment Voucher" /></ProtectedRoute>
                    } />
                    <Route path="/vouchers/crv" element={
                        <ProtectedRoute moduleKey="finance_vouchers"><VoucherEntry forceTypeCode="CRV" title="Cash Receipt Voucher" /></ProtectedRoute>
                    } />
                    <Route path="/vouchers/bpv" element={
                        <ProtectedRoute moduleKey="finance_vouchers"><VoucherEntry forceTypeCode="BPV" title="Bank Payment Voucher" /></ProtectedRoute>
                    } />
                    <Route path="/vouchers/brv" element={
                        <ProtectedRoute moduleKey="finance_vouchers"><VoucherEntry forceTypeCode="BRV" title="Bank Receipt Voucher" /></ProtectedRoute>
                    } />
                    <Route path="/vouchers/jv" element={
                        <ProtectedRoute moduleKey="finance_vouchers"><VoucherEntry forceTypeCode="JV" title="Journal Voucher" /></ProtectedRoute>
                    } />
                    <Route path="/vouchers/browse" element={
                        <ProtectedRoute moduleKey="finance_vouchers"><VoucherBrowser /></ProtectedRoute>
                    } />
                    <Route path="/vouchers/department-tagging" element={
                        <ProtectedRoute moduleKey="finance_vouchers"><VoucherDepartmentTagging /></ProtectedRoute>
                    } />
                    <Route path="/vouchers" element={<Navigate to="/vouchers/browse" replace />} />
                    <Route path="/accounting/setup" element={
                        <ProtectedRoute moduleKey="accounting_setup"><SystemAccounts /></ProtectedRoute>
                    } />
                    <Route path="/accounting/tax-rates" element={
                        <ProtectedRoute moduleKey="accounting_setup"><TaxRates /></ProtectedRoute>
                    } />
                    <Route path="/accounting/bank-accounts" element={
                        <ProtectedRoute moduleKey="accounting_setup"><BankAccounts /></ProtectedRoute>
                    } />
                    <Route path="/settings/business-profile" element={
                        <ProtectedRoute moduleKey="settings_business_profile"><BusinessProfile /></ProtectedRoute>
                    } />
                    <Route path="/payments/receive" element={
                        <ProtectedRoute moduleKey="payments"><ReceivePayment /></ProtectedRoute>
                    } />
                    <Route path="/payments/make" element={
                        <ProtectedRoute moduleKey="payments"><MakePayment /></ProtectedRoute>
                    } />
                    <Route path="/payments/pos-settlement" element={
                        <ProtectedRoute moduleKey="payments"><POSSettlement /></ProtectedRoute>
                    } />
                    <Route path="/payments/cheques" element={
                        <ProtectedRoute moduleKey="finance_cheques"><Cheques /></ProtectedRoute>
                    } />
                    <Route path="/reports/trial-balance" element={
                        <ProtectedRoute moduleKey="reports"><TrialBalance /></ProtectedRoute>
                    } />
                    <Route path="/reports/trial-balance-extract" element={
                        <ProtectedRoute moduleKey="reports"><TrialBalanceExtract /></ProtectedRoute>
                    } />
                    <Route path="/reports/gl-detail" element={
                        <ProtectedRoute moduleKey="reports"><GLDetail /></ProtectedRoute>
                    } />
                    <Route path="/reports/charity" element={
                        <ProtectedRoute moduleKey="charity_view"><Charity /></ProtectedRoute>
                    } />
                    <Route path="/reports/unfinalize-log" element={
                        <ProtectedRoute anyModules={['report:unfinalize_log', 'am_approve', 'admin_unfinalize']}>
                            <UnfinalizeLog />
                        </ProtectedRoute>
                    } />
                    <Route path="/reports/revenue-split" element={
                        <ProtectedRoute moduleKey="report:revenue_split"><RevenueSplit /></ProtectedRoute>
                    } />
                    <Route path="/reports/expense-by-department" element={
                        <ProtectedRoute moduleKey="report:expense_by_department"><ExpenseByDepartment /></ProtectedRoute>
                    } />
                    <Route path="/reports/cash-credit-expense" element={
                        <ProtectedRoute moduleKey="report:cash_credit_expense"><CashCreditExpense /></ProtectedRoute>
                    } />
                    <Route path="/reports/financial-dashboard" element={
                        <ProtectedRoute moduleKey="reports"><FinancialDashboard /></ProtectedRoute>
                    } />
                    <Route path="/reports/financial-ratios" element={
                        <ProtectedRoute moduleKey="reports"><FinancialRatios /></ProtectedRoute>
                    } />
                    <Route path="/reports/bu-pnl" element={
                        <ProtectedRoute moduleKey="report:bu_pnl"><BuPnL /></ProtectedRoute>
                    } />
                    <Route path="/reports/store-sale-pnl" element={
                        <ProtectedRoute moduleKey="report:store_sale_pnl"><StoreSalePnL /></ProtectedRoute>
                    } />
                    <Route path="/reports/customer-statement" element={
                        <ProtectedRoute moduleKey="reports"><PartyStatement kind="customer" /></ProtectedRoute>
                    } />
                    <Route path="/reports/supplier-statement" element={
                        <ProtectedRoute moduleKey="reports"><PartyStatement kind="supplier" /></ProtectedRoute>
                    } />
                    <Route path="/reports/daily-cash-book" element={
                        <ProtectedRoute moduleKey="reports"><DailyCashBook /></ProtectedRoute>
                    } />
                    <Route path="/reports/tax-summary" element={
                        <ProtectedRoute moduleKey="reports"><TaxSummary /></ProtectedRoute>
                    } />
                    <Route path="/reports/pnl"                  element={<ProtectedRoute moduleKey="reports"><PnL /></ProtectedRoute>} />
                    <Route path="/reports/pnl-department"       element={<ProtectedRoute moduleKey="reports"><PnLByDepartment /></ProtectedRoute>} />
                    <Route path="/reports/balance-sheet"        element={<ProtectedRoute moduleKey="reports"><BalanceSheet /></ProtectedRoute>} />
                    <Route path="/reports/day-book"             element={<ProtectedRoute moduleKey="reports"><DayBook /></ProtectedRoute>} />
                    <Route path="/reports/receivables-aging"    element={<ProtectedRoute moduleKey="reports"><ReceivablesAging /></ProtectedRoute>} />
                    <Route path="/reports/party-open-invoices"  element={<ProtectedRoute moduleKey="reports"><PartyOpenInvoices /></ProtectedRoute>} />
                    <Route path="/reports/store-sale-receivables" element={<ProtectedRoute moduleKey="reports"><StoreSaleReceivables /></ProtectedRoute>} />
                    <Route path="/reports/store-sale-receivables-custom" element={
                        <ProtectedRoute moduleKey="report:store_sale_receivables_custom"><StoreSaleReceivablesCustom /></ProtectedRoute>
                    } />
                    <Route path="/reports/store-sale-receivables-custom/settings" element={
                        <ProtectedRoute moduleKey="report:store_sale_receivables_custom"><SSReceivablesHiddenPartiesAdmin /></ProtectedRoute>
                    } />
                    <Route path="/reports/payables-aging"       element={<ProtectedRoute moduleKey="reports"><PayablesAging /></ProtectedRoute>} />
                    <Route path="/reports/insurance-aging"      element={<ProtectedRoute moduleKey="reports"><InsuranceAging /></ProtectedRoute>} />
                    <Route path="/reports/walkin-outstanding"   element={<ProtectedRoute moduleKey="reports"><WalkInOutstanding /></ProtectedRoute>} />
                    <Route path="/reports/pos-pending"          element={<ProtectedRoute moduleKey="reports"><POSPending /></ProtectedRoute>} />
                    <Route path="/reports/cheques-on-hand"      element={<ProtectedRoute moduleKey="reports"><ChequesOnHand /></ProtectedRoute>} />
                    <Route path="/reports/bank-balances"        element={<ProtectedRoute moduleKey="reports"><BankBalances /></ProtectedRoute>} />
                    <Route path="/reports/tax-rate-history"     element={<ProtectedRoute moduleKey="reports"><TaxRateHistory /></ProtectedRoute>} />
                    <Route path="/reports/sales-register"       element={<ProtectedRoute moduleKey="reports"><SalesRegister /></ProtectedRoute>} />
                    <Route path="/reports/gross-margin"         element={<ProtectedRoute moduleKey="reports"><GrossMargin /></ProtectedRoute>} />
                    <Route path="/reports/discount-given"       element={<ProtectedRoute moduleKey="reports"><DiscountGiven /></ProtectedRoute>} />
                    <Route path="/reports/inventory-valuation"  element={<ProtectedRoute><InventoryValuation /></ProtectedRoute>} />

                    {/* Service (workshop) reports */}
                    <Route path="/reports/service/job-card-register"     element={<ProtectedRoute><JobCardRegister /></ProtectedRoute>} />
                    <Route path="/reports/service/advisor-performance"   element={<ProtectedRoute><AdvisorPerformance /></ProtectedRoute>} />
                    <Route path="/reports/service/revenue-summary"       element={<ProtectedRoute><ServiceRevenueSummary /></ProtectedRoute>} />
                    <Route path="/reports/service/insurance-claims"      element={<ProtectedRoute><InsuranceClaims /></ProtectedRoute>} />
                    <Route path="/reports/service/mechanic-productivity" element={<ProtectedRoute><MechanicProductivity /></ProtectedRoute>} />
                    <Route path="/reports/service/tax-invoice-tracker"   element={<ProtectedRoute><TaxInvoiceTracker /></ProtectedRoute>} />

                    {/* Parts reports */}
                    <Route path="/reports/parts/stock-movement"   element={<ProtectedRoute><StockMovement /></ProtectedRoute>} />
                    <Route path="/reports/parts/reorder-alert"    element={<ProtectedRoute><ReorderAlert /></ProtectedRoute>} />
                    <Route path="/reports/parts/sales-register"   element={<ProtectedRoute><PartsSalesRegister /></ProtectedRoute>} />
                    <Route path="/reports/parts/purchase-summary" element={<ProtectedRoute><PartsPurchaseSummary /></ProtectedRoute>} />
                    <Route path="/reports/parts/issued-to-jc"     element={<ProtectedRoute><PartsIssuedToJc /></ProtectedRoute>} />
                    <Route path="/reports/parts/sold-finalized"   element={<ProtectedRoute><PartsSoldFinalized /></ProtectedRoute>} />
                    <Route path="/reports/parts/item-ledger"      element={<ProtectedRoute><ItemLedger /></ProtectedRoute>} />
                    <Route path="/reports/parts/tax-invoice-tracker" element={<ProtectedRoute><StoreSaleTaxInvoiceTracker /></ProtectedRoute>} />

                    {/* Sales (vehicle) reports */}
                    <Route path="/reports/sales/booking-register"        element={<ProtectedRoute><BookingRegister /></ProtectedRoute>} />
                    <Route path="/reports/sales/vehicle-inventory"       element={<ProtectedRoute><VehicleInventory /></ProtectedRoute>} />
                    <Route path="/reports/sales/executive-performance"   element={<ProtectedRoute><ExecutivePerformance /></ProtectedRoute>} />
                    <Route path="/reports/sales/customer-advances-aging" element={<ProtectedRoute><CustomerAdvancesAging /></ProtectedRoute>} />
                    <Route path="/reports/gencust-reconciliation" element={<ProtectedRoute moduleKey="reports"><GenCustReconciliation /></ProtectedRoute>} />
                    <Route path="/reports/voucher-audit"        element={<ProtectedRoute moduleKey="reports"><VoucherAudit /></ProtectedRoute>} />
                    <Route path="/reports/system-account-audit" element={<ProtectedRoute moduleKey="reports"><SystemAccountAudit /></ProtectedRoute>} />

                    <Route path="/workshop/customers" element={
                        <ProtectedRoute moduleKey="workshop_customers"><WorkshopCustomers /></ProtectedRoute>
                    } />
                    <Route path="/workshop/jobs" element={
                        <ProtectedRoute moduleKey="workshop_jobs"><JobCardList /></ProtectedRoute>
                    } />
                    <Route path="/workshop/vehicle-history" element={
                        <ProtectedRoute moduleKey="workshop_jobs"><VehicleHistory /></ProtectedRoute>
                    } />
                    <Route path="/workshop/jobs/new" element={
                        <ProtectedRoute moduleKey="workshop_jobs"><JobCardForm /></ProtectedRoute>
                    } />
                    <Route path="/workshop/jobs/:id" element={
                        <ProtectedRoute moduleKey="workshop_jobs"><JobCardForm /></ProtectedRoute>
                    } />
                    <Route path="/workshop/jobs/:id/print" element={
                        <ProtectedRoute moduleKey="workshop_jobs"><WorkOrderPrint /></ProtectedRoute>
                    } />
                    <Route path="/workshop/jobs/:id/credit-invoice" element={
                        <ProtectedRoute moduleKey="workshop_jobs"><CreditInvoicePrint /></ProtectedRoute>
                    } />
                    <Route path="/workshop/jobs/:id/gst-invoice" element={
                        <ProtectedRoute moduleKey="workshop_jobs"><JobCardGSTPrint /></ProtectedRoute>
                    } />
                    <Route path="/workshop/jobs/:id/pst-invoice" element={
                        <ProtectedRoute moduleKey="workshop_jobs"><JobCardPSTPrint /></ProtectedRoute>
                    } />
                    <Route path="/workshop/jobs/:id/dep-print" element={
                        <ProtectedRoute moduleKey="workshop_jobs"><JobCardDepreciationPrint /></ProtectedRoute>
                    } />
                    <Route path="/workshop/jobs/:id/depreciation-print" element={
                        <ProtectedRoute moduleKey="workshop_jobs"><JobCardDepreciationPrint /></ProtectedRoute>
                    } />
                    <Route path="/store-sale/:id/print" element={
                        <ProtectedRoute moduleKey="sales_store"><StoreSalePrint /></ProtectedRoute>
                    } />
                    <Route path="/grn/:id/print" element={
                        <ProtectedRoute moduleKey="procurement_grn"><GRNPrint /></ProtectedRoute>
                    } />
                    <Route path="/grtn/:id/print" element={
                        <ProtectedRoute moduleKey="procurement_grtn"><GRTNPrint /></ProtectedRoute>
                    } />
                    <Route path="/ssr/:id/print" element={
                        <ProtectedRoute moduleKey="sales_ssr"><SSRPrint /></ProtectedRoute>
                    } />
                    <Route path="/vouchers/:id/print" element={
                        <ProtectedRoute moduleKey="finance_vouchers"><VoucherPrint /></ProtectedRoute>
                    } />
                    <Route path="/workshop/services" element={
                        <ProtectedRoute moduleKey="workshop_labour"><LabourServices /></ProtectedRoute>
                    } />
                    <Route path="/workshop/sublet" element={
                        <ProtectedRoute moduleKey="workshop_sublet"><SubletRepair /></ProtectedRoute>
                    } />
                    <Route path="/workshop/settings" element={
                        <ProtectedRoute moduleKey="workshop_settings"><WorkshopSettings /></ProtectedRoute>
                    } />
                    <Route path="/workshop/campaigns" element={
                        <ProtectedRoute moduleKey="workshop_settings"><ServiceCampaignsAdmin /></ProtectedRoute>
                    } />
                    <Route path="/workshop/care-off" element={
                        <ProtectedRoute moduleKey="workshop_careoff"><CareOffAdmin /></ProtectedRoute>
                    } />
                    <Route path="/workshop/careoff-elevations" element={
                        <ProtectedRoute anyModules={['careoff_request_elevation', 'careoff_approve_elevation']}>
                            <CareOffElevationRequests />
                        </ProtectedRoute>
                    } />
                    <Route path="/workshop/accessories" element={
                        <ProtectedRoute moduleKey="workshop_accessories"><Accessories /></ProtectedRoute>
                    } />
                    <Route path="/workshop/controller" element={
                        <ProtectedRoute moduleKey="workshop_controller"><JobController /></ProtectedRoute>
                    } />
                    <Route path="/gatepass" element={
                        <ProtectedRoute moduleKey="workshop_gatepass"><GatePass /></ProtectedRoute>
                    } />

                    <Route path="/parts-issue" element={
                        <ProtectedRoute moduleKey="workshop_parts_issue"><PartsIssue /></ProtectedRoute>
                    } />
                    <Route path="/parts" element={
                        <ProtectedRoute moduleKey="parts_spare"><Parts /></ProtectedRoute>
                    } />
                    <Route path="/grn" element={
                        <ProtectedRoute moduleKey="procurement_grn"><GRN /></ProtectedRoute>
                    } />
                    <Route path="/grtn" element={
                        <ProtectedRoute moduleKey="procurement_grtn"><GRTN /></ProtectedRoute>
                    } />
                    <Route path="/store-sale" element={
                        <ProtectedRoute moduleKey="sales_store"><StoreSale /></ProtectedRoute>
                    } />
                    <Route path="/ssr" element={
                        <ProtectedRoute moduleKey="sales_ssr"><SSR /></ProtectedRoute>
                    } />
                    <Route path="/inventory-settings" element={
                        <ProtectedRoute moduleKey="inventory_settings"><InventorySettings /></ProtectedRoute>
                    } />

                    {/* Paint Lab (owner ask 2026-07-04) — Phase 0 wires master
                        data + settings. GRN/GRTN/Issue/Reports show a
                        placeholder page until their phase ships. */}
                    <Route path="/paint/dashboard" element={
                        <ProtectedRoute moduleKey="paint_lab_dashboard"><PaintDashboard /></ProtectedRoute>
                    } />
                    <Route path="/paint/items" element={
                        <ProtectedRoute moduleKey="paint_lab_items"><PaintItems /></ProtectedRoute>
                    } />
                    <Route path="/paint/grn" element={
                        <ProtectedRoute moduleKey="paint_lab_grn"><PaintGRN /></ProtectedRoute>
                    } />
                    <Route path="/paint/grn/:id/print" element={
                        <ProtectedRoute moduleKey="paint_lab_grn"><PaintGRNPrint /></ProtectedRoute>
                    } />
                    <Route path="/paint/grtn" element={
                        <ProtectedRoute moduleKey="paint_lab_grtn"><PaintGRTN /></ProtectedRoute>
                    } />
                    <Route path="/paint/grtn/:id/print" element={
                        <ProtectedRoute moduleKey="paint_lab_grtn"><PaintGRTNPrint /></ProtectedRoute>
                    } />
                    <Route path="/paint/issue" element={
                        <ProtectedRoute moduleKey="paint_lab_issue"><PaintIssue /></ProtectedRoute>
                    } />
                    <Route path="/paint/issue/:id/print" element={
                        <ProtectedRoute moduleKey="paint_lab_issue"><PaintIssuePrint /></ProtectedRoute>
                    } />
                    <Route path="/paint/reports" element={
                        <ProtectedRoute moduleKey="paint_lab_reports"><PaintReports /></ProtectedRoute>
                    } />
                    <Route path="/paint/settings" element={
                        <ProtectedRoute moduleKey="paint_lab_settings"><PaintSettings /></ProtectedRoute>
                    } />

                    <Route path="/customers" element={
                        <ProtectedRoute moduleKey="crm_parties"><Customers /></ProtectedRoute>
                    } />
                    <Route path="/party-business-access" element={
                        <ProtectedRoute moduleKey="crm_party_access"><PartyBusinessAccess /></ProtectedRoute>
                    } />
                    <Route path="/crd/follow-ups" element={
                        <ProtectedRoute moduleKey="crd_followups"><CRDFollowUps /></ProtectedRoute>
                    } />
                    <Route path="/cro/workspace" element={
                        <ProtectedRoute anyModules={['cro_workspace', 'cro_admin', 'cro_dept_responder']}><CROWorkspace /></ProtectedRoute>
                    } />
                    <Route path="/cro/complaints/:id" element={
                        <ProtectedRoute anyModules={['cro_workspace', 'cro_admin', 'cro_dept_responder']}><ComplaintDetail /></ProtectedRoute>
                    } />
                    <Route path="/cro/surveys" element={
                        <ProtectedRoute><SurveysAdmin /></ProtectedRoute>
                    } />
                    <Route path="/cro/survey-templates" element={
                        <ProtectedRoute moduleKey="cro_admin"><SurveyTemplatesAdmin /></ProtectedRoute>
                    } />
                    <Route path="/cro/reminders" element={
                        <ProtectedRoute><RemindersAdmin /></ProtectedRoute>
                    } />
                    <Route path="/cro/kyc-flags" element={
                        <ProtectedRoute><KYCFlagsAdmin /></ProtectedRoute>
                    } />
                    <Route path="/cro/inquiries" element={
                        <ProtectedRoute><InquiriesAdmin /></ProtectedRoute>
                    } />
                    <Route path="/cro/campaigns" element={
                        <ProtectedRoute><CampaignsAdmin /></ProtectedRoute>
                    } />
                    <Route path="/sales/models" element={
                        <ProtectedRoute><VehicleModelsAdmin /></ProtectedRoute>
                    } />
                    <Route path="/sales/variants" element={
                        <ProtectedRoute><VehicleVariantsAdmin /></ProtectedRoute>
                    } />
                    <Route path="/sales/inventory" element={
                        <ProtectedRoute><VehicleInventoryAdmin /></ProtectedRoute>
                    } />
                    <Route path="/sales/bookings" element={
                        <ProtectedRoute><BookingsList /></ProtectedRoute>
                    } />
                    <Route path="/sales/bookings/new" element={
                        <ProtectedRoute><NewBooking /></ProtectedRoute>
                    } />
                    <Route path="/sales/bookings/:id" element={
                        <ProtectedRoute><BookingDetail /></ProtectedRoute>
                    } />
                    <Route path="/sales/negotiations" element={
                        <ProtectedRoute moduleKey="sales_admin_pricing"><NegotiationQueue /></ProtectedRoute>
                    } />
                    <Route path="/sales/cancellations" element={
                        <ProtectedRoute><CancellationQueue /></ProtectedRoute>
                    } />
                    <Route path="/sales/inquiries" element={
                        <ProtectedRoute><SalesInquiryQueue /></ProtectedRoute>
                    } />
                    <Route path="/sales/incentive-policies" element={
                        <ProtectedRoute><IncentivePoliciesAdmin /></ProtectedRoute>
                    } />
                    <Route path="/sales/incentive-disbursement" element={
                        <ProtectedRoute><IncentiveDisbursement /></ProtectedRoute>
                    } />
                    <Route path="/sales/master-incentive" element={
                        <ProtectedRoute><MasterIncentive /></ProtectedRoute>
                    } />
                    <Route path="/sales/recovery" element={
                        <ProtectedRoute><SalesRecovery /></ProtectedRoute>
                    } />
                    <Route path="/sales/hierarchy-targets" element={
                        <ProtectedRoute><HierarchyTargets /></ProtectedRoute>
                    } />
                    <Route path="/sales/draft-vouchers" element={
                        <ProtectedRoute><DraftVouchers /></ProtectedRoute>
                    } />
                    <Route path="/sales/reports" element={
                        <ProtectedRoute><SalesReportsV2 /></ProtectedRoute>
                    } />
                    <Route path="/cro/reports" element={
                        <ProtectedRoute moduleKey="cro_reports"><CROReports /></ProtectedRoute>
                    } />
                    <Route path="/employees" element={
                        <ProtectedRoute moduleKey="hr_employees"><Employees /></ProtectedRoute>
                    } />
                    <Route path="/hr-settings" element={
                        <ProtectedRoute moduleKey="hr_settings"><HRSettings /></ProtectedRoute>
                    } />
                    <Route path="/hr/employees-salary" element={
                        <ProtectedRoute moduleKey="hr_employees"><HrEmployeeSalary /></ProtectedRoute>
                    } />
                    <Route path="/hr/attendance" element={
                        <ProtectedRoute moduleKey="hr_attendance"><HrAttendance /></ProtectedRoute>
                    } />
                    <Route path="/hr/salary-sheet" element={
                        <ProtectedRoute moduleKey="hr_salary"><HrSalarySheet /></ProtectedRoute>
                    } />
                    <Route path="/hr/mess-sheet" element={
                        <ProtectedRoute moduleKey="hr_salary"><HrMessSheet /></ProtectedRoute>
                    } />
                    <Route path="/hr/fine-settings" element={
                        <ProtectedRoute moduleKey="hr_settings"><HrFineSettings /></ProtectedRoute>
                    } />
                    <Route path="/hr/dept-accounts" element={
                        <ProtectedRoute moduleKey="hr_settings"><HrDeptSalaryAccounts /></ProtectedRoute>
                    } />
                    <Route path="/hr/salary-slip/:monthId/:employeeId/print" element={<HrSalarySlipPrint />} />
                    <Route path="/hr/salary/:monthId/print"                  element={<HrSalarySheetPrint />} />
                    <Route path="/hr/bank-letter/:monthId/print"             element={<HrBankLetterPrint />} />
                    <Route path="/hr/cash-letter/:monthId/print"             element={<HrCashLetterPrint />} />

                    <Route path="/admin/users" element={
                        <ProtectedRoute moduleKey="admin_users"><UsersAdmin /></ProtectedRoute>
                    } />
                    <Route path="/admin/permissions" element={
                        <ProtectedRoute moduleKey="admin_permissions"><RolePermissions /></ProtectedRoute>
                    } />

                    <Route path="/unfinalize-requests" element={
                        <ProtectedRoute><UnfinalizeRequests /></ProtectedRoute>
                    } />

                    <Route path="/login" element={<Navigate to="/" replace />} />
                    <Route path="/vehicles" element={<Vehicles />} />
                    <Route path="/services" element={<Services />} />
                </Routes>
                </div>
            </main>
        </div>
        </FeedbackProvider>
    );
}

// Top-level dispatcher: explicit pathname check so public routes bypass
// AuthProvider entirely. Relying on <Route path="/*"> ranking alongside the
// specific /kiosk/jobs and /survey/:token routes was letting the splat win
// under react-router-dom v7 — every request to /kiosk/jobs bounced through
// AppShell, hit the `if (!user) return <Login />` guard, and landed on the
// sign-in page. matchPath here is deterministic.
function RootDispatcher() {
    const { pathname } = useLocation();
    if (pathname === '/kiosk/jobs') return <JobKiosk />;
    // Survey needs its :token path param exposed via useParams, so it stays
    // inside a matched <Route>.
    if (matchPath('/survey/:token', pathname)) {
        return (
            <Routes>
                <Route path="/survey/:token" element={<SurveyPublic />} />
            </Routes>
        );
    }
    return (
        <AuthProvider>
            <AppShell />
        </AuthProvider>
    );
}

function App() {
    return (
        <BrowserRouter>
            <RootDispatcher />
        </BrowserRouter>
    );
}

export default App;
