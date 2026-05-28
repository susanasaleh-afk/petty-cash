import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import OfficeView from '../components/OfficeView';

export default function UserDashboard() {
  const { user, signOut } = useAuth();
  const [office, setOffice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOffice() {
      const userSnap = await getDoc(doc(db,'users',user.uid));
      if (!userSnap.exists()) { setLoading(false); return; }
      const officeId = userSnap.data().officeId;
      const officeSnap = await getDoc(doc(db,'offices',officeId));
      if (officeSnap.exists()) setOffice({ id: officeSnap.id, ...officeSnap.data() });
      setLoading(false);
    }
    loadOffice();
  }, [user.uid]);

  if (loading) return <div style={s.loading}>Loading…</div>;

  if (!office) return (
    <div style={s.noAccess}>
      <div style={s.card}>
        <div style={s.logo}><span style={s.dot}/>Petty Cash</div>
        <p style={{color:'#6B6860',lineHeight:1.6}}>You don't have access to any office yet.<br/>Ask your admin to assign you to an office.</p>
        <button style={s.btn} onClick={signOut}>Sign out</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={s.bar}>
        <span style={s.email}>{user.email}</span>
        <button style={s.out} onClick={signOut}>Sign out</button>
      </div>
      <OfficeView office={office} onBack={null} />
    </div>
  );
}

const s = {
  loading:  { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'#AAA89F', fontFamily:'monospace', fontSize:12 },
  noAccess: { minHeight:'100vh', background:'#F5F3EE', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' },
  card:     { background:'#fff', border:'1px solid #E0DDD5', borderRadius:16, padding:'2rem', maxWidth:360, textAlign:'center' },
  logo:     { fontFamily:'monospace', fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'#AAA89F', marginBottom:'1.5rem', display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
  dot:      { width:7, height:7, borderRadius:'50%', background:'#2A5A3A', display:'inline-block' },
  btn:      { padding:'10px 20px', background:'#2A5A3A', color:'#fff', border:'none', borderRadius:10, fontFamily:'inherit', fontSize:14, cursor:'pointer', marginTop:'1.5rem' },
  bar:      { background:'#fff', borderBottom:'1px solid #E0DDD5', padding:'8px 1.25rem', display:'flex', justifyContent:'flex-end', alignItems:'center', gap:12, fontSize:12 },
  email:    { color:'#AAA89F' },
  out:      { background:'none', border:'1px solid #E0DDD5', borderRadius:8, padding:'4px 12px', cursor:'pointer', fontSize:12, color:'#6B6860' },
};
