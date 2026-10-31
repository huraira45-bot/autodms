import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import SearchableSelect from '../../components/SearchableSelect';
import { useAuth } from '../../context/AuthContext';

export function useSalesExecutives(initialId = '') {
    const [people, setPeople] = useState([]);
    const [id, setId] = useState(initialId || '');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const reload = useCallback(async () => {
        setLoading(true); setError('');
        try { setPeople((await axios.get('/api/sales/executives')).data); }
        catch (e) { setPeople([]); setError(e.response?.data?.error || e.message); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { reload(); }, [reload]);
    const valid = !loading && people.some(p => String(p.EmployeeID) === String(id));
    return { people, id, setId, loading, error, reload, valid };
}

export default function BookingExecutiveField({ choice, disabled = false }) {
    const { user, hasModule } = useAuth();
    const canSetup = Number(user?.groupId) === 1 || hasModule('sales_admin_settings');
    return <div>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Sales executive *</label>
        <SearchableSelect value={choice.id} onChange={choice.setId} disabled={disabled || choice.loading || !choice.people.length}
            options={choice.people.map(p => ({ id: p.EmployeeID, label: p.EmployeeName, sub: p.EmployeeNo || `Employee #${p.EmployeeID}` }))}
            title="Choose a sales executive" placeholder={choice.loading ? 'Loading executives...' : 'Choose an enabled executive'} />
        {choice.error && <div role="alert" style={{ color: '#b91c1c', marginTop: 6 }}>{choice.error}</div>}
        {!choice.loading && !choice.error && !choice.people.length && <div style={{ marginTop: 6 }}>No enabled sales executives. Ask Admin to set up the booking list.</div>}
        {!choice.loading && choice.id && !choice.valid && choice.people.length > 0 && <div style={{ marginTop: 6 }}>Choose an enabled executive from the list.</div>}
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.8rem' }}>
            {canSetup && <Link to="/sales/executives" target="_blank" rel="noreferrer">Set up sales executives</Link>}
            <button type="button" className="erp-btn erp-btn-sm" disabled={disabled || choice.loading} onClick={choice.reload}>Refresh executives</button>
        </div>
    </div>;
}
