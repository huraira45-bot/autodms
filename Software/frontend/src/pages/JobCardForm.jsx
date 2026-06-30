import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { Lock, Unlock, UserCircle, Loader2, Search, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import KYCBanner from '../components/KYCBanner';
import CampaignBox from '../components/CampaignBox';
import { useFeedback } from '../context/FeedbackContext';

const API = '/api/workshop';
const API_BASE = '/api';

const FUEL_LEVELS = ['Empty', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8', 'Full'];
const PM_TYPES = ['None', 'Monthly', 'Quarterly', 'Annual'];
const BRING_BY_TYPES = ['Self', 'Driver', 'Towing', 'Other'];
const TABS = ['General', 'Vehicle Info', 'Job Card Info', 'Spares', 'Sublet Repair', 'Insurance'];

const PRE_DELIVERY = ['Cleanliness', 'Mirror Position', 'Courtesy Item Removal', 'Clock Adjustment'];
const JOB_RESULT_EXP = ['Job Detail Explanation', 'Fee Explanation', 'Result Confirmation With Customer', 'Walk Around Check'];

const S = {
  page: { background: '#e8edf2', minHeight: '100vh', padding: 0, fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 12 },
  titleBar: { background: 'linear-gradient(to bottom, #4a7ebf, #1e4d8c)', color: '#fff', padding: '4px 10px', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 },
  toolbar: { background: '#d4dae5', borderBottom: '1px solid #a0aab8', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  toolBtn: { background: 'linear-gradient(to bottom,#f0f4f8,#d8e0ec)', border: '1px solid #9aaac0', borderRadius: 3, padding: '3px 10px', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Tahoma,Arial,sans-serif', whiteSpace: 'nowrap' },
  toolBtnGreen: { background: 'linear-gradient(to bottom,#7ec87e,#3a8f3a)', color: '#fff', border: '1px solid #2a6f2a', borderRadius: 3, padding: '3px 14px', fontSize: 11, cursor: 'pointer', fontWeight: 700, fontFamily: 'Tahoma,Arial,sans-serif' },
  roBar: { background: '#c8d4e4', borderBottom: '1px solid #9aaac0', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 },
  roLabel: { fontWeight: 700, color: '#1a3a6a' },
  roInput: { border: '1px solid #8090b0', background: '#fff', padding: '2px 6px', width: 80, fontSize: 11, fontFamily: 'Tahoma,Arial,sans-serif' },
  body: { padding: '8px' },
  row: { display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start' },
  groupBox: { border: '1px solid #8090b0', borderRadius: 2, background: '#f0f4f9', marginBottom: 6 },
  groupTitle: { fontSize: 11, fontWeight: 700, color: '#1a3a6a', background: 'transparent', padding: '2px 8px', marginTop: -1, display: 'inline-block' },
  groupBody: { padding: '6px 8px' },
  field: { marginBottom: 4 },
  label: { fontSize: 11, color: '#1a1a1a', display: 'block', marginBottom: 1, fontWeight: 600 },
  input: { width: '100%', border: '1px solid #8090b0', borderRadius: 2, padding: '2px 5px', fontSize: 11, background: '#fff', fontFamily: 'Tahoma,Arial,sans-serif', boxSizing: 'border-box' },
  inputRO: { width: '100%', border: '1px solid #8090b0', borderRadius: 2, padding: '2px 5px', fontSize: 11, background: '#e8f0fe', fontWeight: 700, color: '#1a3a6a', fontFamily: 'Tahoma,Arial,sans-serif', boxSizing: 'border-box' },
  select: { width: '100%', border: '1px solid #8090b0', borderRadius: 2, padding: '2px 4px', fontSize: 11, background: '#fff', fontFamily: 'Tahoma,Arial,sans-serif', boxSizing: 'border-box' },
  tab: (active) => ({ padding: '3px 12px', fontSize: 11, cursor: 'pointer', background: active ? '#fff' : '#c8d4e4', border: '1px solid #9aaac0', borderBottom: active ? '1px solid #fff' : '1px solid #9aaac0', marginRight: 2, borderRadius: '3px 3px 0 0', fontWeight: active ? 700 : 400, color: active ? '#1a3a6a' : '#333', fontFamily: 'Tahoma,Arial,sans-serif' }),
  tabContent: { background: '#fff', border: '1px solid #9aaac0', padding: '8px', borderRadius: '0 3px 3px 3px' },
  chk: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, marginBottom: 2, cursor: 'pointer' },
  billPanel: { background: '#e0e8f4', border: '1px solid #9aaac0', padding: '6px 8px', marginTop: 6 },
  billField: { textAlign: 'center', fontSize: 11 },
  billVal: { border: '1px solid #8090b0', background: '#fff', padding: '2px 4px', textAlign: 'right', fontSize: 11, width: '100%', boxSizing: 'border-box' },
  bottomBar: { background: '#d4dae5', borderTop: '1px solid #a0aab8', padding: '4px 8px', display: 'flex', gap: 6, justifyContent: 'center', marginTop: 6 },
};

export default function JobCardForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasModule, user } = useAuth();
  const { notify, confirm } = useFeedback();
  const isEdit = !!id && id !== 'new';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('General');
  const [kycCleared, setKycCleared] = useState(true);  // true when no flag exists; false if open flags require ack
  const [jobTypes, setJobTypes] = useState([]);
  const [orderTypes, setOrderTypes] = useState([]);
  const [parties, setParties] = useState([]);
  const [banks, setBanks] = useState([]);
  const [allServices, setAllServices] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerVehicles, setCustomerVehicles] = useState([]);
  const [issuedParts, setIssuedParts] = useState([]);
  const [subletItems, setSubletItems] = useState([]);

  // Insurance tab — claim header + per-part depreciation rows + payments
  const [insHeader, setInsHeader] = useState({
    CompanyName: '', SurveyorName: '', SurveyorMobile: '', SurveyorMobile2: '', InsClaimNo: ''
  });
  const [insParts, setInsParts] = useState([]);      // includes TaxRate / TaxAmount / TotalWithTax
  const [insPayments, setInsPayments] = useState([]);
  const [insSaving, setInsSaving] = useState(false);
  const [labourItems, setLabourItems] = useState([]);
  const [careOffs, setCareOffs] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [careOff, setCareOff] = useState(null);
  const [taxRates, setTaxRates] = useState({ GST: 0, PST: 0 });
  const [labourSearch, setLabourSearch] = useState('');
  const [labourResults, setLabourResults] = useState([]);
  const [showLabourDD, setShowLabourDD] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusErr, setStatusErr] = useState('');
  const [accessories, setAccessories] = useState([]);
  const [damageMarks, setDamageMarks] = useState([]);
  const [nav, setNav] = useState({ firstId: null, prevId: null, nextId: null, lastId: null });
  const [empSearch, setEmpSearch] = useState({ checkedBy: '', confirmBy: '' });
  const [empResults, setEmpResults] = useState({ checkedBy: [], confirmBy: [] });
  const [showEmpDD, setShowEmpDD] = useState({ checkedBy: false, confirmBy: false });

  // Finalize state
  const [isFinalized, setIsFinalized] = useState(false);
  const [createdById, setCreatedById] = useState(null);
  const [createdByName, setCreatedByName] = useState('');
  const [finalizedByName, setFinalizedByName] = useState('');
  const [finalizedAt, setFinalizedAt] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [unfinalizeModal, setUnfinalizeModal] = useState(false);
  const [unfinalizeReason, setUnfinalizeReason] = useState('');
  const [unfinalizeBlockers, setUnfinalizeBlockers] = useState(null);

  const [form, setForm] = useState({
    JobCardNo: '', jobCode: '', JobTypeId: '', OrderTypeId: '', PMType: 'None',
    EndUserID: '', VehicleRegNo: '', ChasisNo: '', EngineNo: '', VersionCode: '',
    VehicleCode: '', BatteryNo: '', VehicleColor: '', KiloMeter: '', Millage: '',
    ReceiptDate: new Date().toISOString().slice(0, 16),
    PromisedDate: '', RevisedDelivery: '',
    Remarks: '', PaymentType: 'Cash', PaymentCO: '', PaymentBankID: '', PartyID: '',
    FuelLevel: '1/2', VOCRemarks: '', CustomerType: 'Walk-in',
    ServiceAdvisor: '', ServiceAdvisorID: '', RepeatROID: '', IsEstimatedRO: false, EstimatedRONo: '',
    ApprovedBy: '', JobResult: 'No Fixed', IsFIR: false,
    BringByType: 'Self', BringByName: 'Self', BringByMobile: '',
    DeliveredTo: '', DeliveryMobile: '', DeliveredAt: '',
    DQIRNo: '', CheckedByID: '', CheckedByName: '', ConfirmByID: '', ConfirmByName: '', WACResults: '',
  });
  const [vocChecks, setVocChecks] = useState({});

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const flash = (m, isErr = false) => {
    isErr ? setStatusErr(m) : setStatusMsg(m);
    setTimeout(() => { setStatusMsg(''); setStatusErr(''); }, 3000);
  };
  const disabled = isFinalized;

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [typesRes, partiesRes, itemsRes, otRes, empRes, banksRes, taxRes] = await Promise.all([
          axios.get(`${API}/job-types`),
          axios.get(`${API}/parties?business=WORKSHOP`),
          axios.get(`${API_BASE}/items`),
          axios.get(`${API}/order-types`),
          axios.get(`${API_BASE}/employees`).catch(() => ({ data: [] })),
          axios.get(`${API_BASE}/accounts/banks`).catch(() => ({ data: [] })),
          axios.get(`${API_BASE}/tax-rates`).catch(() => ({ data: { current: [] } }))
        ]);
        setJobTypes(typesRes.data);
        setParties(partiesRes.data);
        setOrderTypes(otRes.data);
        setAllServices(itemsRes.data.filter(i => i.ItemType === 'Service'));
        setAllEmployees(empRes.data || []);
        setBanks(banksRes.data || []);
        const rates = { GST: 0, PST: 0 };
        for (const r of (taxRes.data.current || [])) rates[r.TaxType] = parseFloat(r.Rate);
        setTaxRates(rates);
        if (typesRes.data.length > 0) setForm(p => ({ ...p, JobTypeId: p.JobTypeId || typesRes.data[0].JobCardTypeId }));

        let careOffsList = [];
        try {
          const coRes = await axios.get(`${API_BASE}/care-offs/active`);
          careOffsList = coRes.data;
          setCareOffs(coRes.data);
        } catch (e) { console.error('care-offs load failed:', e.message); }

        try {
          const accRes = await axios.get(`${API_BASE}/accessories/master`);
          if (!isEdit) setAccessories(accRes.data.map(a => ({ ...a, IsChecked: false, Qty: 0 })));
        } catch (e) { console.error('accessories load failed:', e.message); }

        if (isEdit) {
          const jcRes = await axios.get(`${API}/job-cards/${id}`);
          const jc = jcRes.data;
          setForm({
            JobCardNo: jc.JobCardNo || '',
            jobCode: jc.jobCode || '',
            JobTypeId: jc.JobTypeId || '',
            OrderTypeId: jc.OrderTypeId || '',
            PMType: jc.PMType || 'None',
            EndUserID: jc.EndUserID || '',
            VehicleRegNo: jc.VehicleRegNo || '',
            ChasisNo: jc.ChasisNo || '',
            EngineNo: jc.EngineNo || '',
            VersionCode: jc.VersionCode || '',
            VehicleCode: jc.VehicleCode || '',
            BatteryNo: jc.BatteryNo || '',
            VehicleColor: jc.VehicleColor || '',
            KiloMeter: jc.Odometer || '',
            Millage: jc.Millage || '',
            ReceiptDate: jc.ReceiptDate ? new Date(jc.ReceiptDate).toISOString().slice(0, 16) : '',
            PromisedDate: jc.PromisedDate ? new Date(jc.PromisedDate).toISOString().slice(0, 16) : '',
            RevisedDelivery: jc.RevisedDelivery ? new Date(jc.RevisedDelivery).toISOString().slice(0, 16) : '',
            Remarks: jc.Remarks || '',
            PaymentType: jc.PaymentType || 'Cash',
            PaymentCO: jc.PaymentCO || '',
            PaymentBankID: jc.PaymentBankID || '',
            PartyID: jc.PartyID || '',
            FuelLevel: jc.FuelLevel || '1/2',
            VOCRemarks: jc.VOCRemarks || '',
            CustomerType: jc.CustomerType || 'Walk-in',
            ServiceAdvisor: jc.ServiceAdvisor || '',
            ServiceAdvisorID: jc.ServiceAdvisorID || '',
            RepeatROID: jc.RepeatROID || '',
            IsEstimatedRO: !!jc.IsEstimatedRO,
            EstimatedRONo: jc.EstimatedRONo || '',
            ApprovedBy: jc.ApprovedBy || '',
            JobResult: jc.JobResult || 'No Fixed',
            IsFIR: !!jc.IsFIR,
            BringByType: jc.BringByType || 'Self',
            BringByName: jc.BringByName || '',
            BringByMobile: jc.BringByMobile || '',
            DeliveredTo: jc.DeliveredTo || '',
            DeliveryMobile: jc.DeliveryMobile || '',
            DeliveredAt: jc.DeliveredAt ? new Date(jc.DeliveredAt).toISOString().slice(0, 16) : '',
            DQIRNo: jc.DQIRNo || '',
            CheckedByID: jc.CheckedByID || '',
            CheckedByName: jc.CheckedByName || '',
            ConfirmByID: jc.ConfirmByID || '',
            ConfirmByName: jc.ConfirmByName || '',
            WACResults: jc.WACResults || '',
          });
          setSelectedCustomer({ CustomerName: jc.CustomerName, PhoneNo: jc.CustomerPhone, CNIC: jc.CustomerCNIC, Address: jc.CustomerAddress });
          if (jc.LabourItems) setLabourItems(jc.LabourItems.map(l => ({ JobInfoId: l.JobInfoId || null, WorkDescription: l.Remarks || '', Price: l.Price || 0, Discount: l.Discount || 0, DiscType: l.DiscType || null })));
          if (jc.CareOffID) {
            const foundCO = careOffsList.find(c => c.CareOffID === jc.CareOffID);
            setCareOff(foundCO || { CareOffID: jc.CareOffID, EmployeeName: jc.CareOffName || `Care-Off #${jc.CareOffID}`, MaxDiscountPct: 100, IsActive: false });
          }
          if (jc.PartsItems) setIssuedParts(jc.PartsItems);
          if (jc.SubletItems) setSubletItems(jc.SubletItems);
          if (jc.Accessories) setAccessories(jc.Accessories);
          if (jc.DamageMarks) setDamageMarks(jc.DamageMarks);

          // Load insurance header + per-part depreciation grid + payments (non-blocking)
          axios.get(`${API}/job-cards/${id}/insurance`).then(insRes => {
            if (insRes.data?.header) setInsHeader(insRes.data.header);
            if (Array.isArray(insRes.data?.parts)) setInsParts(insRes.data.parts);
            if (Array.isArray(insRes.data?.payments)) setInsPayments(insRes.data.payments);
          }).catch(() => {});
          if (jc.VOCRemarks) { try { setVocChecks(JSON.parse(jc.VOCRemarks)); } catch (e) {} }
          setIsFinalized(!!jc.IsFinalized);
          setCreatedById(jc.CreatedBy || null);
          setCreatedByName(jc.CreatedByName || '');
          setFinalizedByName(jc.FinalizedByName || '');
          setFinalizedAt(jc.FinalizedAt || null);
          try {
            const navRes = await axios.get(`${API}/job-cards/${id}/navigation`);
            setNav(navRes.data);
          } catch (e) { console.error('nav load failed:', e.message); }
        }
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    init();
  }, [id, isEdit]);

  const searchCustomers = useCallback(async (val) => {
    if (val.length < 2) { setCustomers([]); return; }
    try { const res = await axios.get(`${API}/customers?search=${val}`); setCustomers(res.data); } catch {}
  }, []);

  const selectCustomer = async (c) => {
    setSelectedCustomer(c);
    f('EndUserID', c.ProfileID);
    setCustomerSearch(''); setCustomers([]);
    try {
      const res = await axios.get(`${API}/customers/${c.ProfileID}/vehicles`);
      setCustomerVehicles(res.data);
      if (res.data.length === 1) {
        const v = res.data[0];
        setForm(p => ({ ...p, VehicleRegNo: v.RegistrationNo || '', ChasisNo: v.ChasisNo || '', EngineNo: v.EngineNo || '', VersionCode: v.VehicleModel || '' }));
      }
    } catch {}
  };

  const handleLabourSearch = (val) => {
    setLabourSearch(val);
    if (val.length < 1) { setLabourResults([]); setShowLabourDD(false); return; }
    const s = val.toLowerCase();
    const filtered = allServices.filter(sv => sv.ItenName?.toLowerCase().includes(s)).slice(0, 8);
    setLabourResults(filtered);
    setShowLabourDD(true);
  };

  const addServiceAsLabour = (svc) => {
    // Pass the catalog ItemId through as JobInfoId so the saved JC line carries
    // a real FK to the labour service — needed for campaign matching + reports.
    setLabourItems(p => [...p, { JobInfoId: svc.ItemId, WorkDescription: svc.ItenName, Price: parseFloat(svc.ItemSalesPrice || 0), Discount: 0, DiscType: null }]);
    setLabourSearch(''); setLabourResults([]); setShowLabourDD(false);
  };

  const searchEmployees = (field, val) => {
    setEmpSearch(p => ({ ...p, [field]: val }));
    if (!val) {
      f(field === 'checkedBy' ? 'CheckedByName' : 'ConfirmByName', '');
      f(field === 'checkedBy' ? 'CheckedByID'   : 'ConfirmByID',   '');
    }
    if (val.length < 2) { setEmpResults(p => ({ ...p, [field]: [] })); setShowEmpDD(p => ({ ...p, [field]: false })); return; }
    const s = val.toLowerCase();
    const filtered = allEmployees.filter(e => e.EmployeeName?.toLowerCase().includes(s)).slice(0, 8);
    setEmpResults(p => ({ ...p, [field]: filtered }));
    setShowEmpDD(p => ({ ...p, [field]: filtered.length > 0 }));
  };

  const selectEmployee = (field, emp) => {
    const nameKey = field === 'checkedBy' ? 'CheckedByName' : 'ConfirmByName';
    const idKey   = field === 'checkedBy' ? 'CheckedByID'   : 'ConfirmByID';
    f(nameKey, emp.EmployeeName || '');
    f(idKey,   emp.EmployeeID   || '');
    setEmpSearch(p => ({ ...p, [field]: emp.EmployeeName || '' }));
    setEmpResults(p => ({ ...p, [field]: [] }));
    setShowEmpDD(p => ({ ...p, [field]: false }));
  };

  const handleDiagramClick = (e) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = +((e.clientX - rect.left) / rect.width  * 100).toFixed(3);
    const y = +((e.clientY - rect.top)  / rect.height * 100).toFixed(3);
    setDamageMarks(prev => [...prev, { XPct: x, YPct: y, Note: '' }]);
  };


  const handleCareOffChange = (newCareOff) => {
    if (!newCareOff) {
      setCareOff(null);
      setLabourItems(p => p.map(i => ({ ...i, Discount: 0, DiscType: null })));
      return;
    }
    const currentTotal = +labourItems.reduce((s, i) => {
      const price = Number(i.Price) || 0;
      const disc = Number(i.Discount) || 0;
      if (!i.DiscType || disc === 0 || price === 0) return s;
      return s + (i.DiscType === 'Percent' ? +(price * disc / 100).toFixed(3) : +Math.min(disc, price).toFixed(3));
    }, 0).toFixed(2);
    const newMax = +(totalLabour * (newCareOff.MaxDiscountPct / 100)).toFixed(2);
    if (currentTotal > newMax + 0.005) {
      flash(`Cannot assign ${newCareOff.EmployeeName}: existing discounts (PKR ${currentTotal}) exceed their cap (PKR ${newMax}). Clear discounts first.`, true);
      return;
    }
    setCareOff(newCareOff);
  };

  const handleDiscountChange = (idx, newVal) => {
    const discType = labourItems[idx].DiscType || 'Percent';
    const newItems = labourItems.map((it, j) => j === idx ? { ...it, Discount: newVal, DiscType: discType } : it);
    const newTotal = +newItems.reduce((s, i) => s + computeDiscAmt(i), 0).toFixed(2);
    const curMax = +(totalLabour * (careOff.MaxDiscountPct / 100)).toFixed(2);
    if (newTotal > curMax + 0.005) { flash(`Cap exceeded. Max: PKR ${curMax.toLocaleString()}`, true); return; }
    setLabourItems(newItems);
  };

  const handleDiscTypeToggle = (idx) => {
    const newType = labourItems[idx].DiscType === 'Amount' ? 'Percent' : 'Amount';
    const newItems = labourItems.map((it, j) => j === idx ? { ...it, DiscType: newType } : it);
    const newTotal = +newItems.reduce((s, i) => s + computeDiscAmt(i), 0).toFixed(2);
    const curMax = +(totalLabour * (careOff.MaxDiscountPct / 100)).toFixed(2);
    if (newTotal > curMax + 0.005) { flash(`Switching to ${newType} would exceed cap (max PKR ${curMax.toLocaleString()}).`, true); return; }
    setLabourItems(newItems);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.EndUserID) { flash('Please select a customer.', true); return; }
    if (!form.jobCode) { flash('Job Number is required.', true); return; }
    if (!kycCleared) { flash('Please acknowledge the KYC flag(s) on this chassis before saving.', true); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        LabourItems: labourItems,
        Accessories: accessories,
        DamageMarks: damageMarks,
        VOCRemarks: JSON.stringify(vocChecks),
        CareOffID: careOff?.CareOffID || null,
        CareOffName: careOff?.EmployeeName || null,
      };
      if (isEdit) {
        payload.JobCardId = parseInt(id);
        await axios.post(`${API}/job-cards`, payload);
        flash('Job Card updated successfully.');
      } else {
        const res = await axios.post(`${API}/job-cards`, payload);
        navigate(`/workshop/jobs/${res.data.JobCardId}`, { replace: true });
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      if (err.response?.status === 423) flash(msg, true);
      else flash(msg, true);
    } finally { setSaving(false); }
  };

  // Insurance tab — update a single row's % and recompute Dep Amount on the
  // GST-inclusive total (server does the same calc authoritatively on save).
  // Rows are keyed by (LineType, LineRefID) so Parts and Services don't collide.
  const updateInsRow = (lineType, refId, pctStr) => {
    setInsParts(prev => prev.map(p => {
      if (p.LineType !== lineType || p.LineRefID !== refId) return p;
      const pct = Math.max(0, Math.min(100, Number(pctStr) || 0));
      const basis = Number(p.TotalAmount || 0) + Number(p.TaxAmount || 0);
      const depAmt = +(basis * pct / 100).toFixed(2);
      return { ...p, DepreciationPct: pct, DepAmount: depAmt };
    }));
  };

  const totalDepAmount = insParts.reduce((s, p) => s + (Number(p.DepAmount) || 0), 0);
  const totalDepPaid   = insPayments.reduce((s, p) => s + (Number(p.PaidAmount) || 0), 0);
  const totalDepBalance = +(totalDepAmount - totalDepPaid).toFixed(2);

  const saveInsurance = async () => {
    if (!isEdit) { flash('Save the job card once first, then enter insurance info.', true); return; }
    setInsSaving(true);
    try {
      const payload = {
        header: insHeader,
        parts: insParts.map(p => ({
          LineType: p.LineType,
          LineRefID: p.LineRefID,
          DepreciationPct: Number(p.DepreciationPct) || 0
        }))
      };
      const r = await axios.post(`${API}/job-cards/${id}/insurance`, payload);
      flash(`Insurance info saved. Depreciation total: PKR ${Number(r.data.depreciationTotal || 0).toLocaleString()}`);
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      flash(msg, true);
    } finally { setInsSaving(false); }
  };

  const handleFinalize = async () => {
    const ok = await confirm({
      title: 'Finalize this Job Card?',
      message: 'This will lock the job card for editing and post the related workshop accounting entries.',
      details: 'Finalized job cards can only be reopened through the unfinalize approval workflow.',
      confirmLabel: 'Finalize Job Card',
      tone: 'warning',
    });
    if (!ok) return;
    setFinalizing(true);
    try {
      await axios.post(`/api/finalize/JOBCARD/${id}`);
      setIsFinalized(true);
      flash('Job Card finalized.');
      notify({ type: 'success', title: 'Job Card finalized', message: 'The job card is now locked and posted.' });
    } catch (e) {
      const text = e.response?.data?.error || 'Error';
      flash(text, true);
      notify({ type: 'error', title: 'Finalize failed', message: text });
    }
    finally { setFinalizing(false); }
  };

  const openUnfinalizeModal = async () => {
    setUnfinalizeModal(true);
    setUnfinalizeBlockers(null);
    try {
      const r = await axios.get(`/api/finalize/JOBCARD/${id}/downstream-refs`);
      setUnfinalizeBlockers(r.data.blockers || []);
    } catch { setUnfinalizeBlockers([]); }
  };

  const handleRequestUnfinalize = async () => {
    if (!unfinalizeReason.trim()) {
      notify({ type: 'warning', title: 'Reason required', message: 'Explain why this job card needs to be reopened.' });
      return;
    }
    try {
      await axios.post(`/api/finalize/JOBCARD/${id}/request-unfinalize`, { reason: unfinalizeReason });
      setUnfinalizeModal(false); setUnfinalizeReason(''); setUnfinalizeBlockers(null);
      flash('Unfinalize request submitted.');
      notify({ type: 'success', title: 'Request submitted', message: 'Job Card unfinalize request was sent for approval.' });
    } catch (e) {
      const data = e.response?.data;
      if (data?.blockers?.length) {
        setUnfinalizeBlockers(data.blockers);
        notify({ type: 'error', title: 'Request blocked', message: 'Downstream references must be cleared first.' });
      }
      else {
        const text = data?.error || 'Error';
        flash(text, true);
        notify({ type: 'error', title: 'Request failed', message: text });
      }
    }
  };

  const totalLabour = labourItems.reduce((s, i) => s + parseFloat(i.Price || 0), 0);
  const totalParts = issuedParts.reduce((s, p) => s + (parseFloat(p.IssueQuantity || 0) * parseFloat(p.ItemRate || 0)), 0);
  // Sublet revenue = PayableAmount (what we charge customer). InvoiceAmount is our cost to vendor.
  const totalSublet = subletItems.reduce((s, sl) => s + parseFloat(sl.PayableAmount || sl.InvoiceAmount || 0), 0);
  const grandTotal = totalLabour + totalParts + totalSublet;
  const computeDiscAmt = (item) => {
    const price = Number(item.Price) || 0;
    const disc = Number(item.Discount) || 0;
    if (!item.DiscType || disc === 0 || price === 0) return 0;
    if (item.DiscType === 'Percent') return +(price * disc / 100).toFixed(3);
    return +Math.min(disc, price).toFixed(3);
  };
  const totalDiscountUsed = +labourItems.reduce((s, i) => s + computeDiscAmt(i), 0).toFixed(2);
  const maxDiscountAllowed = careOff ? +(totalLabour * (careOff.MaxDiscountPct / 100)).toFixed(2) : 0;

  // Tax per §14.4 — calculated on NET amount (discount before tax):
  //   PST = (labour - discount + sublet) × PST rate / 100
  //   GST = parts × GST rate / 100
  const pstRate = parseFloat(taxRates.PST) || 0;
  const gstRate = parseFloat(taxRates.GST) || 0;
  const totalPST = +(((totalLabour - totalDiscountUsed) + totalSublet) * pstRate / 100).toFixed(2);
  const totalGST = +(totalParts * gstRate / 100).toFixed(2);
  const totalTax = totalPST + totalGST;
  const totalPayable = +(grandTotal - totalDiscountUsed + totalTax).toFixed(2);
  const capOver = !!careOff && totalDiscountUsed > maxDiscountAllowed + 0.005;

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} /></div>;

  const canFinalize = !isFinalized && hasModule('finalize') && (user?.userId === createdById || hasModule('admin_unfinalize'));

  return (
    <div style={S.page}>
      {/* Title bar */}
      <div style={S.titleBar}>
        🔧 Service → Repair Order Information
        {isFinalized && <span style={{ marginLeft: 12, background: '#f59e0b', color: '#fff', borderRadius: 3, padding: '1px 8px', fontSize: 11 }}>FINALIZED</span>}
      </div>

      {/* Toolbar */}
      <div style={S.toolbar} className="no-print">
        <button style={{ ...S.toolBtn, opacity: nav.firstId ? 1 : 0.4 }} onClick={() => nav.firstId && navigate(`/workshop/jobs/${nav.firstId}`)} title="First"><ChevronFirst size={14} /></button>
        <button style={{ ...S.toolBtn, opacity: nav.prevId ? 1 : 0.4 }} onClick={() => nav.prevId && navigate(`/workshop/jobs/${nav.prevId}`)} title="Previous"><ChevronLeft size={14} /></button>
        <button style={{ ...S.toolBtn, opacity: nav.nextId ? 1 : 0.4 }} onClick={() => nav.nextId && navigate(`/workshop/jobs/${nav.nextId}`)} title="Next"><ChevronRight size={14} /></button>
        <button style={{ ...S.toolBtn, opacity: nav.lastId ? 1 : 0.4 }} onClick={() => nav.lastId && navigate(`/workshop/jobs/${nav.lastId}`)} title="Last"><ChevronLast size={14} /></button>
        <div style={{ width: 1, background: '#9aaac0', height: 20, margin: '0 4px' }} />
        <button style={S.toolBtn} onClick={() => navigate('/workshop/jobs/new')}>📄 New</button>
        {!disabled && <button style={S.toolBtn} onClick={handleSubmit} disabled={saving}>💾 {saving ? 'Saving…' : 'Save'}</button>}
        <button style={S.toolBtn} onClick={() => navigate('/workshop/jobs')}>✖ Close</button>
        <div style={{ width: 1, background: '#9aaac0', height: 20, margin: '0 4px' }} />
        {isEdit && (
          <button
            style={{ ...S.toolBtn, color: '#0f766e', borderColor: '#0f766e',
                     opacity: isFinalized ? 1 : 0.4, cursor: isFinalized ? 'pointer' : 'not-allowed' }}
            disabled={!isFinalized}
            title={isFinalized ? 'Open Work Order print view' : 'Finalize the Job Card before printing'}
            onClick={() => isFinalized && window.open(`/workshop/jobs/${id}/print`, '_blank')}>
            <Printer size={12} /> Print
          </button>
        )}
        {canFinalize && (
          <button style={{ ...S.toolBtnGreen, background: 'linear-gradient(to bottom,#4a9f4a,#256025)' }} onClick={handleFinalize} disabled={finalizing}>
            <Lock size={12} /> {finalizing ? 'Finalizing…' : 'Finalize'}
          </button>
        )}
        {isFinalized && (
          <button style={{ ...S.toolBtn, color: '#d97706', borderColor: '#d97706' }} onClick={openUnfinalizeModal}>
            <Unlock size={12} /> Request Unfinalize
          </button>
        )}
      </div>

      {/* Print-only header */}
      <div className="print-only print-header">
        <h1>Repair Order — {form.JobCardNo || '(draft)'}</h1>
        <div className="meta">
          <span>Status: {isFinalized ? 'Finalized' : 'Active'}{createdByName ? `  •  Created by ${createdByName}` : ''}</span>
          <span>Printed: {new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
      </div>

      {/* RO + Job No bar */}
      <div style={S.roBar}>
        <span style={S.roLabel}>RO NO:</span>
        <input style={{ ...S.roInput, width: 100, background: '#e8f0fe', fontWeight: 700 }} value={form.JobCardNo || '(auto)'} readOnly />
        <span style={S.roLabel}>Job NO:</span>
        <input style={{ ...S.roInput, width: 80 }} value={form.jobCode} onChange={e => !isEdit && f('jobCode', e.target.value)} readOnly={isEdit || disabled} placeholder="e.g. 28931" />
        {createdByName && <span style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#2a5a8a', fontSize: 11 }}><UserCircle size={12} /> Created: <strong>{createdByName}</strong></span>}
        {isFinalized && finalizedByName && <span style={{ color: '#92400e', fontSize: 11 }}>| Finalized by: <strong>{finalizedByName}</strong>{finalizedAt ? ` on ${new Date(finalizedAt).toLocaleDateString()}` : ''}</span>}
      </div>

      {statusMsg && <div style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', fontSize: 11 }}>{statusMsg}</div>}
      {statusErr && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '4px 10px', fontSize: 11 }}>{statusErr}</div>}
      {capOver && <div style={{ background: '#fef9c3', color: '#854d0e', padding: '4px 10px', fontSize: 11, borderBottom: '1px solid #fde68a' }}>⚠ Discount cap exceeded: PKR {totalDiscountUsed.toLocaleString()} used, max PKR {maxDiscountAllowed.toLocaleString()}. Reduce discounts before saving.</div>}

      <form onSubmit={handleSubmit}>
        <div style={S.body}>
        <fieldset disabled={disabled} style={{ border: 'none', padding: 0, margin: 0 }}>

          {/* KYC banner — shown when the entered chassis has any open flag; must be acknowledged before save */}
          <KYCBanner chasisNo={form.ChasisNo} jobCardId={isEdit ? form.JobCardId : null} onAcknowledgedChange={setKycCleared} />

          {/* Campaign attachment — appears once JC is saved. We use the route
              param `id` directly because `form.JobCardId` isn't populated by
              the edit-mode setForm() above. */}
          <CampaignBox type="jobcard" id={isEdit ? parseInt(id) : null}
                       grossAmount={grandTotal}
                       labourGross={totalLabour}
                       partsGross={totalParts}
                       taxAmount={totalTax} />

          {/* Top row: Business Unit | Order Type | PM Type | Date In | RO Status | Promise Date | Service Advisor | Repeat RO */}
          <div style={{ ...S.groupBox }}>
            <div style={S.groupBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr', gap: 6 }}>
                <div style={S.field}>
                  <label style={S.label}>Business Unit</label>
                  <select style={S.select} value={form.JobTypeId} onChange={e => f('JobTypeId', e.target.value)} disabled={isEdit || disabled} required>
                    <option value="">Select...</option>
                    {jobTypes.map(t => <option key={t.JobCardTypeId} value={t.JobCardTypeId}>{t.Title} ({t.CardCode})</option>)}
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Order Type</label>
                  <select style={S.select} value={form.OrderTypeId} onChange={e => f('OrderTypeId', e.target.value)}>
                    <option value="">Select...</option>
                    {orderTypes.map(o => <option key={o.OrderTypeId} value={o.OrderTypeId}>{o.OrderTypeName}</option>)}
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>PM Type</label>
                  <select style={S.select} value={form.PMType} onChange={e => f('PMType', e.target.value)}>
                    {PM_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Date In</label>
                  <input style={S.input} type="datetime-local" value={form.ReceiptDate} onChange={e => f('ReceiptDate', e.target.value)} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>RO Status</label>
                  <input style={{ ...S.input, background: '#e8edf2' }} value={['Open','In Progress','Ready','Invoiced','Closed'][form.JobStatus || 0] || 'Open'} readOnly />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Promise Date</label>
                  <input style={S.input} type="datetime-local" value={form.PromisedDate} onChange={e => f('PromisedDate', e.target.value)} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Service Advisor</label>
                  <select
                    style={S.select}
                    value={form.ServiceAdvisorID || ''}
                    onChange={e => {
                      const selectedId = e.target.value;
                      const picked = allEmployees.find(emp => String(emp.EmployeeID) === selectedId);
                      f('ServiceAdvisorID', selectedId);
                      f('ServiceAdvisor', picked ? picked.EmployeeName : '');
                    }}
                    disabled={disabled}
                  >
                    <option value="">— Select advisor —</option>
                    {allEmployees.map(emp => (
                      <option key={emp.EmployeeID} value={emp.EmployeeID}>{emp.EmployeeName}</option>
                    ))}
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Repeat R.O.ID</label>
                  <input style={S.input} type="number" value={form.RepeatROID} onChange={e => f('RepeatROID', e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle + Customer + Right panel */}
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 220px', gap: 6 }}>

            {/* Vehicle Information */}
            <div style={S.groupBox}>
              <div style={{ padding: '2px 8px', background: '#c0cce0', borderBottom: '1px solid #9aaac0', fontSize: 11, fontWeight: 700, color: '#1a3a6a' }}>Vehicle Information</div>
              <div style={S.groupBody}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <div style={S.field}>
                    <label style={S.label}>Reg.#</label>
                    <input style={{ ...S.input, fontWeight: 700, color: '#1a3a6a', fontSize: 13 }} value={form.VehicleRegNo} onChange={e => f('VehicleRegNo', e.target.value)} />
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Battery #</label>
                    <input style={S.input} value={form.BatteryNo} onChange={e => f('BatteryNo', e.target.value)} />
                  </div>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Engine #</label>
                  <input style={S.input} value={form.EngineNo} onChange={e => f('EngineNo', e.target.value)} />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Chassis #</label>
                  <input style={S.input} value={form.ChasisNo} onChange={e => f('ChasisNo', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px', gap: 4 }}>
                  <div style={S.field}>
                    <label style={S.label}>Vehicle Type / Model</label>
                    <input style={S.input} value={form.VersionCode} onChange={e => f('VersionCode', e.target.value)} placeholder="e.g. KARVAAN PLUS 1.2" />
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Year</label>
                    <input style={S.input} value={form.VehicleCode} onChange={e => f('VehicleCode', e.target.value)} placeholder="2025" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <div style={S.field}>
                    <label style={S.label}>Color</label>
                    <input style={S.input} value={form.VehicleColor} onChange={e => f('VehicleColor', e.target.value)} placeholder="Color" />
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Variant</label>
                    <input style={S.input} value={form.VehicleCode} onChange={e => f('VehicleCode', e.target.value)} placeholder="e.g. SC-6406" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <div style={S.field}>
                    <label style={S.label}>Od Meter</label>
                    <input style={S.input} type="number" value={form.KiloMeter} onChange={e => f('KiloMeter', e.target.value)} />
                  </div>
                  <div style={S.field}>
                    <label style={S.label}>Millage</label>
                    <input style={S.input} type="number" value={form.Millage} onChange={e => f('Millage', e.target.value)} />
                  </div>
                </div>
                {/* Vehicle selector for new cards */}
                {!isEdit && customerVehicles.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <label style={{ ...S.label, color: '#1a6a3a' }}>Select Saved Vehicle</label>
                    <select style={S.select} value={form.VehicleRegNo} onChange={e => {
                      const v = customerVehicles.find(cv => cv.RegistrationNo === e.target.value);
                      if (v) setForm(p => ({ ...p, VehicleRegNo: v.RegistrationNo || '', ChasisNo: v.ChasisNo || '', EngineNo: v.EngineNo || '', VersionCode: v.VehicleModel || '' }));
                    }}>
                      <option value="">-- Choose --</option>
                      {customerVehicles.map(v => <option key={v.VehicleID} value={v.RegistrationNo}>{v.RegistrationNo} - {v.BrandName} {v.VehicleModel}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Customer */}
            <div style={S.groupBox}>
              <div style={{ padding: '2px 8px', background: '#c0cce0', borderBottom: '1px solid #9aaac0', fontSize: 11, fontWeight: 700, color: '#1a3a6a' }}>Customer</div>
              <div style={S.groupBody}>
                {selectedCustomer ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 4, marginBottom: 4 }}>
                      <div style={S.field}>
                        <label style={S.label}>ID</label>
                        <input style={{ ...S.input, background: '#e8edf2' }} value={form.EndUserID} readOnly />
                      </div>
                      <div style={S.field}>
                        <label style={S.label}>Customer Name</label>
                        <input style={{ ...S.input, fontWeight: 700 }} value={selectedCustomer.CustomerName} readOnly />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      <div style={S.field}><label style={S.label}>Mobile 1</label><input style={S.input} value={selectedCustomer.PhoneNo || ''} readOnly /></div>
                      <div style={S.field}><label style={S.label}>Mobile 2</label><input style={S.input} value='' readOnly /></div>
                      <div style={S.field}><label style={S.label}>CNIC No</label><input style={S.input} value={selectedCustomer.CNIC || ''} readOnly /></div>
                      <div style={S.field}><label style={S.label}>Phone</label><input style={S.input} value={selectedCustomer.PhoneNo || ''} readOnly /></div>
                    </div>
                    <div style={S.field}><label style={S.label}>Address</label><input style={S.input} value={selectedCustomer.Address || ''} readOnly /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 4, marginTop: 4 }}>
                      <div>
                        {/* Payment */}
                        <label style={S.label}>Payment Mode</label>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                          {['Cash', 'Credit', 'POS', 'Bank Transfer'].map(pt => (
                            <label key={pt} style={{ ...S.chk, cursor: disabled ? 'default' : 'pointer' }}>
                              <input type="radio" name="payType" value={pt} checked={form.PaymentType === pt} onChange={() => !disabled && f('PaymentType', pt)} /> {pt === 'POS' ? 'POS CLEAR' : pt}
                            </label>
                          ))}
                        </div>
                        {form.PaymentType === 'Credit' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 4, marginTop: 4 }}>
                            <div style={S.field}>
                              <label style={S.label}>Party *</label>
                              <select style={S.select} value={form.PartyID} onChange={e => f('PartyID', e.target.value)} required>
                                <option value="">Select Party...</option>
                                {parties.map(p => <option key={p.PartyID} value={p.PartyID}>{p.PartyName}</option>)}
                              </select>
                            </div>
                            <div style={S.field}>
                              <label style={S.label}>C/O</label>
                              <input style={S.input} value={form.PaymentCO} onChange={e => f('PaymentCO', e.target.value)} placeholder="C/O..." />
                            </div>
                          </div>
                        )}
                        {form.PaymentType === 'Bank Transfer' && (
                          <div style={{ marginTop: 4 }}>
                            <div style={S.field}>
                              <label style={S.label}>Bank Account *</label>
                              <select style={S.select} value={form.PaymentBankID} onChange={e => f('PaymentBankID', e.target.value)} required>
                                <option value="">Select Bank...</option>
                                {banks.map(b => <option key={b.GLCAID} value={b.GLCAID}>{b.GLCode} — {b.GLTitle}</option>)}
                              </select>
                              {banks.length === 0 && (
                                <span style={{ fontSize: 10, color: '#a16207', marginTop: 2, display: 'block' }}>
                                  No banks configured. Mark accounts as banks in Chart of Accounts.
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={S.field}>
                        <label style={S.label}>Customer Type</label>
                        <select style={S.select} value={form.CustomerType} onChange={e => f('CustomerType', e.target.value)}>
                          <option value="Walk-in">Walk-in</option>
                          <option value="Individual">Individual</option>
                          <option value="Corporate">Corporate</option>
                          <option value="Insurance">Insurance</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {!isEdit && !disabled && <button type="button" onClick={() => { setSelectedCustomer(null); f('EndUserID', ''); }} style={{ ...S.toolBtn, fontSize: 10 }}>Change Customer</button>}
                      <button type="button" onClick={() => navigate('/workshop/customers')} style={{ ...S.toolBtn, fontSize: 10, color: '#2563eb' }}>✏ Edit Customer</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <label style={S.label}>Search Customer (min 2 chars)</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #3b82f6', borderRadius: 2, background: '#fff', padding: '0 6px', height: 24 }}>
                      <Search size={13} style={{ color: '#3b82f6', flexShrink: 0 }} />
                      <input style={{ border: 'none', outline: 'none', flex: 1, fontSize: 11, fontFamily: 'Tahoma,Arial,sans-serif', paddingLeft: 4 }}
                        value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); searchCustomers(e.target.value); }}
                        placeholder="Name, phone, or reg no..." autoFocus />
                    </div>
                    {customers.length > 0 && (
                      <div style={{ position: 'absolute', left: 0, right: 0, background: '#fff', border: '1px solid #9aaac0', zIndex: 20, maxHeight: 160, overflow: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                        {customers.map(c => (
                          <div key={c.ProfileID} onClick={() => selectCustomer(c)} style={{ padding: '4px 8px', cursor: 'pointer', borderBottom: '1px solid #f0f4f8', fontSize: 11 }}
                            onMouseEnter={e => e.currentTarget.style.background = '#e8f0fe'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                            <strong>{c.CustomerName}</strong> — {c.PhoneNo} <span style={{ color: '#3b82f6', fontFamily: 'monospace' }}>{c.RegistrationNo}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel: Appointment + Estimation + Dates */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={S.groupBox}>
                <div style={{ padding: '2px 8px', background: '#c0cce0', borderBottom: '1px solid #9aaac0', fontSize: 11, fontWeight: 700, color: '#1a3a6a' }}>Appointment Customer</div>
                <div style={{ ...S.groupBody, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <label style={S.chk}><input type="checkbox" checked={form.IsEstimatedRO} onChange={e => f('IsEstimatedRO', e.target.checked)} /> Is Estimated RO</label>
                  <div style={S.field}><label style={S.label}>Estimated RO No.</label><input style={S.input} value={form.EstimatedRONo} onChange={e => f('EstimatedRONo', e.target.value)} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3 }}>
                    <div style={S.billField}><div style={{ fontSize: 10, color: '#64748b' }}>Parts</div><div style={S.billVal}>{totalParts.toLocaleString()}</div></div>
                    <div style={S.billField}><div style={{ fontSize: 10, color: '#64748b' }}>Labour</div><div style={S.billVal}>{totalLabour.toLocaleString()}</div></div>
                    <div style={S.billField}><div style={{ fontSize: 10, color: '#64748b' }}>Total</div><div style={{ ...S.billVal, fontWeight: 700 }}>{grandTotal.toLocaleString()}</div></div>
                  </div>
                </div>
              </div>
              <div style={S.groupBox}>
                <div style={S.groupBody}>
                  <div style={S.field}><label style={S.label}>Approved By</label><input style={S.input} value={form.ApprovedBy} onChange={e => f('ApprovedBy', e.target.value)} /></div>
                  <div style={S.field}><label style={S.label}>Revised Delivery</label><input style={S.input} type="datetime-local" value={form.RevisedDelivery} onChange={e => f('RevisedDelivery', e.target.value)} /></div>
                </div>
              </div>
              <div style={S.groupBox}>
                <div style={{ padding: '2px 8px', background: '#d4e4c0', borderBottom: '1px solid #9aaac0', fontSize: 11, fontWeight: 700, color: '#1a4a1a' }}>Care-Off / Discount Auth</div>
                <div style={S.groupBody}>
                  <div style={S.field}>
                    <label style={S.label}>Authorize Discount</label>
                    <select style={S.select} value={careOff?.CareOffID || ''}
                      onChange={e => {
                        const sel = careOffs.find(c => c.CareOffID === parseInt(e.target.value));
                        handleCareOffChange(sel || null);
                      }}>
                      <option value="">None (no discount)</option>
                      {careOff && careOff.IsActive === false && (
                        <option value={careOff.CareOffID} disabled style={{ color: '#b91c1c' }}>{careOff.EmployeeName} (inactive)</option>
                      )}
                      {careOffs.map(c => <option key={c.CareOffID} value={c.CareOffID}>{c.EmployeeName} ({c.MaxDiscountPct}%)</option>)}
                    </select>
                    {careOff && careOff.IsActive === false && (
                      <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 2 }}>⚠ Care-Off is inactive — assign an active one</div>
                    )}
                    {careOff && careOff.IsActive !== false && (
                      <div style={{ fontSize: 10, color: '#1d4ed8', marginTop: 2 }}>Cap: PKR {maxDiscountAllowed.toLocaleString()} on current labour</div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>

          </fieldset>

          {/* Tabs — navigation buttons rendered OUTSIDE the disabled fieldset
              so they remain clickable when the JC is finalized. Each tab's
              content opens its own fieldset below. */}
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex' }}>
              {TABS.map(t => <button key={t} type="button" style={S.tab(activeTab === t)} onClick={() => setActiveTab(t)}>{t}</button>)}
            </div>
            <div style={S.tabContent}>
            <fieldset disabled={disabled} style={{ border: 'none', padding: 0, margin: 0 }}>

              {/* General Tab */}
              {activeTab === 'General' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a6a', marginBottom: 4, borderBottom: '1px solid #c8d4e4', paddingBottom: 2 }}>Pre Delivery Confirmation</div>
                    {PRE_DELIVERY.map(item => (
                      <label key={item} style={S.chk}>
                        <input type="checkbox" checked={!!vocChecks[item]} onChange={e => !disabled && setVocChecks(p => ({ ...p, [item]: e.target.checked }))} />
                        {item}
                      </label>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a6a', marginBottom: 4, borderBottom: '1px solid #c8d4e4', paddingBottom: 2 }}>Job Result Explanation</div>
                    {JOB_RESULT_EXP.map(item => (
                      <label key={item} style={S.chk}>
                        <input type="checkbox" checked={!!vocChecks[item]} onChange={e => !disabled && setVocChecks(p => ({ ...p, [item]: e.target.checked }))} />
                        {item}
                      </label>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a6a', marginBottom: 4, borderBottom: '1px solid #c8d4e4', paddingBottom: 2 }}>Job Result</div>
                    {['Fixed', 'Level Up', 'No Fixed', 'PSFU Plan'].map(jr => (
                      <label key={jr} style={S.chk}>
                        <input type="radio" name="jobResult" value={jr} checked={form.JobResult === jr} onChange={() => !disabled && f('JobResult', jr)} />
                        {jr}
                      </label>
                    ))}
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a6a', marginTop: 8, marginBottom: 4, borderBottom: '1px solid #c8d4e4', paddingBottom: 2 }}>FIR or Non FIR</div>
                    <label style={S.chk}><input type="radio" name="fir" checked={form.IsFIR} onChange={() => !disabled && f('IsFIR', true)} /> FIR</label>
                    <label style={S.chk}><input type="radio" name="fir" checked={!form.IsFIR} onChange={() => !disabled && f('IsFIR', false)} /> Non FIR</label>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a6a', marginBottom: 4, borderBottom: '1px solid #c8d4e4', paddingBottom: 2 }}>Bring By</div>
                    <div style={S.field}><label style={S.label}>Bring By Type</label>
                      <select style={S.select} value={form.BringByType} onChange={e => f('BringByType', e.target.value)}>
                        {BRING_BY_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div style={S.field}><label style={S.label}>Bring By Name</label><input style={S.input} value={form.BringByName} onChange={e => f('BringByName', e.target.value)} /></div>
                    <div style={S.field}><label style={S.label}>Bring By Mobile</label><input style={S.input} value={form.BringByMobile} onChange={e => f('BringByMobile', e.target.value)} /></div>
                  </div>

                  {/* R.O Finalization row */}
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #c8d4e4', paddingTop: 6, marginTop: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a6a', marginBottom: 4 }}>R.O Finalization</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                      <div style={S.field}><label style={S.label}>Delivered To</label><input style={S.input} value={form.DeliveredTo} onChange={e => f('DeliveredTo', e.target.value)} /></div>
                      <div style={S.field}><label style={S.label}>Mobile #</label><input style={S.input} value={form.DeliveryMobile} onChange={e => f('DeliveryMobile', e.target.value)} /></div>
                      <div style={S.field}><label style={S.label}>Delivered At</label><input style={S.input} type="datetime-local" value={form.DeliveredAt} onChange={e => f('DeliveredAt', e.target.value)} /></div>
                      <div style={S.field}><label style={S.label}>Date Out</label><input style={S.input} type="datetime-local" value={form.DeliveredAt} onChange={e => f('DeliveredAt', e.target.value)} /></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Vehicle Info Tab */}
              {activeTab === 'Vehicle Info' && (
                <div>
                  {/* 3-column main area */}
                  <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr 200px', gap: 8 }}>

                    {/* Left: VOC + Fuel */}
                    <div style={S.groupBox}>
                      <div style={{ padding: '2px 8px', background: '#c0cce0', borderBottom: '1px solid #9aaac0', fontSize: 11, fontWeight: 700, color: '#1a3a6a' }}>Voice of Customer</div>
                      <div style={{ ...S.groupBody, padding: '4px 8px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#1a3a6a', marginBottom: 2, borderBottom: '1px solid #c8d4e4', paddingBottom: 1 }}>Pre Delivery Confirmation</div>
                        {PRE_DELIVERY.map(item => (
                          <label key={item} style={{ ...S.chk, fontSize: 10 }}>
                            <input type="checkbox" checked={!!vocChecks[item]} onChange={e => !disabled && setVocChecks(p => ({ ...p, [item]: e.target.checked }))} />
                            {item}
                          </label>
                        ))}
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#1a3a6a', marginTop: 5, marginBottom: 2, borderBottom: '1px solid #c8d4e4', paddingBottom: 1 }}>Job Result Explanation</div>
                        {JOB_RESULT_EXP.map(item => (
                          <label key={item} style={{ ...S.chk, fontSize: 10 }}>
                            <input type="checkbox" checked={!!vocChecks[item]} onChange={e => !disabled && setVocChecks(p => ({ ...p, [item]: e.target.checked }))} />
                            {item}
                          </label>
                        ))}
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#1a3a6a', marginTop: 5, marginBottom: 2 }}>Fuel Level</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                          {FUEL_LEVELS.map(level => (
                            <button key={level} type="button" onClick={() => !disabled && f('FuelLevel', level)}
                              style={{ padding: '2px 6px', borderRadius: 8, border: form.FuelLevel === level ? '2px solid #1a3a6a' : '1px solid #9aaac0', background: form.FuelLevel === level ? '#1a3a6a' : '#f0f4f9', color: form.FuelLevel === level ? '#fff' : '#333', fontSize: 10, cursor: disabled ? 'default' : 'pointer', fontWeight: form.FuelLevel === level ? 700 : 400 }}>
                              {level}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Center: Car Damage Diagram */}
                    <div style={S.groupBox}>
                      <div style={{ padding: '2px 8px', background: '#c0cce0', borderBottom: '1px solid #9aaac0', fontSize: 11, fontWeight: 700, color: '#1a3a6a', display: 'flex', justifyContent: 'space-between' }}>
                        Vehicle Damage Diagram
                        <span style={{ fontSize: 10, fontWeight: 400, color: '#64748b' }}>{disabled ? '' : 'Click on car to mark damage'}</span>
                      </div>
                      <div style={{ ...S.groupBody, display: 'flex', gap: 8 }}>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <svg viewBox="0 0 200 380" style={{ width: 130, display: 'block', border: '1px solid #c8d4e4', borderRadius: 4, background: '#f8fafc', cursor: disabled ? 'default' : 'crosshair' }}
                            onClick={handleDiagramClick}>
                            {/* Body */}
                            <rect x="38" y="65" width="124" height="250" rx="14" fill="#d1d5db" stroke="#6b7280" strokeWidth="2"/>
                            {/* Hood */}
                            <path d="M55,65 L145,65 L155,28 L45,28 Z" fill="#c4c9d4" stroke="#6b7280" strokeWidth="1.5"/>
                            {/* Front bumper */}
                            <rect x="48" y="14" width="104" height="16" rx="5" fill="#6b7280"/>
                            {/* Front windshield */}
                            <path d="M55,120 L145,120 L148,92 L52,92 Z" fill="#bfdbfe" stroke="#9ca3af" strokeWidth="1"/>
                            {/* Cabin top */}
                            <rect x="44" y="120" width="112" height="120" rx="3" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="1"/>
                            {/* Door divider */}
                            <line x1="44" y1="180" x2="156" y2="180" stroke="#9ca3af" strokeWidth="1" strokeDasharray="3,2"/>
                            {/* Rear windshield */}
                            <path d="M55,240 L145,240 L148,265 L52,265 Z" fill="#bfdbfe" stroke="#9ca3af" strokeWidth="1"/>
                            {/* Trunk */}
                            <path d="M38,265 L162,265 L155,310 L45,310 Z" fill="#c4c9d4" stroke="#6b7280" strokeWidth="1.5"/>
                            {/* Rear bumper */}
                            <rect x="48" y="350" width="104" height="16" rx="5" fill="#6b7280"/>
                            {/* FL wheel */}
                            <rect x="10" y="80" width="26" height="58" rx="8" fill="#1f2937"/>
                            {/* FR wheel */}
                            <rect x="164" y="80" width="26" height="58" rx="8" fill="#1f2937"/>
                            {/* RL wheel */}
                            <rect x="10" y="245" width="26" height="58" rx="8" fill="#1f2937"/>
                            {/* RR wheel */}
                            <rect x="164" y="245" width="26" height="58" rx="8" fill="#1f2937"/>
                            {/* Damage markers */}
                            {damageMarks.map((mark, idx) => {
                              const cx = mark.XPct / 100 * 200;
                              const cy = mark.YPct / 100 * 380;
                              return (
                                <g key={idx}>
                                  <circle cx={cx} cy={cy} r={7} fill="#ef4444" opacity={0.85}/>
                                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="7" fontWeight="700">{idx + 1}</text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#1a3a6a', marginBottom: 3 }}>WAC Results</div>
                          <textarea style={{ ...S.input, height: 60, resize: 'vertical', fontSize: 10 }} value={form.WACResults || ''} onChange={e => f('WACResults', e.target.value)} placeholder="Inspection notes..." />
                          {damageMarks.length > 0 && (
                            <div style={{ marginTop: 4 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', marginBottom: 2 }}>Damage Points</div>
                              {damageMarks.map((mark, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: 2 }}>
                                  <span style={{ background: '#ef4444', color: '#fff', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 9, flexShrink: 0 }}>{idx + 1}</span>
                                  <input style={{ ...S.input, fontSize: 10 }} placeholder="Note..." value={mark.Note || ''} onChange={e => {
                                    const updated = [...damageMarks];
                                    updated[idx] = { ...updated[idx], Note: e.target.value };
                                    setDamageMarks(updated);
                                  }} />
                                  {!disabled && <button type="button" onClick={() => setDamageMarks(p => p.filter((_, j) => j !== idx))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>}
                                </div>
                              ))}
                            </div>
                          )}
                          {!disabled && damageMarks.length === 0 && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>No marks. Click the car diagram to add damage points.</div>}
                        </div>
                      </div>
                    </div>

                    {/* Right: Accessories */}
                    <div style={S.groupBox}>
                      <div style={{ padding: '2px 8px', background: '#c0cce0', borderBottom: '1px solid #9aaac0', fontSize: 11, fontWeight: 700, color: '#1a3a6a' }}>Accessories</div>
                      <div style={{ ...S.groupBody, padding: '4px 8px', maxHeight: 260, overflowY: 'auto' }}>
                        {accessories.length === 0 && <div style={{ fontSize: 10, color: '#94a3b8' }}>No accessories configured.</div>}
                        {accessories.map((acc, idx) => (
                          <div key={acc.AccessoryID} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, fontSize: 10 }}>
                            <input type="checkbox" checked={!!acc.IsChecked} onChange={e => {
                              const updated = [...accessories];
                              updated[idx] = { ...updated[idx], IsChecked: e.target.checked };
                              setAccessories(updated);
                            }} disabled={disabled} />
                            <span style={{ flex: 1 }}>{acc.Title}</span>
                            <input type="number" min="0" value={acc.Qty || 0}
                              style={{ ...S.input, width: 38, textAlign: 'right', fontSize: 10, padding: '1px 3px' }}
                              onChange={e => {
                                const updated = [...accessories];
                                updated[idx] = { ...updated[idx], Qty: parseInt(e.target.value) || 0 };
                                setAccessories(updated);
                              }}
                              disabled={disabled} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Bottom: Other Information */}
                  <div style={{ ...S.groupBox, marginTop: 8 }}>
                    <div style={{ padding: '2px 8px', background: '#c0cce0', borderBottom: '1px solid #9aaac0', fontSize: 11, fontWeight: 700, color: '#1a3a6a' }}>Other Information</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '6px 8px' }}>
                      <div style={S.field}>
                        <label style={S.label}>DQIR No</label>
                        <input style={S.input} value={form.DQIRNo || ''} onChange={e => f('DQIRNo', e.target.value)} placeholder="DQIR number..." />
                      </div>
                      {/* Checked By picker */}
                      <div style={S.field}>
                        <label style={S.label}>Checked By</label>
                        <div style={{ position: 'relative' }}>
                          <input style={S.input} value={empSearch.checkedBy || form.CheckedByName}
                            onChange={e => searchEmployees('checkedBy', e.target.value)}
                            onFocus={() => { if (form.CheckedByName) setEmpSearch(p => ({ ...p, checkedBy: form.CheckedByName })); }}
                            onBlur={() => setTimeout(() => setShowEmpDD(p => ({ ...p, checkedBy: false })), 150)}
                            placeholder="Search employee..." />
                          {showEmpDD.checkedBy && empResults.checkedBy.length > 0 && (
                            <div style={{ position: 'absolute', left: 0, right: 0, background: '#fff', border: '1px solid #9aaac0', zIndex: 20, maxHeight: 120, overflow: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: 11 }}>
                              {empResults.checkedBy.map(emp => (
                                <div key={emp.EmployeeID} onMouseDown={() => selectEmployee('checkedBy', emp)}
                                  style={{ padding: '3px 8px', cursor: 'pointer', borderBottom: '1px solid #f0f4f8' }}
                                  onMouseEnter={e => e.currentTarget.style.background='#e8f0fe'}
                                  onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                  {emp.EmployeeName}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Confirm By picker */}
                      <div style={S.field}>
                        <label style={S.label}>Confirmed By</label>
                        <div style={{ position: 'relative' }}>
                          <input style={S.input} value={empSearch.confirmBy || form.ConfirmByName}
                            onChange={e => searchEmployees('confirmBy', e.target.value)}
                            onFocus={() => { if (form.ConfirmByName) setEmpSearch(p => ({ ...p, confirmBy: form.ConfirmByName })); }}
                            onBlur={() => setTimeout(() => setShowEmpDD(p => ({ ...p, confirmBy: false })), 150)}
                            placeholder="Search employee..." />
                          {showEmpDD.confirmBy && empResults.confirmBy.length > 0 && (
                            <div style={{ position: 'absolute', left: 0, right: 0, background: '#fff', border: '1px solid #9aaac0', zIndex: 20, maxHeight: 120, overflow: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: 11 }}>
                              {empResults.confirmBy.map(emp => (
                                <div key={emp.EmployeeID} onMouseDown={() => selectEmployee('confirmBy', emp)}
                                  style={{ padding: '3px 8px', cursor: 'pointer', borderBottom: '1px solid #f0f4f8' }}
                                  onMouseEnter={e => e.currentTarget.style.background='#e8f0fe'}
                                  onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                  {emp.EmployeeName}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Job Card Info Tab */}
              {activeTab === 'Job Card Info' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={S.field}><label style={S.label}>Complaints / Remarks</label>
                    <textarea style={{ ...S.input, height: 80, resize: 'vertical' }} value={form.Remarks} onChange={e => f('Remarks', e.target.value)} placeholder="Describe customer complaints..." />
                  </div>
                  <div>
                    <div style={S.field}><label style={S.label}>Repeat R.O. ID</label><input style={S.input} type="number" value={form.RepeatROID} onChange={e => f('RepeatROID', e.target.value)} placeholder="0" /></div>
                    <div style={S.field}><label style={S.label}>Approved By</label><input style={S.input} value={form.ApprovedBy} onChange={e => f('ApprovedBy', e.target.value)} /></div>
                  </div>

                  {/* Labour */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a6a', marginBottom: 4, borderBottom: '1px solid #c8d4e4', paddingBottom: 2 }}>Labour / Services</div>
                    {!disabled && (
                      <div style={{ position: 'relative', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #3b82f6', borderRadius: 2, background: '#f0f9ff', padding: '0 6px', height: 24 }}>
                          <Search size={13} style={{ color: '#3b82f6' }} />
                          <input style={{ border: 'none', outline: 'none', flex: 1, fontSize: 11, paddingLeft: 4, background: 'transparent' }}
                            value={labourSearch} onChange={e => handleLabourSearch(e.target.value)}
                            onFocus={() => labourSearch.length >= 1 && setShowLabourDD(true)}
                            placeholder="Search saved services..." />
                        </div>
                        {showLabourDD && (
                          <div style={{ position: 'absolute', left: 0, right: 0, background: '#fff', border: '1px solid #9aaac0', zIndex: 20, maxHeight: 160, overflow: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                            {labourResults.map(svc => (
                              <div key={svc.ItemId} onClick={() => addServiceAsLabour(svc)}
                                style={{ padding: '3px 8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: 11, borderBottom: '1px solid #f0f4f8' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#e8f0fe'}
                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                <span>{svc.ItenName}</span>
                                <span style={{ fontWeight: 700, color: '#1a3a6a' }}>PKR {parseFloat(svc.ItemSalesPrice || 0).toLocaleString()}</span>
                              </div>
                            ))}
                            {labourResults.length === 0 && (
                              <div style={{ padding: '6px 8px', fontSize: 11, color: '#94a3b8' }}>
                                No match — add services via <strong>Labour &amp; Services</strong> in the sidebar.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead><tr style={{ background: '#e8edf2' }}>
                        <th style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #c8d4e4' }}>Service Description</th>
                        <th style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #c8d4e4', width: 100 }}>Amount (PKR)</th>
                        {careOff && <th style={{ padding: '4px 8px', textAlign: 'center', border: '1px solid #c8d4e4', width: 130 }}>Discount</th>}
                        {careOff && <th style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #c8d4e4', width: 90 }}>Payable (PKR)</th>}
                        <th style={{ padding: '4px 8px', border: '1px solid #c8d4e4', width: 30 }}></th>
                      </tr></thead>
                      <tbody>
                        {labourItems.map((item, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #e8edf2' }}>
                            <td style={{ padding: '3px 8px', border: '1px solid #e8edf2' }}>{item.WorkDescription}</td>
                            <td style={{ padding: '3px 8px', border: '1px solid #e8edf2', textAlign: 'right', fontWeight: 700, color: '#1a3a6a' }}>
                              {parseFloat(item.Price || 0).toLocaleString()}
                            </td>
                            {careOff && (
                              <td style={{ padding: '3px 4px', border: '1px solid #e8edf2', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
                                  <input type="number" min="0" value={item.Discount || 0}
                                    onChange={e => !disabled && handleDiscountChange(i, parseFloat(e.target.value) || 0)}
                                    style={{ border: '1px solid #c8d4e4', padding: '2px 4px', width: 55, textAlign: 'right', fontSize: 11 }} />
                                  <button type="button" onClick={() => !disabled && handleDiscTypeToggle(i)}
                                    style={{ fontSize: 10, padding: '2px 5px', background: item.DiscType === 'Amount' ? '#fef3c7' : '#dbeafe', border: '1px solid #9aaac0', borderRadius: 2, cursor: disabled ? 'default' : 'pointer', fontWeight: 700, minWidth: 26 }}>
                                    {item.DiscType === 'Amount' ? 'Rs' : '%'}
                                  </button>
                                </div>
                              </td>
                            )}
                            {careOff && (
                              <td style={{ padding: '3px 8px', border: '1px solid #e8edf2', textAlign: 'right', fontWeight: 700, color: '#166534' }}>
                                {(parseFloat(item.Price || 0) - computeDiscAmt(item)).toLocaleString()}
                              </td>
                            )}
                            <td style={{ padding: '3px 8px', border: '1px solid #e8edf2', textAlign: 'center' }}>
                              {!disabled && <button type="button" onClick={() => setLabourItems(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>×</button>}
                            </td>
                          </tr>
                        ))}
                        {labourItems.length === 0 && <tr><td colSpan={careOff ? 5 : 3} style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>No labour items. Search above to add.</td></tr>}
                      </tbody>
                    </table>
                    {careOff ? (
                      <div style={{ marginTop: 4, padding: '4px 8px', background: capOver ? '#fee2e2' : '#f0fdf4', border: `1px solid ${capOver ? '#fca5a5' : '#86efac'}`, borderRadius: 3, fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span><strong>{careOff.EmployeeName}</strong> — max {careOff.MaxDiscountPct}% on labour</span>
                        <span style={{ color: capOver ? '#b91c1c' : '#166534', fontWeight: 700 }}>
                          Disc used: PKR {totalDiscountUsed.toLocaleString()} / Max: PKR {maxDiscountAllowed.toLocaleString()}
                        </span>
                      </div>
                    ) : labourItems.length > 0 && !disabled && (
                      <div style={{ marginTop: 4, padding: '4px 8px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 3, fontSize: 11, color: '#854d0e' }}>
                        To apply discounts, select a Care-Off in the <strong>Care-Off / Discount Auth</strong> panel on the right.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Spares Tab */}
              {activeTab === 'Spares' && (
                <div>
                  {issuedParts.length === 0
                    ? <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>No parts issued. Use "Parts Issue (Job Card)" from the sidebar to issue parts.</div>
                    : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead><tr style={{ background: '#e8edf2' }}>
                          {['Part Name', 'Number', 'Issue #', 'Qty', 'Rate', 'Total'].map(h => <th key={h} style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #c8d4e4' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>{issuedParts.map((p, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #e8edf2' }}>
                            <td style={{ padding: '3px 8px' }}><strong>{p.ItemName}</strong></td>
                            <td style={{ padding: '3px 8px', fontFamily: 'monospace' }}>{p.ItemNumber}</td>
                            <td style={{ padding: '3px 8px', fontFamily: 'monospace' }}>#{p.IssueNo}</td>
                            <td style={{ padding: '3px 8px', textAlign: 'right' }}>{p.IssueQuantity}</td>
                            <td style={{ padding: '3px 8px', textAlign: 'right' }}>{parseFloat(p.ItemRate || 0).toLocaleString()}</td>
                            <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 700 }}>{(parseFloat(p.IssueQuantity || 0) * parseFloat(p.ItemRate || 0)).toLocaleString()}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                  }
                </div>
              )}

              {/* Sublet Repair Tab */}
              {activeTab === 'Sublet Repair' && (
                <div>
                  {subletItems.length === 0
                    ? <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>No sublet repairs. Use "Sublet Repairs" from the sidebar.</div>
                    : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead><tr style={{ background: '#e8edf2' }}>
                          {['Description', 'Invoice Amt', 'Payable Amt', 'Date'].map(h => <th key={h} style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #c8d4e4' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>{subletItems.map((s, i) => (
                          <tr key={i}>
                            <td style={{ padding: '3px 8px' }}>{s.Remarks}</td>
                            <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 700 }}>{parseFloat(s.InvoiceAmount || 0).toLocaleString()}</td>
                            <td style={{ padding: '3px 8px', textAlign: 'right' }}>{parseFloat(s.PayableAmount || 0).toLocaleString()}</td>
                            <td style={{ padding: '3px 8px' }}>{s.SubletJobDate ? new Date(s.SubletJobDate).toLocaleDateString() : '—'}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                  }
                </div>
              )}

              {activeTab === 'Insurance' && (
                <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 10 }}>
                  {/* Left panel — Insurance Info */}
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 4, padding: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7c2d12', marginBottom: 6 }}>Insurance Info</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={S.field}>
                        <label style={S.label}>Company Name</label>
                        <input style={S.input} value={insHeader.CompanyName || ''}
                          onChange={e => setInsHeader(h => ({ ...h, CompanyName: e.target.value }))}
                          disabled={disabled} />
                      </div>
                      <div style={S.field}>
                        <label style={S.label}>Surveyor Name</label>
                        <input style={S.input} value={insHeader.SurveyorName || ''}
                          onChange={e => setInsHeader(h => ({ ...h, SurveyorName: e.target.value }))}
                          disabled={disabled} />
                      </div>
                      <div style={S.field}>
                        <label style={S.label}>Surveyor Mobile</label>
                        <input style={S.input} value={insHeader.SurveyorMobile || ''}
                          onChange={e => setInsHeader(h => ({ ...h, SurveyorMobile: e.target.value }))}
                          disabled={disabled} />
                      </div>
                      <div style={S.field}>
                        <label style={S.label}>Surveyor Mobile 2</label>
                        <input style={S.input} value={insHeader.SurveyorMobile2 || ''}
                          onChange={e => setInsHeader(h => ({ ...h, SurveyorMobile2: e.target.value }))}
                          disabled={disabled} />
                      </div>
                      <div style={S.field}>
                        <label style={S.label}>Ins. Claim #</label>
                        <input style={S.input} value={insHeader.InsClaimNo || ''}
                          onChange={e => setInsHeader(h => ({ ...h, InsClaimNo: e.target.value }))}
                          disabled={disabled} />
                      </div>
                      <div style={{ ...S.field, marginTop: 6, paddingTop: 6, borderTop: '1px solid #fed7aa' }}>
                        <label style={{ ...S.label, fontWeight: 700, color: '#7c2d12' }}>Depreciation total Amount</label>
                        <div style={{ ...S.billVal, fontWeight: 700, color: '#7c2d12', background: '#ffedd5', textAlign: 'right', padding: '4px 8px' }}>
                          {totalDepAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <button type="button" onClick={saveInsurance}
                        disabled={disabled || insSaving || !isEdit}
                        style={{ ...S.toolBtn, marginTop: 6, justifyContent: 'center', background: insSaving ? '#cbd5e1' : '#15803d', color: 'white', borderColor: '#15803d' }}>
                        💾 {insSaving ? 'Saving…' : 'Save Insurance Info'}
                      </button>
                      {!isEdit && (
                        <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 2 }}>
                          Save the Job Card first, then this tab unlocks.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right panel — Per-part depreciation grid + payments */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {insParts.length === 0 ? (
                      <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 11, border: '1px solid #c8d4e4', borderRadius: 4 }}>
                        No parts or services on this Job Card yet. Add parts via Parts Issue and services on the Job Card Info tab, then come back here.
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr style={{ background: '#e8edf2' }}>
                            {['Type', 'Item number', 'Description', 'Qty', 'Rate', 'Total', 'GST', 'Total+GST', 'Dep %', 'Dep Amount'].map(h => (
                              <th key={h} style={{ padding: '4px 8px', textAlign: h === 'Description' || h === 'Item number' || h === 'Type' ? 'left' : 'right', border: '1px solid #c8d4e4' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {insParts.map(p => {
                            const basis = Number(p.TotalAmount || 0) + Number(p.TaxAmount || 0);
                            const isService = p.LineType === 'Service';
                            return (
                              <tr key={`${p.LineType}-${p.LineRefID}`}>
                                <td style={{ padding: '3px 8px', border: '1px solid #e2e8f0', fontWeight: 600, color: isService ? '#0e7490' : '#1f2937' }}>{p.LineType}</td>
                                <td style={{ padding: '3px 8px', border: '1px solid #e2e8f0', fontFamily: 'monospace' }}>{p.ItemNumber || '—'}</td>
                                <td style={{ padding: '3px 8px', border: '1px solid #e2e8f0' }}>{p.ItemName || '—'}</td>
                                <td style={{ padding: '3px 8px', textAlign: 'right', border: '1px solid #e2e8f0' }}>{Number(p.Qty).toLocaleString()}</td>
                                <td style={{ padding: '3px 8px', textAlign: 'right', border: '1px solid #e2e8f0' }}>{Number(p.Rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td style={{ padding: '3px 8px', textAlign: 'right', border: '1px solid #e2e8f0' }}>{Number(p.TotalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td style={{ padding: '3px 8px', textAlign: 'right', border: '1px solid #e2e8f0', color: '#1d4ed8' }}>{Number(p.TaxAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td style={{ padding: '3px 8px', textAlign: 'right', border: '1px solid #e2e8f0', fontWeight: 600 }}>{basis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td style={{ padding: '2px 4px', border: '1px solid #e2e8f0', textAlign: 'right' }}>
                                  <input type="number" step="0.01" min="0" max="100"
                                    value={p.DepreciationPct}
                                    onChange={e => updateInsRow(p.LineType, p.LineRefID, e.target.value)}
                                    disabled={disabled}
                                    style={{ width: 60, textAlign: 'right', padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: 2, fontSize: 11, background: disabled ? '#f1f5f9' : '#fff7ed' }} />
                                </td>
                                <td style={{ padding: '3px 8px', textAlign: 'right', border: '1px solid #e2e8f0', fontWeight: 700, color: '#7c2d12', background: '#ffedd5' }}>{Number(p.DepAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#fffbeb', fontWeight: 700 }}>
                            <td colSpan={5} style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #c8d4e4' }}>Totals</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #c8d4e4' }}>{insParts.reduce((s, p) => s + Number(p.TotalAmount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #c8d4e4', color: '#1d4ed8' }}>{insParts.reduce((s, p) => s + Number(p.TaxAmount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #c8d4e4' }}>{insParts.reduce((s, p) => s + Number(p.TotalAmount || 0) + Number(p.TaxAmount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #c8d4e4' }}></td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #c8d4e4', color: '#7c2d12' }}>{totalDepAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        </tfoot>
                      </table>
                    )}

                    {/* Depreciation Payments — read-only summary. Recording is done from
                        Cashier ▸ Receive Payment ▸ "JC Insurance Depreciation" mode,
                        only after the Job Card has been finalized. */}
                    {isEdit && (
                      <div style={{ border: '1px solid #c8d4e4', borderRadius: 4, padding: 8, background: '#fafbfc' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a6a' }}>Depreciation Payments (read-only)</div>
                          <div style={{ fontSize: 10, color: '#475569' }}>
                            Total: <strong style={{ color: '#7c2d12' }}>PKR {totalDepAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                            {'  '}·{'  '}Paid: <strong style={{ color: '#15803d' }}>PKR {totalDepPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                            {'  '}·{'  '}Balance: <strong style={{ color: totalDepBalance > 0.005 ? '#b91c1c' : '#15803d' }}>PKR {totalDepBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', padding: '6px 10px', borderRadius: 4, marginBottom: 8 }}>
                          To receive depreciation payment, go to <strong>Cashier ▸ Receive Payment</strong> and choose <strong>"JC Insurance Depreciation"</strong> mode. The Job Card must be <strong>finalized</strong> first.
                        </div>
                        {insPayments.length === 0 ? (
                          <div style={{ padding: 10, textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>No depreciation payments yet.</div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead><tr style={{ background: '#e8edf2' }}>
                              {['Date', 'Mode', 'Reference', 'Amount', 'Received By'].map(h => (
                                <th key={h} style={{ padding: '3px 8px', textAlign: h === 'Amount' ? 'right' : 'left', border: '1px solid #c8d4e4' }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>{insPayments.map(p => (
                              <tr key={p.DepPaymentID}>
                                <td style={{ padding: '3px 8px', border: '1px solid #e2e8f0', fontSize: 10 }}>{new Date(p.ReceivedAt).toLocaleString()}</td>
                                <td style={{ padding: '3px 8px', border: '1px solid #e2e8f0' }}>{p.PaymentMode}</td>
                                <td style={{ padding: '3px 8px', border: '1px solid #e2e8f0', fontSize: 10 }}>{p.ReferenceNo || '—'}</td>
                                <td style={{ padding: '3px 8px', textAlign: 'right', border: '1px solid #e2e8f0', fontWeight: 700, color: '#15803d' }}>{Number(p.PaidAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td style={{ padding: '3px 8px', border: '1px solid #e2e8f0', fontSize: 10, color: '#64748b' }}>{p.ReceivedByName || '—'}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </fieldset>
            </div>
          </div>

          {/* Bill Details */}
          <div style={S.billPanel}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a6a', marginBottom: 4 }}>Bill Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr) 80px 80px', gap: 4, alignItems: 'end' }}>
              {[
                ['Labour', totalLabour],
                ['Sublet Repair', totalSublet],
                ['Spare', totalParts],
                ['Paint Amount', 0],
                ['Total Amount', grandTotal],
                ['Total Disc.', totalDiscountUsed],
                [`PST ${pstRate}%`, totalPST],
                [`GST ${gstRate}%`, totalGST],
                ['Total Payable', totalPayable],
              ].map(([lbl, val]) => (
                <div key={lbl} style={S.billField}>
                  <div style={{ fontSize: 10, color: '#475569', marginBottom: 1 }}>{lbl}</div>
                  <div style={{
                    ...S.billVal,
                    fontWeight: lbl === 'Total Amount' || lbl === 'Total Payable' ? 700 : 400,
                    background: lbl === 'Total Amount' ? '#fff8e1' : (lbl === 'Total Payable' ? '#e8f5e9' : '#fff'),
                    color: (typeof lbl === 'string' && lbl.startsWith('PST')) ? '#a21caf' : (typeof lbl === 'string' && lbl.startsWith('GST')) ? '#1d4ed8' : '#1e293b'
                  }}>
                    {typeof val === 'number' ? val.toLocaleString() : val}
                  </div>
                </div>
              ))}
              <button type="button" style={{ ...S.toolBtn, fontSize: 10, justifyContent: 'center' }}>PST Print</button>
              <button type="button" style={{ ...S.toolBtn, fontSize: 10, justifyContent: 'center' }}>GST Print</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginTop: 4 }}>
              {(() => {
                const balance = +(totalPayable - totalDepPaid).toFixed(2);
                const rows = [
                  ['Advance', 0],
                  ['Payable', totalPayable],
                  ['Dep. Paid', totalDepPaid, '#7c2d12'],
                  ['Post Recovery', 0],
                  ['Balance', balance, '#15803d'],
                ];
                return rows.map(([lbl, val, color]) => (
                  <div key={lbl} style={S.billField}>
                    <div style={{ fontSize: 10, color: '#475569', marginBottom: 1 }}>{lbl}</div>
                    <div style={{ ...S.billVal, color: color || '#1e293b', fontWeight: lbl === 'Balance' || lbl === 'Dep. Paid' ? 700 : 400 }}>
                      {typeof val === 'number' ? val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : val}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>

        {/* Bottom action bar */}
        <div style={S.bottomBar}>
          <button type="button" style={{ ...S.toolBtn, opacity: nav.firstId ? 1 : 0.4 }} onClick={() => nav.firstId && navigate(`/workshop/jobs/${nav.firstId}`)}>First</button>
          <button type="button" style={{ ...S.toolBtn, opacity: nav.prevId ? 1 : 0.4 }} onClick={() => nav.prevId && navigate(`/workshop/jobs/${nav.prevId}`)}>Previous</button>
          <button type="button" style={{ ...S.toolBtn, opacity: nav.nextId ? 1 : 0.4 }} onClick={() => nav.nextId && navigate(`/workshop/jobs/${nav.nextId}`)}>Next</button>
          <button type="button" style={{ ...S.toolBtn, opacity: nav.lastId ? 1 : 0.4 }} onClick={() => nav.lastId && navigate(`/workshop/jobs/${nav.lastId}`)}>Last</button>
          <div style={{ width: 1, background: '#9aaac0', height: 20, margin: '0 4px' }} />
          {!disabled && <button type="submit" style={S.toolBtn} disabled={saving}>💾 {saving ? 'Saving…' : 'Save'}</button>}
          <button type="button" style={S.toolBtn}>🖨 Print</button>
          <button type="button" style={S.toolBtn} onClick={() => navigate('/workshop/jobs')}>🔍 Search</button>
          <button type="button" style={S.toolBtn} onClick={() => navigate('/workshop/jobs')}>✖ Close</button>
          {canFinalize && (
            <button type="button" style={S.toolBtnGreen} onClick={handleFinalize} disabled={finalizing}>
              ✓ {finalizing ? 'Finalizing…' : 'Finalized'}
            </button>
          )}
        </div>
      </form>

      {/* Unfinalize Modal */}
      {unfinalizeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 6, padding: 24, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginBottom: 8, fontSize: 14 }}>Request Unfinalize — Job Card</h3>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>This will go to Account Manager then Admin for final approval.</p>

            {unfinalizeBlockers === null && (
              <div style={{ padding: 8, color: '#64748b', fontSize: 12, marginBottom: 12 }}>Checking downstream references…</div>
            )}

            {unfinalizeBlockers && unfinalizeBlockers.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 10, marginBottom: 12 }}>
                <div style={{ color: '#b91c1c', fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                  Cannot unfinalize — {unfinalizeBlockers.length} downstream reference{unfinalizeBlockers.length === 1 ? '' : 's'}:
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: '#7f1d1d' }}>
                  {unfinalizeBlockers.map((b, i) => <li key={i} style={{ marginBottom: 3 }}>{b.description}</li>)}
                </ul>
              </div>
            )}

            {unfinalizeBlockers && unfinalizeBlockers.length === 0 && (<>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Reason *</label>
              <textarea rows={4} value={unfinalizeReason} onChange={e => setUnfinalizeReason(e.target.value)}
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 4, padding: 8, fontSize: 12, resize: 'vertical', marginBottom: 12, boxSizing: 'border-box' }} placeholder="Explain why..." />
            </>)}
            <div style={{ display: 'flex', gap: 8 }}>
              {unfinalizeBlockers && unfinalizeBlockers.length === 0 && (
                <button onClick={handleRequestUnfinalize} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Submit Request</button>
              )}
              <button onClick={() => { setUnfinalizeModal(false); setUnfinalizeReason(''); setUnfinalizeBlockers(null); }} style={{ background: '#e2e8f0', border: 'none', borderRadius: 4, padding: '6px 16px', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
