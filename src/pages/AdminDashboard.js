import React, { useEffect, useState } from 'react';
import { collection, addDoc, onSnapshot, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import OfficeView from '../components/OfficeView';

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [offices, setOffices]       = useState([]);
  const [balances, setBalances]     = useState({});
  const [selected, setSelected]     = useState(null);
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState({});
  const [msg, setMsg]               = useState('');
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db,'offices'), snap => {
      const list = snap.docs.map(d=>({id:d.id,...d.data()}));
      setOffices(list);
      loadBalances(list);
    });
  }, []);

  async function loadBalances(list) {
    const bals = {};
    await Promise.all(list.map(async o => {
      const q = query(collection(db,'transactions'), where('officeId','==',o.id));
      const snap = await getDocs(q);
      bals[o.id] = snap.docs.reduce((s,d) => {
        const t = d.data();
        return t.type==='topup' ? s+t.amount : t.type==='expense' ? s-t.amount : s;
      }, 0);
    }));
    setBalances(bals);
  }

  const setF = k => e => setForm(p=>({...p,[k]:e.target.value}));

  async function addOffice() {
    if (!form.name?.trim()) { setMsg('Enter office name'); return; }
    setSaving(true);
    const ref = await addDoc(collection(db,'offices'), { name: form.name.trim(), createdAt: new Date().toISOString() });
    if (form.opening && Number(form.opening) > 0) {
      await addDoc(collection(db,'transactions'), {
        officeId: ref.id, type:'topup',
        date: new Date().toISOString().split('T')[0],
        description:'Opening balance', person:'Admin',
        amount: Number(form.opening), createdAt: new Date().toISOString()
      });
    }
    setForm({}); setModal(null); setMsg('Office added!');
    setTimeout(()=>setMsg(''), 3000); setSaving(false);
  }

  async function addUser() {
    if (!form.email||!form.password||!form.officeId) { setMsg('Fill all fields'); return; }
    setSaving(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await setDoc(doc(db,'users',cred.user.uid), {
        email: form.email,
        isAdmin: false,
        officeIds: [form.officeId],
        officeId: form.officeId,
        createdAt: new Date().toISOString()
      });
      setForm({}); setModal(null);
      setMsg(`User ${form.email} created!`);
      setTimeout(()=>setMsg(''), 5000);
    } catch(e) {
      setMsg('Error: ' + e.message);
    }
    setSaving(false);
  }

  const totalBalance = Object.values(balances).reduce((s,b)=>s+b,0);

  if (selected) return <OfficeView office={selected} onBack={()=>setSelected(null)} />;

  return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.tl}>
          <span style={S.logo}><span style={S.dot}/>Petty Cash</span>
          <span style={S.badge}>Admin</span>
        </div>
        <div style={S.tr}>
          <span style={S.email}>{user?.email}</span>
          <button style={S.tbtn} onClick={signOut}>Sign out</button>
        </div>
      </div>

      <div style={S.content}>
        <div style={S.heroCard}>
          <div style={S.heroLabel}>Total across all offices</div>
          <div style={{...S.heroAmt, color:totalBalance<0?'#8B1A1A':totalBalance<100?'#7C5200':'#2A5A3A'}}>
            €{Math.abs(totalBalance).toFixed(2)}
          </div>
          <div style={S.heroSub}>{offices.length} office{offices.length!==1?'s':''}</div>
        </div>

        {msg && <div style={S.msg}>{msg}</div>}

        <div style={S.secHeader}>
          <span style={S.secTitle}>Offices</span>
          <div style={{display:'flex',gap:8}}>
            <button style={S.btnSec} onClick={()=>{setForm({});setModal('user')}}>+ Add user</button>
            <button style={S.btnPri} onClick={()=>{setForm({});setModal('office')}}>+ Add office</button>
          </div>
        </div>

        <div style={S.grid}>
          {offices.map(o=>{
            const bal = balances[o.id]||0;
            return (
              <div key={o.id} style={S.card} onClick={()=>setSelected(o)}>
                <div style={S.cardName}>{o.name}</div>
                <div style={{...S.cardBal, color:bal<0?'#8B1A1A':bal<50?'#7C5200':'#2A5A3A'}}>€{Math.abs(bal).toFixed(2)}</div>
                <div style={S.cardHint}>Open →</div>
              </div>
            );
          })}
          <div style={S.addCard} onClick={()=>{setForm({});setModal('office')}}>
            <span style={{fontSize:22}}>+</span> Add office
          </div>
        </div>
      </div>

      {m
