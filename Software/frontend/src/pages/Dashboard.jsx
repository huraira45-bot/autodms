import React, { useState, useEffect } from 'react';
import { Users, Building, Activity, Cake } from 'lucide-react';
import axios from 'axios';

const API = '/api/workshop';

export default function Dashboard() {
  const [birthdays, setBirthdays] = useState([]);

  useEffect(() => {
    axios.get(`${API}/birthdays`).then(r => setBirthdays(r.data)).catch(() => {});
  }, []);

  const today = birthdays.filter(b => b.IsToday);
  const upcoming = birthdays.filter(b => !b.IsToday);

  return (
    <div>
      <h1 className="page-title">Dealership Overview</h1>
      <p className="page-subtitle">Welcome to your Dealership Management System dashboard.</p>

      <div className="grid-2" style={{ marginTop: '24px', gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="card">
          <div style={{ color: 'var(--primary)', marginBottom: '12px' }}>
            <Users size={32} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '700' }}>48</div>
          <div style={{ color: 'var(--text-muted)' }}>Active Employees</div>
        </div>

        <div className="card">
          <div style={{ color: '#10b981', marginBottom: '12px' }}>
            <Building size={32} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '700' }}>1,204</div>
          <div style={{ color: 'var(--text-muted)' }}>Registered Customers</div>
        </div>

        <div className="card">
          <div style={{ color: '#f59e0b', marginBottom: '12px' }}>
            <Activity size={32} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '700' }}>3</div>
          <div style={{ color: 'var(--text-muted)' }}>Active Branches</div>
        </div>
      </div>

      {/* Birthday Widget */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Cake size={22} style={{ color: '#ec4899' }} />
          <h2 className="card-title" style={{ margin: 0 }}>Customer Birthdays</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 4 }}>— next 7 days</span>
        </div>

        {birthdays.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No customer birthdays in the next 7 days.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {today.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ec4899', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>🎂 Today</div>
                {today.map(b => (
                  <div key={b.ProfileID} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: 8, marginBottom: 4 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ec4899', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem' }}>
                      {(b.CustomerName || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{b.CustomerName}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{b.PhoneNo || '—'}</div>
                    </div>
                    <span style={{ background: '#ec4899', color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600 }}>Today 🎉</span>
                  </div>
                ))}
              </div>
            )}
            {upcoming.length > 0 && (
              <div>
                {today.length > 0 && <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Upcoming</div>}
                {upcoming.map(b => {
                  const dobDate = new Date(b.DOB);
                  const label = `${dobDate.toLocaleString('default', { month: 'short' })} ${dobDate.getDate()}`;
                  return (
                    <div key={b.ProfileID} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 12px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f1f5f9', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
                        {(b.CustomerName || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{b.CustomerName}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{b.PhoneNo || '—'}</div>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h2 className="card-title">Getting Started</h2>
        <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
          This system is designed to be completely intuitive. Start by adding your internal company structure (Departments and Branches) via the Settings tab. Then, add your Employees. Once your staff is set up, you can start registering Customers to prepare for the upcoming Workshop and Service modules.
        </p>
      </div>
    </div>
  );
}
