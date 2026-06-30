import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Cake,
  ClipboardList,
  CreditCard,
  Headphones,
  Package,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingCart,
  Wrench,
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = '/api/workshop';

const ACTIONS = [
  {
    title: 'Create Job Card',
    detail: 'Open a service visit and start RO work.',
    to: '/workshop/jobs/new',
    icon: Wrench,
    moduleKey: 'workshop_jobs',
    tone: 'blue',
  },
  {
    title: 'Search Job Cards',
    detail: 'Find active, draft, or finalized service work.',
    to: '/workshop/jobs',
    icon: ClipboardList,
    moduleKey: 'workshop_jobs',
    tone: 'indigo',
  },
  {
    title: 'Job Controller',
    detail: 'Track bay, technician, and job progress.',
    to: '/workshop/controller',
    icon: Activity,
    moduleKey: 'workshop_controller',
    tone: 'green',
  },
  {
    title: 'Issue Parts',
    detail: 'Post parts consumption against a job card.',
    to: '/parts-issue',
    icon: Package,
    moduleKey: 'workshop_parts_issue',
    tone: 'amber',
  },
  {
    title: 'Receiving (GRN)',
    detail: 'Record supplier receiving and landed cost.',
    to: '/grn',
    icon: ShoppingCart,
    moduleKey: 'procurement_grn',
    tone: 'teal',
  },
  {
    title: 'Receive Payment',
    detail: 'Collect customer payment and post the voucher.',
    to: '/payments/receive',
    icon: Receipt,
    moduleKey: 'payments',
    tone: 'emerald',
  },
  {
    title: 'POS Settlement',
    detail: 'Clear card collections into bank receipts.',
    to: '/payments/pos-settlement',
    icon: CreditCard,
    moduleKey: 'payments',
    tone: 'violet',
  },
  {
    title: 'CRO Workspace',
    detail: 'Handle complaints, follow-ups, and escalations.',
    to: '/cro/workspace',
    icon: Headphones,
    moduleKey: 'cro_workspace',
    tone: 'rose',
  },
  {
    title: 'Sales Bookings',
    detail: 'Review vehicle bookings and pending actions.',
    to: '/sales/bookings',
    icon: ShieldCheck,
    anyModules: ['sales_executive', 'sales_agm', 'sales_gm', 'sales_reports'],
    tone: 'slate',
  },
];

const WORK_AREAS = [
  {
    title: 'Service Desk',
    items: [
      { label: 'Open job cards', to: '/workshop/jobs', moduleKey: 'workshop_jobs' },
      { label: 'Bay controller', to: '/workshop/controller', moduleKey: 'workshop_controller' },
      { label: 'Service campaigns', to: '/workshop/campaigns', moduleKey: 'workshop_settings' },
    ],
  },
  {
    title: 'Cash & Stock',
    items: [
      { label: 'Receive payments', to: '/payments/receive', moduleKey: 'payments' },
      { label: 'GRN receiving', to: '/grn', moduleKey: 'procurement_grn' },
      { label: 'Stock movement', to: '/reports/parts/stock-movement', anyModules: ['parts_spare', 'inventory_settings', 'reports'] },
    ],
  },
  {
    title: 'Customer Follow-Up',
    items: [
      { label: 'CRD follow-ups', to: '/crd/follow-ups', moduleKey: 'crd_followups' },
      { label: 'CRO complaints', to: '/cro/workspace', moduleKey: 'cro_workspace' },
      { label: 'Service reminders', to: '/cro/reminders', anyModules: ['cro_workspace', 'cro_admin', 'cro_reports'] },
    ],
  },
];

function canUse(item, hasModule) {
  if (item.moduleKey && !hasModule(item.moduleKey)) return false;
  if (item.anyModules && !item.anyModules.some(hasModule)) return false;
  return true;
}

function ActionCard({ action }) {
  const Icon = action.icon;
  return (
    <Link to={action.to} className={`workspace-action tone-${action.tone}`}>
      <span className="workspace-action-icon"><Icon size={22} /></span>
      <span className="workspace-action-body">
        <strong>{action.title}</strong>
        <small>{action.detail}</small>
      </span>
      <ArrowRight size={17} />
    </Link>
  );
}

function WorkArea({ area, hasModule }) {
  const items = area.items.filter(item => canUse(item, hasModule));
  if (!items.length) return null;

  return (
    <section className="work-area">
      <h2>{area.title}</h2>
      <div className="work-area-links">
        {items.map(item => (
          <Link key={item.to} to={item.to}>
            <span>{item.label}</span>
            <ArrowRight size={15} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function BirthdayList({ birthdays }) {
  const today = birthdays.filter(b => b.IsToday);
  const upcoming = birthdays.filter(b => !b.IsToday);

  if (!birthdays.length) {
    return (
      <div className="empty-state compact">
        <Cake size={20} />
        <strong>No customer birthdays this week</strong>
      </div>
    );
  }

  return (
    <div className="birthday-list">
      {today.length > 0 && (
        <div className="birthday-group">
          <div className="birthday-heading">Today</div>
          {today.map(b => <BirthdayRow key={b.ProfileID} birthday={b} highlight />)}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="birthday-group">
          {today.length > 0 && <div className="birthday-heading muted">Upcoming</div>}
          {upcoming.map(b => <BirthdayRow key={b.ProfileID} birthday={b} />)}
        </div>
      )}
    </div>
  );
}

function BirthdayRow({ birthday, highlight = false }) {
  const dobDate = new Date(birthday.DOB);
  const label = Number.isNaN(dobDate.getTime())
    ? ''
    : `${dobDate.toLocaleString('default', { month: 'short' })} ${dobDate.getDate()}`;

  return (
    <div className={`birthday-row ${highlight ? 'highlight' : ''}`}>
      <span className="avatar-circle">{(birthday.CustomerName || '?').charAt(0).toUpperCase()}</span>
      <span>
        <strong>{birthday.CustomerName}</strong>
        <small>{birthday.PhoneNo || 'No phone'}</small>
      </span>
      <em>{highlight ? 'Today' : label}</em>
    </div>
  );
}

export default function Dashboard() {
  const { user, hasModule } = useAuth();
  const [birthdays, setBirthdays] = useState([]);
  const [birthdayError, setBirthdayError] = useState('');

  useEffect(() => {
    axios.get(`${API}/birthdays`)
      .then(r => {
        setBirthdays(Array.isArray(r.data) ? r.data : []);
        setBirthdayError('');
      })
      .catch(() => setBirthdayError('Birthdays could not be loaded.'));
  }, []);

  const visibleActions = useMemo(
    () => ACTIONS.filter(action => canUse(action, hasModule)).slice(0, 8),
    [hasModule]
  );

  return (
    <div className="dashboard-workspace">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Daily workspace</p>
          <h1 className="page-title">Good work starts here{user?.userName ? `, ${user.userName}` : ''}</h1>
          <p className="page-subtitle">Open the next transaction, queue, or report without hunting through menus.</p>
        </div>
        <Link to="/workshop/jobs" className="hero-search-link">
          <Search size={18} />
          <span>Find job cards</span>
        </Link>
      </section>

      {visibleActions.length > 0 ? (
        <section className="workspace-actions-grid" aria-label="Priority actions">
          {visibleActions.map(action => <ActionCard key={action.to} action={action} />)}
        </section>
      ) : (
        <div className="empty-state">
          <ShieldCheck size={24} />
          <strong>No workspace shortcuts for this role</strong>
          <span>Ask an administrator to assign modules for your daily work.</span>
        </div>
      )}

      <section className="work-area-grid">
        {WORK_AREAS.map(area => <WorkArea key={area.title} area={area} hasModule={hasModule} />)}
      </section>

      <section className="dashboard-panel-grid">
        <div className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Customer care</p>
              <h2>Birthdays</h2>
            </div>
            <Cake size={21} />
          </div>
          {birthdayError ? (
            <div className="inline-warning">{birthdayError}</div>
          ) : (
            <BirthdayList birthdays={birthdays} />
          )}
        </div>

        <div className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Fast paths</p>
              <h2>Reports</h2>
            </div>
            <ClipboardList size={21} />
          </div>
          <div className="report-shortcuts">
            {[
              { label: 'Trial Balance', to: '/reports/trial-balance', moduleKey: 'reports' },
              { label: 'Inventory On-Hand', to: '/reports/inventory-valuation', anyModules: ['parts_spare', 'inventory_settings', 'reports'] },
              { label: 'Service Revenue', to: '/reports/service/revenue-summary', anyModules: ['workshop_jobs', 'workshop_labour', 'reports'] },
              { label: 'Booking Register', to: '/reports/sales/booking-register', anyModules: ['sales_executive', 'sales_agm', 'sales_gm', 'sales_reports'] },
            ].filter(item => canUse(item, hasModule)).map(item => (
              <Link key={item.to} to={item.to}>
                {item.label}
                <ArrowRight size={15} />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
