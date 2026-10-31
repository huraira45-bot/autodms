import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { RefreshCw, UserPlus } from 'lucide-react';
import { ErpControlPanel } from '../../components/erp';
import SearchableSelect from '../../components/SearchableSelect';
import { Err } from './VehicleModelsAdmin';

export default function SalesExecutives() {
    const [rows, setRows] = useState([]);
    const [employeeId, setEmployeeId] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const load = async () => {
        setLoading(true); setError('');
        try { setRows((await axios.get('/api/sales/executives/setup')).data); }
        catch (e) { setError(e.response?.data?.error || e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);
    const save = async (id, enabled) => {
        setBusy(true); setError(''); setMessage('');
        try {
            const { data } = await axios.put(`/api/sales/executives/${id}`, { IsEnabled: enabled });
            setEmployeeId(''); setMessage(data.message); await load();
        } catch (e) { setError(e.response?.data?.error || e.message); }
        finally { setBusy(false); }
    };
    const members = rows.filter(r => r.IsEnabled !== null && r.IsEnabled !== undefined);
    const available = rows.filter(r => r.IsAvailable && !r.IsEnabled);
    const shown = members.filter(r => `${r.EmployeeName} ${r.EmployeeNo || ''}`.toLowerCase().includes(search.toLowerCase()));
    return <div style={{ display: 'grid', gap: 16 }}>
        <ErpControlPanel title="Sales Executives" subtitle="Choose which employees can be assigned to vehicle bookings."
            actions={<button className="erp-btn" onClick={load} disabled={loading || busy}><RefreshCw size={14} /> Refresh</button>} />
        {error && <Err>{error}</Err>}
        {message && <div role="status" className="card" style={{ color: '#166534' }}>{message}</div>}
        <div className="card">
            <p style={{ marginTop: 0 }}>Only enabled, active employees appear in New Booking, Historical Booking and Change Executive. Disabling someone preserves their existing bookings and reports.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12 }}>
                <div style={{ flex: '1 1 300px' }}><label>Employee</label>
                    <SearchableSelect value={employeeId} onChange={setEmployeeId} disabled={loading || busy}
                        options={available.map(r => ({ id: r.EmployeeID, label: r.EmployeeName, sub: [r.EmployeeNo, r.DepartmentName, r.DesignationName].filter(Boolean).join(' / ') }))}
                        placeholder={loading ? 'Loading employees...' : 'Choose an employee to enable'} title="Add a sales executive" />
                </div>
                <button className="erp-btn erp-btn-primary" onClick={() => save(employeeId, true)} disabled={!employeeId || busy || loading}>
                    <UserPlus size={14} /> Enable executive
                </button>
            </div>
        </div>
        <div className="card" style={{ overflowX: 'auto' }}>
            <input aria-label="Search configured executives" placeholder="Search configured executives..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: 8, marginBottom: 12 }} />
            <table className="erp-table" style={{ width: '100%' }}>
                <thead><tr><th>Employee</th><th>Department / designation</th><th>Booking selection</th><th>Updated by</th><th>Action</th></tr></thead>
                <tbody>{shown.map(r => <tr key={r.EmployeeID}>
                    <td>{r.EmployeeName}<div className="text-muted">{r.EmployeeNo || `Employee #${r.EmployeeID}`}</div></td>
                    <td>{[r.DepartmentName, r.DesignationName].filter(Boolean).join(' / ') || '-'}</td>
                    <td>{!r.IsAvailable ? 'Unavailable (inactive / resigned)' : r.IsEnabled ? 'Enabled' : 'Disabled'}</td>
                    <td>{r.UpdatedByName || '-'}</td>
                    <td><button className="erp-btn erp-btn-sm" disabled={loading || busy || (!r.IsEnabled && !r.IsAvailable)}
                        onClick={() => save(r.EmployeeID, !r.IsEnabled)}>{r.IsEnabled ? 'Disable' : 'Enable'}</button></td>
                </tr>)}</tbody>
            </table>
            {!shown.length && <p>{loading ? 'Loading...' : members.length ? 'No matching executives.' : 'No sales executives set up yet. Enable an employee above before creating a booking.'}</p>}
        </div>
        <Link to="/sales/bookings">Go to bookings</Link>
    </div>;
}
