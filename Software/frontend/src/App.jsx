import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import {
    Car, Users, Building, Settings as SettingsIcon, LayoutDashboard, Database,
    Wrench, Package, FileInput, FileOutput, ShoppingCart, Undo2, Landmark,
    CreditCard, Wallet, Receipt, ArrowLeftRight, ClipboardList, UserCircle,
    BoxSelect, PlusCircle, ExternalLink, SlidersHorizontal, LogOut, ShieldCheck, UsersRound, Unlock, UserCheck,
    FileBarChart, ListChecks, Headphones, UserCog, Truck, Percent, Bell, MessageSquare, Megaphone, Layers, Ban
} from 'lucide-react';

import { AuthProvider, useAuth } from './context/AuthContext';
import { isDemoMode } from './demoMode';

import Dashboard          from './pages/Dashboard';
import Login              from './pages/Login';
import Employees          from './pages/Employees';
import HRSettings         from './pages/HRSettings';
import Customers          from './pages/Customers';
import Vehicles           from './pages/Vehicles';
import Parts              from './pages/Parts';
import Services           from './pages/Services';
import InventorySettings  from './pages/InventorySettings';
import GRN                from './pages/GRN';
import GRTN               from './pages/GRTN';
import StoreSale          from './pages/StoreSale';
import SSR                from './pages/SSR';
import ChartOfAccounts    from './pages/ChartOfAccounts';
import VoucherEntry       from './pages/VoucherEntry';
import WorkshopCustomers  from './pages/WorkshopCustomers';
import JobCardList        from './pages/JobCardList';
import JobCardForm        from './pages/JobCardForm';
import PartsIssue         from './pages/PartsIssue';
import SubletRepair       from './pages/SubletRepair';
import LabourServices     from './pages/LabourServices';
import WorkshopSettings   from './pages/WorkshopSettings';
import CareOffAdmin       from './pages/CareOffAdmin';
import SystemAccounts     from './pages/SystemAccounts';
import TaxRates           from './pages/TaxRates';
import ReceivePayment     from './pages/ReceivePayment';
import MakePayment        from './pages/MakePayment';
import POSSettlement      from './pages/POSSettlement';
import BankAccounts       from './pages/BankAccounts';
import CRDFollowUps       from './pages/CRDFollowUps';
import VoucherBrowser     from './pages/VoucherBrowser';
import TrialBalance       from './pages/TrialBalance';
import GLDetail           from './pages/GLDetail';
import PartyStatement     from './pages/PartyStatement';
import DailyCashBook      from './pages/DailyCashBook';
import TaxSummary         from './pages/TaxSummary';
import { PnL, BalanceSheet, DayBook }                       from './pages/reports/Financials';
import { ReceivablesAging, PayablesAging, InsuranceAging }  from './pages/reports/Aging';
import { POSPending, ChequesOnHand, BankBalances, TaxRateHistory } from './pages/reports/Operational';
import { DiscountGiven, SalesRegister, GrossMargin, GenCustReconciliation } from './pages/reports/Workshop';
import { InventoryValuation } from './pages/reports/Inventory';
import { VoucherAudit, SystemAccountAudit }                 from './pages/reports/Audit';
import Accessories        from './pages/Accessories';
import JobController      from './pages/JobController';
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
import IncentiveDisbursement from './pages/sales/IncentiveDisbursement';
import CancellationQueue from './pages/sales/CancellationQueue';
import SalesInquiryQueue from './pages/sales/SalesInquiryQueue';
import SurveyPublic         from './pages/SurveyPublic';
import NotificationBell     from './components/NotificationBell';

function ProtectedRoute({ moduleKey, children }) {
    const { user, loading, hasModule } = useAuth();
    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (moduleKey && !hasModule(moduleKey)) {
        return (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                You do not have permission to access this module.
            </div>
        );
    }
    return children;
}

function Sidebar() {
    const { user, logout, hasModule } = useAuth();

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <Car size={24} />
                <span>AutoDMS</span>
            </div>
            <nav className="sidebar-nav">
                <NavLink to="/" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} end>
                    <LayoutDashboard size={20} /> Dashboard
                </NavLink>

                {/* Workshop */}
                {(hasModule('workshop_customers') || hasModule('workshop_jobs') || hasModule('workshop_labour') ||
                  hasModule('workshop_sublet') || hasModule('workshop_parts_issue') || hasModule('workshop_settings') ||
                  hasModule('workshop_careoff') || hasModule('workshop_accessories') || hasModule('workshop_controller')) && (
                    <div className="nav-section">WORKSHOP & SERVICE</div>
                )}
                {hasModule('workshop_customers') && (
                    <NavLink to="/workshop/customers" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <UserCircle size={20} /> Workshop Customers
                    </NavLink>
                )}
                {hasModule('workshop_jobs') && (
                    <NavLink to="/workshop/jobs/new" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <PlusCircle size={20} /> Create Job Card
                    </NavLink>
                )}
                {hasModule('workshop_jobs') && (
                    <NavLink to="/workshop/jobs" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ClipboardList size={20} /> Search Job Cards
                    </NavLink>
                )}
                {hasModule('workshop_labour') && (
                    <NavLink to="/workshop/services" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Wrench size={20} /> Labour & Services
                    </NavLink>
                )}
                {hasModule('workshop_sublet') && (
                    <NavLink to="/workshop/sublet" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ExternalLink size={20} /> Sublet Repairs
                    </NavLink>
                )}
                {hasModule('workshop_settings') && (
                    <NavLink to="/workshop/settings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <SlidersHorizontal size={20} /> Workshop Settings
                    </NavLink>
                )}
                {hasModule('workshop_careoff') && (
                    <NavLink to="/workshop/care-off" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <UserCheck size={20} /> Care-Off Management
                    </NavLink>
                )}
                {hasModule('workshop_accessories') && (
                    <NavLink to="/workshop/accessories" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Package size={20} /> Accessories
                    </NavLink>
                )}
                {hasModule('workshop_controller') && (
                    <NavLink to="/workshop/controller" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ClipboardList size={20} /> Job Controller
                    </NavLink>
                )}

                {/* Parts & Inventory */}
                {(hasModule('parts_spare') || hasModule('procurement_grn') || hasModule('procurement_grtn') ||
                  hasModule('sales_store') || hasModule('sales_ssr') || hasModule('workshop_parts_issue') ||
                  hasModule('inventory_settings')) && (
                    <div className="nav-section">PARTS & INVENTORY</div>
                )}
                {hasModule('parts_spare') && (
                    <NavLink to="/parts" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Package size={20} /> Spare Parts
                    </NavLink>
                )}
                {(hasModule('parts_spare') || hasModule('inventory_settings')) && (
                    <NavLink to="/reports/inventory-valuation" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <FileBarChart size={20} /> Inventory On-Hand
                    </NavLink>
                )}
                {hasModule('procurement_grn') && (
                    <NavLink to="/grn" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <FileInput size={20} /> Receiving (GRN)
                    </NavLink>
                )}
                {hasModule('procurement_grtn') && (
                    <NavLink to="/grtn" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <FileOutput size={20} /> Returns (GRTN)
                    </NavLink>
                )}
                {hasModule('sales_store') && (
                    <NavLink to="/store-sale" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ShoppingCart size={20} /> Store Sale (Spares)
                    </NavLink>
                )}
                {hasModule('sales_ssr') && (
                    <NavLink to="/ssr" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Undo2 size={20} /> Sale Returns (SSR)
                    </NavLink>
                )}
                {hasModule('workshop_parts_issue') && (
                    <NavLink to="/parts-issue" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <BoxSelect size={20} /> Parts Issue (Job Card)
                    </NavLink>
                )}
                {hasModule('inventory_settings') && (
                    <NavLink to="/inventory-settings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Database size={20} /> Parts Config
                    </NavLink>
                )}

                {/* Finance */}
                {(hasModule('finance_coa') || hasModule('finance_vouchers') || hasModule('accounting_setup') || hasModule('payments')) && (
                    <div className="nav-section">FINANCE & ACCOUNTS</div>
                )}
                {hasModule('finance_coa') && (
                    <NavLink to="/coa" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Landmark size={20} /> Chart of Accounts
                    </NavLink>
                )}
                {hasModule('finance_vouchers') && (
                    <>
                        <NavLink to="/vouchers/cpv" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                            <Wallet size={20} /> Cash Payment (CPV)
                        </NavLink>
                        <NavLink to="/vouchers/crv" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                            <Receipt size={20} /> Cash Receipt (CRV)
                        </NavLink>
                        <NavLink to="/vouchers/bpv" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                            <CreditCard size={20} /> Bank Payment (BPV)
                        </NavLink>
                        <NavLink to="/vouchers/brv" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                            <Landmark size={20} /> Bank Receipt (BRV)
                        </NavLink>
                        <NavLink to="/vouchers/jv" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                            <ArrowLeftRight size={20} /> Journal Voucher (JV)
                        </NavLink>
                        <NavLink to="/vouchers/browse" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                            <ClipboardList size={20} /> Voucher Browser
                        </NavLink>
                    </>
                )}
                {hasModule('accounting_setup') && (
                    <>
                    <NavLink to="/accounting/setup" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <SettingsIcon size={20} /> Accounting Setup
                    </NavLink>
                    <NavLink to="/accounting/tax-rates" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <SlidersHorizontal size={20} /> Tax Rates
                    </NavLink>
                    <NavLink to="/accounting/bank-accounts" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Landmark size={20} /> Bank Accounts
                    </NavLink>
                    </>
                )}
                {hasModule('payments') && (
                    <>
                    <NavLink to="/payments/receive" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Receipt size={20} /> Receive Payment
                    </NavLink>
                    <NavLink to="/payments/make" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Wallet size={20} /> Make Payment
                    </NavLink>
                    <NavLink to="/payments/pos-settlement" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <CreditCard size={20} /> POS Settlement
                    </NavLink>
                    </>
                )}
                {hasModule('reports') && (
                    <>
                        <div className="nav-section">ACCOUNT REPORTS</div>
                        <NavLink to="/reports/trial-balance"      className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><FileBarChart size={20} /> Trial Balance</NavLink>
                        <NavLink to="/reports/gl-detail"          className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ListChecks size={20} /> GL Detail</NavLink>
                        <NavLink to="/reports/pnl"                className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ListChecks size={20} /> Profit &amp; Loss</NavLink>
                        <NavLink to="/reports/balance-sheet"      className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ListChecks size={20} /> Balance Sheet</NavLink>
                        <NavLink to="/reports/day-book"           className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ListChecks size={20} /> Day Book</NavLink>
                        <NavLink to="/reports/customer-statement" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><UserCog size={20} /> Customer Statement</NavLink>
                        <NavLink to="/reports/supplier-statement" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><Truck size={20} /> Supplier Statement</NavLink>
                        <NavLink to="/reports/receivables-aging"  className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ListChecks size={20} /> Receivables Aging</NavLink>
                        <NavLink to="/reports/payables-aging"     className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ListChecks size={20} /> Payables Aging</NavLink>
                        <NavLink to="/reports/insurance-aging"    className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ListChecks size={20} /> Insurance Aging</NavLink>
                        <NavLink to="/reports/daily-cash-book"    className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><Wallet size={20} /> Daily Cash Book</NavLink>
                        <NavLink to="/reports/bank-balances"      className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><Landmark size={20} /> Bank Balances</NavLink>
                        <NavLink to="/reports/pos-pending"        className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><CreditCard size={20} /> POS Pending</NavLink>
                        <NavLink to="/reports/cheques-on-hand"    className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><Receipt size={20} /> Cheques on Hand</NavLink>
                        <NavLink to="/reports/tax-summary"        className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><Percent size={20} /> Tax Summary</NavLink>
                        <NavLink to="/reports/tax-rate-history"   className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><Percent size={20} /> Tax Rate History</NavLink>
                        <NavLink to="/reports/sales-register"     className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ListChecks size={20} /> Sales Register</NavLink>
                        <NavLink to="/reports/gross-margin"       className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ListChecks size={20} /> Gross Margin</NavLink>
                        <NavLink to="/reports/discount-given"     className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ListChecks size={20} /> Discount Given</NavLink>
                        <NavLink to="/reports/inventory-valuation" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ListChecks size={20} /> Inventory Valuation</NavLink>
                        <NavLink to="/reports/gencust-reconciliation" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ListChecks size={20} /> Gen-Customer Recon</NavLink>
                        <NavLink to="/reports/voucher-audit"      className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ListChecks size={20} /> Voucher Audit Trail</NavLink>
                        <NavLink to="/reports/system-account-audit" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><ShieldCheck size={20} /> System Account Audit</NavLink>
                    </>
                )}

                {/* Parties master (accounting side — AR/AP master) */}
                {hasModule('crm_parties') && (
                    <>
                        <div className="nav-section">PARTIES</div>
                        <NavLink to="/customers" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                            <Building size={20} /> Credit Parties
                        </NavLink>
                    </>
                )}

                {/* Customer Relation (CRM + CRO) */}
                {(hasModule('crd_followups') || hasModule('cro_workspace')) && (
                    <div className="nav-section">CUSTOMER RELATION</div>
                )}
                {hasModule('crd_followups') && (
                    <NavLink to="/crd/follow-ups" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Headphones size={20} /> Follow-Ups
                    </NavLink>
                )}
                {hasModule('cro_workspace') && (
                    <NavLink to="/cro/workspace" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Headphones size={20} /> CRO Workspace
                    </NavLink>
                )}
                {(hasModule('cro_workspace') || hasModule('cro_admin') || hasModule('cro_reports')) && (
                    <NavLink to="/cro/surveys" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ClipboardList size={20} /> Surveys
                    </NavLink>
                )}
                {hasModule('cro_admin') && (
                    <NavLink to="/cro/survey-templates" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ClipboardList size={20} /> Survey Templates
                    </NavLink>
                )}
                {(hasModule('cro_workspace') || hasModule('cro_admin') || hasModule('cro_reports')) && (
                    <NavLink to="/cro/reminders" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Bell size={20} /> Service Reminders
                    </NavLink>
                )}
                {(hasModule('cro_workspace') || hasModule('cro_admin') || hasModule('cro_reports')) && (
                    <NavLink to="/cro/kyc-flags" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ShieldCheck size={20} /> KYC Flags
                    </NavLink>
                )}
                {(hasModule('cro_workspace') || hasModule('cro_admin') || hasModule('cro_reports')) && (
                    <NavLink to="/cro/inquiries" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <MessageSquare size={20} /> Inquiries
                    </NavLink>
                )}
                {(hasModule('cro_workspace') || hasModule('cro_admin') || hasModule('cro_reports')) && (
                    <NavLink to="/cro/campaigns" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Megaphone size={20} /> Campaigns
                    </NavLink>
                )}

                {/* New Vehicle Sales */}
                {(hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') ||
                  hasModule('sales_admin_settings') || hasModule('sales_master_settlement') ||
                  hasModule('sales_reports')) && (
                    <div className="nav-section">NEW VEHICLE SALES</div>
                )}
                {(hasModule('sales_admin_settings') || hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/models" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Car size={20} /> Vehicle Models
                    </NavLink>
                )}
                {(hasModule('sales_admin_settings') || hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/variants" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Layers size={20} /> Vehicle Variants
                    </NavLink>
                )}
                {(hasModule('sales_admin_settings') || hasModule('sales_master_settlement') || hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/inventory" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Truck size={20} /> Vehicle Inventory
                    </NavLink>
                )}
                {(hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/bookings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ClipboardList size={20} /> Bookings
                    </NavLink>
                )}
                {(hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_admin_settings') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/inquiries" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Headphones size={20} /> Sales Inquiries
                    </NavLink>
                )}
                {hasModule('sales_admin_pricing') && (
                    <NavLink to="/sales/negotiations" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ShieldCheck size={20} /> Discount Approvals
                    </NavLink>
                )}
                {(hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') || hasModule('am_approve') || hasModule('admin_unfinalize') || hasModule('sales_admin_settings')) && (
                    <NavLink to="/sales/cancellations" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Ban size={20} /> Cancellation Queue
                    </NavLink>
                )}
                {(hasModule('sales_admin_settings') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/incentive-policies" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Percent size={20} /> Incentive Policies
                    </NavLink>
                )}
                {(hasModule('sales_admin_settings') || hasModule('sales_gm') || hasModule('sales_reports')) && (
                    <NavLink to="/sales/incentive-disbursement" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Wallet size={20} /> Staff Incentive Payout
                    </NavLink>
                )}
                {hasModule('cro_reports') && (
                    <NavLink to="/cro/reports" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <FileBarChart size={20} /> CRO Reports
                    </NavLink>
                )}

                {/* HR */}
                {(hasModule('hr_employees') || hasModule('hr_settings')) && (
                    <div className="nav-section">ADMIN & HR</div>
                )}
                {hasModule('hr_employees') && (
                    <NavLink to="/employees" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Users size={20} /> Employees
                    </NavLink>
                )}
                {hasModule('hr_settings') && (
                    <NavLink to="/hr-settings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <SettingsIcon size={20} /> HR Config
                    </NavLink>
                )}

                {/* Admin */}
                {(hasModule('admin_users') || hasModule('admin_permissions')) && (
                    <div className="nav-section">ADMINISTRATION</div>
                )}
                {hasModule('admin_users') && (
                    <NavLink to="/admin/users" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <UsersRound size={20} /> User Management
                    </NavLink>
                )}
                {hasModule('admin_permissions') && (
                    <NavLink to="/admin/permissions" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ShieldCheck size={20} /> Role Permissions
                    </NavLink>
                )}

                {/* Workflow */}
                {(hasModule('am_approve') || hasModule('admin_unfinalize')) && (
                    <>
                        <div className="nav-section">WORKFLOW</div>
                        <NavLink to="/unfinalize-requests" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                            <Unlock size={20} /> Unfinalize Requests
                        </NavLink>
                    </>
                )}
            </nav>

            {/* User info + logout at bottom */}
            {user && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid #1e3a5f', marginTop: 'auto' }}>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{user.groupTitle}</div>
                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600, marginBottom: 8 }}>{user.userName}</div>
                    <button
                        onClick={logout}
                        style={{
                            background: 'transparent', border: '1px solid #334155', color: '#94a3b8',
                            borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12,
                            display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center'
                        }}
                    >
                        <LogOut size={14} /> Sign Out
                    </button>
                </div>
            )}
        </aside>
    );
}

function AppShell() {
    const { user, loading } = useAuth();

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>;
    if (!user) return <Login />;

    return (
        <div className="app-container">
            <Sidebar />
            <NotificationBell />
            <main className="main-content">
                {isDemoMode && (
                    <div style={{
                        background: 'linear-gradient(90deg, #fef3c7 0%, #fde68a 100%)',
                        border: '1px solid #f59e0b', color: '#78350f',
                        padding: '8px 14px', borderRadius: 6, fontSize: '0.78rem',
                        marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <strong>DEMO MODE</strong>
                        <span>— UI preview only. No real backend; all data is mocked and changes are not saved.</span>
                    </div>
                )}
                <Routes>
                    <Route path="/" element={<Dashboard />} />

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
                    <Route path="/accounting/setup" element={
                        <ProtectedRoute moduleKey="accounting_setup"><SystemAccounts /></ProtectedRoute>
                    } />
                    <Route path="/accounting/tax-rates" element={
                        <ProtectedRoute moduleKey="accounting_setup"><TaxRates /></ProtectedRoute>
                    } />
                    <Route path="/accounting/bank-accounts" element={
                        <ProtectedRoute moduleKey="accounting_setup"><BankAccounts /></ProtectedRoute>
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
                    <Route path="/reports/trial-balance" element={
                        <ProtectedRoute moduleKey="reports"><TrialBalance /></ProtectedRoute>
                    } />
                    <Route path="/reports/gl-detail" element={
                        <ProtectedRoute moduleKey="reports"><GLDetail /></ProtectedRoute>
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
                    <Route path="/reports/balance-sheet"        element={<ProtectedRoute moduleKey="reports"><BalanceSheet /></ProtectedRoute>} />
                    <Route path="/reports/day-book"             element={<ProtectedRoute moduleKey="reports"><DayBook /></ProtectedRoute>} />
                    <Route path="/reports/receivables-aging"    element={<ProtectedRoute moduleKey="reports"><ReceivablesAging /></ProtectedRoute>} />
                    <Route path="/reports/payables-aging"       element={<ProtectedRoute moduleKey="reports"><PayablesAging /></ProtectedRoute>} />
                    <Route path="/reports/insurance-aging"      element={<ProtectedRoute moduleKey="reports"><InsuranceAging /></ProtectedRoute>} />
                    <Route path="/reports/pos-pending"          element={<ProtectedRoute moduleKey="reports"><POSPending /></ProtectedRoute>} />
                    <Route path="/reports/cheques-on-hand"      element={<ProtectedRoute moduleKey="reports"><ChequesOnHand /></ProtectedRoute>} />
                    <Route path="/reports/bank-balances"        element={<ProtectedRoute moduleKey="reports"><BankBalances /></ProtectedRoute>} />
                    <Route path="/reports/tax-rate-history"     element={<ProtectedRoute moduleKey="reports"><TaxRateHistory /></ProtectedRoute>} />
                    <Route path="/reports/sales-register"       element={<ProtectedRoute moduleKey="reports"><SalesRegister /></ProtectedRoute>} />
                    <Route path="/reports/gross-margin"         element={<ProtectedRoute moduleKey="reports"><GrossMargin /></ProtectedRoute>} />
                    <Route path="/reports/discount-given"       element={<ProtectedRoute moduleKey="reports"><DiscountGiven /></ProtectedRoute>} />
                    <Route path="/reports/inventory-valuation"  element={<ProtectedRoute><InventoryValuation /></ProtectedRoute>} />
                    <Route path="/reports/gencust-reconciliation" element={<ProtectedRoute moduleKey="reports"><GenCustReconciliation /></ProtectedRoute>} />
                    <Route path="/reports/voucher-audit"        element={<ProtectedRoute moduleKey="reports"><VoucherAudit /></ProtectedRoute>} />
                    <Route path="/reports/system-account-audit" element={<ProtectedRoute moduleKey="reports"><SystemAccountAudit /></ProtectedRoute>} />

                    <Route path="/workshop/customers" element={
                        <ProtectedRoute moduleKey="workshop_customers"><WorkshopCustomers /></ProtectedRoute>
                    } />
                    <Route path="/workshop/jobs" element={
                        <ProtectedRoute moduleKey="workshop_jobs"><JobCardList /></ProtectedRoute>
                    } />
                    <Route path="/workshop/jobs/new" element={
                        <ProtectedRoute moduleKey="workshop_jobs"><JobCardForm /></ProtectedRoute>
                    } />
                    <Route path="/workshop/jobs/:id" element={
                        <ProtectedRoute moduleKey="workshop_jobs"><JobCardForm /></ProtectedRoute>
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
                    <Route path="/workshop/care-off" element={
                        <ProtectedRoute moduleKey="workshop_careoff"><CareOffAdmin /></ProtectedRoute>
                    } />
                    <Route path="/workshop/accessories" element={
                        <ProtectedRoute moduleKey="workshop_accessories"><Accessories /></ProtectedRoute>
                    } />
                    <Route path="/workshop/controller" element={
                        <ProtectedRoute moduleKey="workshop_controller"><JobController /></ProtectedRoute>
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

                    <Route path="/customers" element={
                        <ProtectedRoute moduleKey="crm_parties"><Customers /></ProtectedRoute>
                    } />
                    <Route path="/crd/follow-ups" element={
                        <ProtectedRoute moduleKey="crd_followups"><CRDFollowUps /></ProtectedRoute>
                    } />
                    <Route path="/cro/workspace" element={
                        <ProtectedRoute moduleKey="cro_workspace"><CROWorkspace /></ProtectedRoute>
                    } />
                    <Route path="/cro/complaints/:id" element={
                        <ProtectedRoute moduleKey="cro_workspace"><ComplaintDetail /></ProtectedRoute>
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
                    <Route path="/cro/reports" element={
                        <ProtectedRoute moduleKey="cro_reports"><CROReports /></ProtectedRoute>
                    } />
                    <Route path="/employees" element={
                        <ProtectedRoute moduleKey="hr_employees"><Employees /></ProtectedRoute>
                    } />
                    <Route path="/hr-settings" element={
                        <ProtectedRoute moduleKey="hr_settings"><HRSettings /></ProtectedRoute>
                    } />

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
            </main>
        </div>
    );
}

function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Public, unauthenticated route — customers tap this from a WhatsApp/SMS link */}
                <Route path="/survey/:token" element={<SurveyPublic />} />
                {/* Everything else goes through the app shell behind AuthProvider */}
                <Route path="/*" element={
                    <AuthProvider>
                        <AppShell />
                    </AuthProvider>
                } />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
