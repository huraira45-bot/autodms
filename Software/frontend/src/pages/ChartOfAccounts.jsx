import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, ChevronRight, ChevronDown, Landmark, X, Search, Loader2, Building } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';

const API_BASE = '/api';

const BankToggle = ({ acc }) => {
  const { notify } = useFeedback();
  const [isBank, setIsBank] = useState(!!acc.IsBank);
  const [busy, setBusy] = useState(false);
  const toggle = async (e) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await axios.patch(`${API_BASE}/accounts/banks/${acc.GLCAID}/toggle`);
      setIsBank(res.data.isBank);
      notify({ type: 'success', title: res.data.isBank ? 'Marked as bank account' : 'Bank flag removed', message: acc.GLTitle });
    } catch (err) {
      notify({ type: 'error', title: 'Could not update bank flag', message: err.response?.data?.error || err.message });
    }
    setBusy(false);
  };
  // Only show toggle on leaf-level accounts (where money actually posts)
  if (acc.isParent) return null;
  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={isBank ? 'Currently marked as bank — click to unmark' : 'Mark as bank account'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
        background: isBank ? '#dcfce7' : '#f1f5f9',
        color: isBank ? '#16a34a' : '#94a3b8',
        border: '1px solid ' + (isBank ? '#86efac' : '#e2e8f0'),
        borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.5 : 1
      }}
    >
      <Building size={11} /> {isBank ? 'Bank' : 'Mark Bank'}
    </button>
  );
};

const AccountNode = ({ acc }) => {
  const [children, setChildren] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const canHaveChildren = acc.GLLevel < 5;
    if (!isExpanded && children.length === 0 && canHaveChildren) {
      setLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/accounts/coa?level=${acc.GLLevel + 1}&parentCode=${acc.GLCode.trim()}`);
        setChildren(res.data);
      } catch (err) { console.error(err); }
      setLoading(false);
    }
    setIsExpanded(!isExpanded);
  };

  const canHaveChildren = acc.GLLevel < 5;

  return (
    <div style={{ marginLeft: acc.GLLevel > 1 ? '24px' : '0' }}>
      <div className="coa-row" onClick={toggle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {canHaveChildren ? (
            loading ? <Loader2 size={16} className="animate-spin" /> :
            (isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />)
          ) : <div style={{ width: 16 }} />}
          <span className="coa-code">{acc.GLCode}</span>
          <span className={`coa-title ${acc.GLLevel === 1 ? 'root' : ''}`}>{acc.GLTitle}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BankToggle acc={acc} />
          <div className="coa-badge">{acc.GLNature}</div>
        </div>
      </div>
      {isExpanded && children.map(child => <AccountNode key={child.GLCAID} acc={child} />)}
    </div>
  );
};

export default function ChartOfAccounts() {
  const { notify } = useFeedback();
  const [roots, setRoots] = useState([]);
  const [allParents, setAllParents] = useState([]);
  const [search, setSearch] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loadingParents, setLoadingParents] = useState(false);
  
  const [newAcc, setNewAcc] = useState({ 
    GLTitle: '', GLLevel: 3, GLNature: 'Debit', isParent: false, 
    ParentCode: '', ClassRoot: 1 
  });

  const fetchRoots = async () => {
    try {
      const res = await axios.get(`${API_BASE}/accounts/coa?level=1`);
      setRoots(res.data);
    } catch (err) { console.error(err); }
  };

  // Remote search for parents — searches all levels below target
  const searchParents = useCallback(async (val, level) => {
    if (level <= 1) return;
    setLoadingParents(true);
    try {
      let url = `${API_BASE}/accounts/coa?level=${level}&below=1`;
      if (val) url += `&search=${val}`;
      const res = await axios.get(url);
      setAllParents(res.data);
    } catch (err) { console.error(err); }
    setLoadingParents(false);
  }, []);

  useEffect(() => { fetchRoots(); }, []);

  useEffect(() => {
    if (showModal) {
      searchParents('', newAcc.GLLevel);
      setParentSearch('');
    }
  }, [newAcc.GLLevel, showModal, searchParents]);

  const handleParentSearchChange = (e) => {
    const val = e.target.value;
    setParentSearch(val);
    // Only search if user typed 2+ chars or cleared it
    if (val.length >= 2 || val.length === 0) {
      searchParents(val, newAcc.GLLevel);
    }
  };

  const handleSearch = async (e) => {
    const val = e.target.value;
    setSearch(val);
    if (val.length > 2) {
      try {
        const res = await axios.get(`${API_BASE}/accounts/coa?search=${val}`);
        setSearchResults(res.data);
      } catch (err) { console.error(err); }
    } else {
      setSearchResults(null);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/accounts/coa`, newAcc);
      setShowModal(false);
      setNewAcc({ GLTitle: '', GLLevel: 3, GLNature: 'Debit', isParent: false, ParentCode: '', ClassRoot: 1 });
      notify({ type: 'success', title: 'Account created', message: newAcc.GLTitle });
      fetchRoots();
    } catch (err) {
      notify({ type: 'error', title: 'Could not create account', message: err.response?.data?.error || err.message });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="card-header">
        <div><h1 className="page-title">Chart of Accounts</h1><p className="page-subtitle">Ultra-performance remote filtering for 10k+ entries.</p></div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="search-box">
            <Search size={18} />
            <input type="text" placeholder="Search accounts..." value={search} onChange={handleSearch} />
          </div>
          <button className="btn" onClick={() => setShowModal(true)}><Plus size={18} /> New Account</button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', color: 'var(--primary)' }}>
          <Landmark size={20} />
          <strong>{searchResults ? 'Search Results' : 'Financial Structure Tree'}</strong>
        </div>
        
        <div className="coa-tree-container">
          {searchResults ? (
            searchResults.map(acc => (
              <div key={acc.GLCAID} className="coa-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="coa-code">{acc.GLCode}</span>
                  <span className="coa-title">{acc.GLTitle}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BankToggle acc={acc} />
                  <div className="coa-badge">{acc.GLNature}</div>
                </div>
              </div>
            ))
          ) : (
            roots.length > 0 ? roots.map(root => <AccountNode key={root.GLCAID} acc={root} />) : <p style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No accounts found. Create your first root account!</p>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ width: '450px' }}>
            <div className="modal-header"><h3>Create New Account</h3><button onClick={() => setShowModal(false)}><X size={20} /></button></div>
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
              <div className="form-group"><label>Account Title</label><input type="text" required value={newAcc.GLTitle} onChange={e => setNewAcc({...newAcc, GLTitle: e.target.value})} placeholder="e.g. Petty Cash" /></div>
              
              <div className="grid-2">
                <div className="form-group">
                  <label>Level</label>
                  <select value={newAcc.GLLevel} onChange={e => setNewAcc({...newAcc, GLLevel: parseInt(e.target.value)})}>
                    <option value={1}>1 (Root Class)</option>
                    <option value={2}>2 (Control Account)</option>
                    <option value={3}>3 (Detail Account)</option>
                    <option value={4}>4 (Sub-Detail)</option>
                    <option value={5}>5 (Leaf Account)</option>
                  </select>
                </div>
                <div className="form-group"><label>Nature</label><select value={newAcc.GLNature} onChange={e => setNewAcc({...newAcc, GLNature: e.target.value})}><option value="Debit">Debit</option><option value="Credit">Credit</option></select></div>
              </div>

              {newAcc.GLLevel === 1 ? (
                <div className="form-group">
                  <label>Select Account Class</label>
                  <select value={newAcc.ClassRoot} onChange={e => setNewAcc({...newAcc, ClassRoot: parseInt(e.target.value)})}>
                    <option value={1}>1 - ASSETS</option>
                    <option value={2}>2 - LIABILITIES</option>
                    <option value={3}>3 - EQUITY</option>
                    <option value={4}>4 - REVENUE</option>
                    <option value={5}>5 - EXPENSES</option>
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label>Search & Select Parent {loadingParents && <Loader2 size={12} className="animate-spin" style={{display:'inline'}} />}</label>
                  <div className="parent-search-container">
                    <input type="text" placeholder="Type name or code to search..." value={parentSearch} onChange={handleParentSearchChange} className="parent-search-input" />
                    <select required value={newAcc.ParentCode} onChange={e => setNewAcc({...newAcc, ParentCode: e.target.value})} className="parent-select">
                      <option value="">{loadingParents ? 'Searching...' : 'Select Parent...'}</option>
                      {allParents.map(p => (
                        <option key={p.GLCAID} value={p.GLCode}>{p.GLCode} - {p.GLTitle}</option>
                      ))}
                    </select>
                    {allParents.length === 0 && !loadingParents && parentSearch && <p className="hint-text error">No matches found.</p>}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={newAcc.isParent} onChange={e => setNewAcc({...newAcc, isParent: e.target.checked})} /> <label>This account will have sub-accounts</label></div>
              <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Account Code will be generated automatically based on selection.</p>
              <button className="btn" type="submit" style={{ marginTop: '10px' }} disabled={loadingParents}>Generate & Save Account</button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .coa-tree-container { padding: 10px; background: #f8fafc; border-radius: 8px; min-height: 200px; }
        .coa-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-bottom: 1px solid #e2e8f0; cursor: pointer; transition: all 0.2s; }
        .coa-row:hover { background: #f1f5f9; }
        .coa-code { font-family: monospace; color: #64748b; font-weight: 600; min-width: 80px; }
        .coa-title { font-weight: 500; color: #1e293b; }
        .coa-title.root { font-weight: 700; text-transform: uppercase; color: var(--primary); }
        .coa-badge { font-size: 0.75rem; padding: 2px 8px; background: #e2e8f0; border-radius: 99px; color: #475569; font-weight: 600; }
        .search-box { display: flex; align-items: center; gap: 8px; background: white; padding: 0 12px; border: 1px solid #e2e8f0; border-radius: 8px; height: 42px; width: 300px; }
        .search-box input { border: none; outline: none; flex: 1; font-size: 0.9rem; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
        .modal-header { padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
        
        .parent-search-container { display: flex; flexDirection: column; gap: 8px; }
        .parent-search-input { height: 36px; padding: 0 12px; border: 2px solid var(--primary); border-radius: 6px; font-size: 0.9rem; outline: none; }
        .parent-select { height: 36px; padding: 0 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.9rem; }
        .hint-text { margin: 0; font-size: 0.75rem; color: #94a3b8; font-style: italic; }
        .hint-text.error { color: #ef4444; }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; color: var(--primary); }
      `}</style>
    </div>
  );
}
