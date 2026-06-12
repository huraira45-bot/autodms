import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus } from 'lucide-react';

const API_BASE = '/api';

export default function Settings() {
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [uoms, setUOMs] = useState([]);
  
  const [deptName, setDeptName] = useState('');
  const [desigName, setDesigName] = useState('');
  const [catName, setCatName] = useState('');
  const [uomName, setUomName] = useState('');

  const fetchData = async () => {
    try {
      const [deptRes, desigRes, catRes, uomRes] = await Promise.all([
        axios.get(`${API_BASE}/departments`),
        axios.get(`${API_BASE}/designations`),
        axios.get(`${API_BASE}/inventory-config/categories`),
        axios.get(`${API_BASE}/inventory-config/uoms`)
      ]);
      setDepartments(deptRes.data);
      setDesignations(desigRes.data);
      setCategories(catRes.data);
      setUOMs(uomRes.data);
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddDept = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/departments`, { DepartmentName: deptName, ActionUserID: 1 });
      setDeptName('');
      fetchData();
    } catch (err) { alert('Error adding department: ' + (err.response?.data?.details || err.message)); }
  };

  const handleAddDesig = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/designations`, { DesignationName: desigName, ActionUserID: 1 });
      setDesigName('');
      fetchData();
    } catch (err) { alert('Error adding designation: ' + (err.response?.data?.details || err.message)); }
  };

  const handleAddCat = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/inventory-config/categories`, { CategoryName: catName });
      setCatName('');
      fetchData();
    } catch (err) { alert('Error adding category: ' + err.message); }
  };

  const handleAddUom = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/inventory-config/uoms`, { UOMName: uomName, Scale: 1 });
      setUomName('');
      fetchData();
    } catch (err) { alert('Error adding UOM: ' + err.message); }
  };

  return (
    <div>
      <h1 className="page-title">Master Settings</h1>
      <p className="page-subtitle">Configure organization structure and inventory lookups.</p>

      <div className="grid-2" style={{ marginTop: '24px', gap: '24px' }}>
        
        {/* Departments Column */}
        <div className="card">
          <h2 className="card-title">Departments</h2>
          <form onSubmit={handleAddDept} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input style={{ flex: 1 }} type="text" placeholder="e.g. Sales, Service" value={deptName} onChange={e => setDeptName(e.target.value)} required />
            <button type="submit" className="btn" style={{ padding: '10px' }}><Plus size={18} /></button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {departments.map(d => (
              <li key={d.DepartmentID} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                {d.DepartmentName} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(ID: {d.DepartmentID})</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Designations Column */}
        <div className="card">
          <h2 className="card-title">Job Roles (Designations)</h2>
          <form onSubmit={handleAddDesig} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input style={{ flex: 1 }} type="text" placeholder="e.g. Manager" value={desigName} onChange={e => setDesigName(e.target.value)} required />
            <button type="submit" className="btn" style={{ padding: '10px' }}><Plus size={18} /></button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {designations.map(d => (
              <li key={d.DesignationID} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                {d.DesignationName} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(ID: {d.DesignationID})</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Categories Column */}
        <div className="card">
          <h2 className="card-title">Inventory Categories</h2>
          <form onSubmit={handleAddCat} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input style={{ flex: 1 }} type="text" placeholder="e.g. Vehicles, Lubricants" value={catName} onChange={e => setCatName(e.target.value)} required />
            <button type="submit" className="btn" style={{ padding: '10px' }}><Plus size={18} /></button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {categories.map(c => (
              <li key={c.CategoryID} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                {c.CategoryName} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(ID: {c.CategoryID})</span>
              </li>
            ))}
          </ul>
        </div>

        {/* UOMs Column */}
        <div className="card">
          <h2 className="card-title">Units of Measure (UOM)</h2>
          <form onSubmit={handleAddUom} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input style={{ flex: 1 }} type="text" placeholder="e.g. Liters, Units, Cans" value={uomName} onChange={e => setUomName(e.target.value)} required />
            <button type="submit" className="btn" style={{ padding: '10px' }}><Plus size={18} /></button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {uoms.map(u => (
              <li key={u.UOMId} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                {u.UOMName} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(ID: {u.UOMId})</span>
              </li>
            ))}
          </ul>
        </div>

      </div>
    </div>
  );
}
