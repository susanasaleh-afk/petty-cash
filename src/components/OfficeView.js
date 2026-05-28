import React, { useEffect, useState, useCallback } from 'react';
import {
  collection, query, where, orderBy,
  addDoc, updateDoc, deleteDoc, doc, onSnapshot
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';

const MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DENOMS  = [
  {label:'€500',value:500},{label:'€200',value:200},{label:'€100',value:100},
  {label:'€50',value:50},{label:'€20',value:20},{label:'€10',value:10},
  {label:'€5',value:5},{label:'€2',value:2},{label:'€1',value:1},
  {label:'50c',value:0.50},{label:'20c',value:0.20},{label:'10c',value:0.10},
  {label:'5c',value:0.05},{label:'2c',value:0.02},{label:'1c',value:0.01},
];
const CAT_CLR = {
  Meals:{bg:'#FEF3EC',color:'#7C3912'}, Travel:{bg:'#EBF3FD',color:'#1A4B82'},
  Supplies:{bg:'#EAF5EE',color:'#1A4D2E'}, Entertainment:{bg:'#FEF9EC',color:'#7C5A12'},
  Other:{bg:'#EFEDE7',color:'#6B6860'},
};

export default function OfficeView({ office, onBack }) {
  const [txns, setTxns]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [viewYear, setYear]     = useState(new Date().getFullYear());
  const [viewMonth, setMonth]   = useState(new Date().getMonth());
  const [modal, setModal]       = useState(null);
  const [editTx, setEditTx]     = useState(null);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState({});
  const [coinCounts, setCoins]  = useState(Array(15).fill(0));
  const [manualTotal, setManual]= useState('');
  const [toast, setToast]       = useState({ msg:'', err:false });
  const [receiptFile, setReceiptFile] = useState(null);

  // Real-time listener
  useEffect(() => {
    const q = query(
      collection(db, 'transactions'),
      where('officeId', '==', office.id),
      orderBy('date', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setTxns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [office.id]);

  function showToast(msg, err=false) {
    setToast({ msg, err });
    setTimeout(() => setToast({ msg:'', err:false }), 3500);
  }

  const today = () => new Date().toISOString().split('T')[0];

  function openModal(type, tx=null) {
    if (type==='expense')    setForm({ date:today(), desc:'', cat:'Meals', person:'', amount:'' });
    if (type==='topup')      setForm({ date:today(), amount:'', person:'', note:'' });
    if (type==='reconcile')  { setForm({ date:today(), person:'', note:'' }); setCoins(Array(15).fill(0)); setManual(''); }
    if (type==='edit' && tx) setForm({ date:tx.date, desc:tx.description, cat:tx.category||'Meals', person:tx.person, amount:tx.amount });
    setEditTx(tx); setReceiptFile(null); setModal(type);
  }

  function closeModal() { setModal(null); setEditTx(null); setReceiptFile(null); }

  function navTo(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    setYear(d.getFullYear()); setMonth(d.getMonth());
  }

  // ── BALANCES ──
  const balance     = txns.reduce((s,t) => t.type==='topup' ? s+t.amount : t.type==='expense' ? s-t.amount : s, 0);
  const monthTxns   = txns.filter(t => { const d=new Date(t.date+'T12:00:00'); return d.getFullYear()===viewYear && d.getMonth()===viewMonth; });
  const spentMonth  = monthTxns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const toppedMonth = monthTxns.filter(t=>t.type==='topup').reduce((s,t)=>s+t.amount,0);

  // ── SAVE EXPENSE ──
  async function saveExpense() {
    const { date, desc, cat, person, amount } = form;
    if (!date||!desc||!person||!amount||Number(amount)<=0) { showToast('Please fill all fields', true); return; }
    setSaving(true);
    let receiptUrl = '', receiptName = '';
    if (receiptFile) {
      try {
        const storageRef = ref(storage, `receipts/${office.id}/${Date.now()}_${receiptFile.name}`);
        await uploadBytes(storageRef, receiptFile);
        receiptUrl  = await getDownloadURL(storageRef);
        receiptName = receiptFile.name;
      } catch(e) { showToast('Receipt upload failed, saving without it', true); }
    }
    await addDoc(collection(db,'transactions'), {
      officeId:office.id, type:'expense', date, description:desc,
      category:cat, person, amount:Number(amount), receiptUrl, receiptName,
      createdAt: new Date().toISOString()
    });
    closeModal(); navTo(date); showToast('Expense saved'); setSaving(false);
  }

  // ── EDIT EXPENSE ──
  async function saveEdit() {
    const { date, desc, cat, person, amount } = form;
    if (!date||!desc||!person||!amount||Number(amount)<=0) { showToast('Please fill all fields', true); return; }
    setSaving(true);
    await updateDoc(doc(db,'transactions',editTx.id), {
      date, description:desc, category:cat, person, amount:Number(amount)
    });
    closeModal(); navTo(date); showToast('Expense updated'); setSaving(false);
  }

  // ── SAVE TOPUP ──
  async function saveTopup() {
    const { date, amount, person, note } = form;
    if (!date||!person||!amount||Number(amount)<=0) { showToast('Please fill all fields', true); return; }
    setSaving(true);
    await addDoc(collection(db,'transactions'), {
      officeId:office.id, type:'topup', date,
      description: note||'Top-up', person, amount:Number(amount),
      createdAt: new Date().toISOString()
    });
    closeModal(); navTo(date); showToast('Balance topped up'); setSaving(false);
  }

  // ── RECONCILE ──
  function coinTotal() {
    if (manualTotal !== '') { const v=parseFloat(manualTotal); return isNaN(v)?0:Math.round(v*100)/100; }
    return coinCounts.reduce((s,qty,i)=>s+qty*Math.round(DENOMS[i].value*100),0)/100;
  }
  const ct       = coinTotal();
  const recDiff  = Math.round((ct - balance)*100)/100;
  const recMatch = Math.abs(recDiff) < 0.01;

  async function saveReconcile() {
    const { date, person, note } = form;
    if (!date)   { showToast('Please enter a date', true); return; }
    if (!person) { showToast('Please enter who counted', true); return; }
    if (!recMatch && !note) { showToast('Please add a note explaining the discrepancy', true); return; }
    const breakdown = coinCounts.map((qty,i)=>qty>0?`${qty}x ${DENOMS[i].label}`:'').filter(Boolean).join(', ');
    setSaving(true);
    await addDoc(collection(db,'transactions'), {
      officeId:office.id, type:'reconcile', date,
      description:'Cash reconciliation', person, amount:0,
      physicalCount:ct, calcBalance:balance, diff:recDiff,
      matched:recMatch, note:note||'', breakdown,
      createdAt: new Date().toISOString()
    });
    closeModal(); navTo(date);
    showToast(recMatch ? 'Reconciled — all balanced!' : 'Reconciliation saved — discrepancy noted');
    setSaving(false);
  }

  // ── DELETE ──
  async function deleteTx(id) {
    if (!window.confirm('Delete this transaction?')) return;
    await deleteDoc(doc(db,'transactions',id));
    showToast('Deleted');
  }

  const f = v => v; // shorthand for form field setter
  const setF = k => e => setForm(prev=>({...prev,[k]:e.target.value}));

  return (
    <div style={S.page}>
      {/* TOPBAR */}
      <div style={S.topbar}>
        <div style={S.tl}>
          {onBack && <button style={S.backBtn} onClick={onBack}>← All offices</button>}
          {onBack && <span style={{color:'#E0DDD5'}}>|</span>}
          <span style={S.officeName}>{office.name}</span>
        </div>
        <div style={S.tr}>
          <button style={S.btnRec}  onClick={()=>openModal('reconcile')}>◯ Reconcile</button>
          <button style={S.btnTopup} onClick={()=>openModal('topup')}>+ Top up</button>
          <button style={S.btnAdd}   onClick={()=>openModal('expense')}>+ Expense</button>
        </div>
      </div>

      {/* HERO */}
      <div style={S.hero}>
        <div style={S.balCard}>
          <div style={S.balLabel}>Current balance</div>
          <div style={{...S.balAmt, color: balance<0?'#8B1A1A':balance<50?'#7C5200':'#2A5A3A'}}>
            €{Math.abs(balance).toFixed(2)}
          </div>
          <div style={S.balSub}><b>€{spentMonth.toFixed(2)}</b> spent · <b>€{toppedMonth.toFixed(2)}</b> topped up this month</div>
        </div>
        <div style={S.stats}>
          {[['Spent this month',`€${spentMonth.toFixed(2)}`],['Top-ups this month',`€${toppedMonth.toFixed(2)}`],['Transactions',monthTxns.length]].map(([l,v])=>(
            <div key={l} style={S.stat}><div style={S.statL}>{l}</div><div style={S.statV}>{v}</div></div>
          ))}
        </div>
      </div>

      {/* MONTH NAV */}
      <div style={S.mnav}>
        <button style={S.mb} onClick={()=>{ const nm=viewMonth===0?11:viewMonth-1; setMonth(nm); if(nm===11)setYear(y=>y-1); }}>‹</button>
        <div style={S.mlbl}>{MONTHS[viewMonth]} {viewYear}</div>
        <button style={S.mb} onClick={()=>{ const nm=viewMonth===11?0:viewMonth+1; setMonth(nm); if(nm===0)setYear(y=>y+1); }}>›</button>
      </div>

      {/* LEDGER */}
      <div style={S.tableWrap}>
        {loading ? <div style={S.empty}>Loading…</div>
        : monthTxns.length===0 ? (
          <div style={S.empty}>
            No transactions for {MONTHS[viewMonth]} {viewYear}<br/>
            <span style={{fontSize:11}}>Use the buttons above to add an expense or top up</span>
          </div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr style={{background:'#EFEDE7'}}>
                {['Date','Description','Type / Category','Person','Amount','Receipt',''].map((h,i)=>(
                  <th key={i} style={{...S.th, textAlign:i===4?'right':'left'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthTxns.map(t=>{
                const isE=t.type==='expense', isR=t.type==='reconcile';
                const ds = new Date(t.date+'T12:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
                const cc = CAT_CLR[t.category]||CAT_CLR.Other;
                return (
                  <tr key={t.id} style={{borderBottom:'1px solid #E0DDD5', background:isR?'#F0F7FF':undefined}}>
                    <td style={{...S.td,fontFamily:'monospace',fontSize:11,color:'#6B6860'}}>{ds}</td>
                    <td style={{...S.td,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={t.description}>{t.description}</td>
                    <td style={S.td}>
                      {isR ? <span style={{...S.pill,background:t.matched?'#E6F0EA':'#FDE8E8',color:t.matched?'#183D26':'#8B1A1A'}}>{t.matched?'✓ Balanced':'⚠ Discrepancy'}</span>
                           : isE ? <span style={{...S.badge,background:cc.bg,color:cc.color}}>{t.category}</span>
                           : <span style={{...S.pill,background:'#E6F0EA',color:'#183D26'}}>Top-up</span>}
                    </td>
                    <td style={S.td}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <div style={S.av}>{(t.person||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</div>
                        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:90}}>{t.person}</span>
                      </div>
                    </td>
                    <td style={{...S.td,textAlign:'right',fontFamily:'monospace',fontSize:12,fontWeight:500,color:isR?'#6B6860':isE?'#8B1A1A':'#2A5A3A'}}>
                      {isR ? `Count: €${Number(t.physicalCount||0).toFixed(2)}${!t.matched?` (${t.diff>=0?'+':''}${Number(t.diff).toFixed(2)})`:''}` : (isE?'− ':'+ ')+'€'+Number(t.amount).toFixed(2)}
                    </td>
                    <td style={{...S.td,textAlign:'center'}}>
                      {isR && t.note ? <span title={t.note} style={{fontSize:12,color:'#6B6860',cursor:'help'}}>📝 {t.note.slice(0,20)}{t.note.length>20?'…':''}</span>
                      : t.receiptUrl ? <a href={t.receiptUrl} target="_blank" rel="noreferrer" style={{color:'#1A3F7A',fontSize:12}}>📎 View</a>
                      : <span style={{color:'#AAA89F',fontSize:11}}>—</span>}
                    </td>
                    <td style={{...S.td,display:'flex',gap:3,alignItems:'center'}}>
                      {!isR && <button style={S.editBtn} onClick={()=>openModal('edit',t)} title="Edit">✏</button>}
                      <button style={S.delBtn} onClick={()=>deleteTx(t.id)} title="Delete">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* MODALS */}
      {modal && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&closeModal()}>
          <div style={{...S.modal, width:modal==='reconcile'?500:420, maxHeight:'90vh', overflowY:'auto'}}>

            {(modal==='expense'||modal==='edit') && <>
              <h2 style={S.mTitle}>{modal==='edit'?'Edit expense':'New expense'}</h2>
              <div style={S.mrow}>
                <MF label="Date"><input style={S.mi} type="date" value={form.date||''} onChange={setF('date')}/></MF>
                <MF label="Category">
                  <select style={S.mi} value={form.cat||'Meals'} onChange={setF('cat')}>
                    {['Meals','Travel','Supplies','Entertainment','Other'].map(c=><option key={c}>{c}</option>)}
                  </select>
                </MF>
              </div>
              <MF label="Description"><input style={S.mi} value={form.desc||''} onChange={setF('desc')} placeholder="e.g. Team lunch" autoFocus/></MF>
              <div style={S.mrow}>
                <MF label="Submitted by"><input style={S.mi} value={form.person||''} onChange={setF('person')} placeholder="Name"/></MF>
                <MF label="Amount (€)"><input style={S.mi} type="number" value={form.amount||''} onChange={setF('amount')} placeholder="0.00" min="0" step="0.01"/></MF>
              </div>
              {modal==='expense' && (
                <MF label="Receipt (optional)">
                  <div style={S.uploadArea} onClick={()=>document.getElementById('rcptFile').click()}>
                    {receiptFile ? `✓ ${receiptFile.name}` : '📎 Click to attach PDF, JPG or PNG'}
                    <input id="rcptFile" type="file" accept=".pdf,.jpg,.jpeg,.png" style={{display:'none'}}
                      onChange={e=>setReceiptFile(e.target.files[0]||null)}/>
                  </div>
                </MF>
              )}
              <div style={S.mac}>
                <button style={S.btnC} onClick={closeModal}>Cancel</button>
                <button style={S.btnS} onClick={modal==='edit'?saveEdit:saveExpense} disabled={saving}>{saving?'Saving…':modal==='edit'?'Save changes':'Save expense'}</button>
              </div>
            </>}

            {modal==='topup' && <>
              <h2 style={S.mTitle}>Top up balance</h2>
              <div style={{...S.infoBox,marginBottom:'1rem'}}>Current balance: <b>€{balance.toFixed(2)}</b></div>
              <div style={S.mrow}>
                <MF label="Date"><input style={S.mi} type="date" value={form.date||''} onChange={setF('date')}/></MF>
                <MF label="Amount (€)"><input style={S.mi} type="number" value={form.amount||''} onChange={setF('amount')} placeholder="0.00" min="0" step="0.01" autoFocus/></MF>
              </div>
              <MF label="Topped up by"><input style={S.mi} value={form.person||''} onChange={setF('person')} placeholder="Name"/></MF>
              <MF label="Notes (optional)"><input style={S.mi} value={form.note||''} onChange={setF('note')} placeholder="e.g. Monthly replenishment"/></MF>
              <div style={S.mac}>
                <button style={S.btnC} onClick={closeModal}>Cancel</button>
                <button style={{...S.btnS,background:'#7C5200'}} onClick={saveTopup} disabled={saving}>{saving?'Saving…':'Add top-up'}</button>
              </div>
            </>}

            {modal==='reconcile' && <>
              <h2 style={S.mTitle}>Reconcile cash tin</h2>
              <div style={{...S.infoBox,marginBottom:'1rem'}}>Calculated balance: <b>€{balance.toFixed(2)}</b></div>
              <MF label="Date"><input style={S.mi} type="date" value={form.date||''} onChange={setF('date')}/></MF>

              <div style={{marginBottom:'0.85rem'}}>
                <div style={{fontSize:10,fontWeight:500,letterSpacing:'0.07em',textTransform:'uppercase',color:'#6B6860',marginBottom:6}}>Count each denomination</div>
                <div style={{border:'1px solid #E0DDD5',borderRadius:10,overflow:'hidden'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 80px 80px',gap:8,padding:'7px 10px',background:'#EFEDE7',fontSize:10,fontWeight:500,letterSpacing:'0.06em',textTransform:'uppercase',color:'#AAA89F'}}>
                    <span>Denomination</span><span style={{textAlign:'center'}}>Qty</span><span style={{textAlign:'right'}}>Subtotal</span>
                  </div>
                  {DENOMS.map((d,i)=>{
                    const qty=coinCounts[i]||0;
                    return (
                      <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 80px 80px',gap:8,padding:'5px 10px',alignItems:'center',borderTop:'1px solid #E0DDD5'}}>
                        <span style={{fontSize:13}}>{d.label}</span>
                        <input type="number" min="0" step="1" value={qty||''} placeholder="0"
                          style={{width:'100%',textAlign:'center',padding:'5px 6px',border:'1px solid #E0DDD5',borderRadius:6,fontFamily:'monospace',fontSize:13,outline:'none',boxSizing:'border-box'}}
                          onChange={e=>{ const n=[...coinCounts]; n[i]=parseInt(e.target.value)||0; setCoins(n); setManual(''); }}/>
                        <span style={{textAlign:'right',fontFamily:'monospace',fontSize:12,color:'#6B6860'}}>€{(qty*d.value).toFixed(2)}</span>
                      </div>
                    );
                  })}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',borderTop:'2px solid #E0DDD5',background:'#EFEDE7'}}>
                    <span style={{fontWeight:500,fontSize:13}}>Total counted</span>
                    <span style={{fontFamily:'monospace',fontSize:15,fontWeight:500,color:'#2A5A3A'}}>€{ct.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <MF label="Or enter total directly (€)">
                <input style={S.mi} type="number" value={manualTotal} onChange={e=>setManual(e.target.value)} placeholder="e.g. 451.50 — overrides coin count above" min="0" step="0.01"/>
              </MF>

              {(ct>0||manualTotal!=='') && (
                <div style={{...S.infoBox,marginBottom:'0.85rem',background:recMatch?'#E6F0EA':'#FDE8E8',color:recMatch?'#183D26':'#8B1A1A'}}>
                  {recMatch ? '✓ Balances perfectly' : `⚠ Discrepancy of €${Math.abs(recDiff).toFixed(2)} — tin has €${Math.abs(recDiff).toFixed(2)} ${recDiff>0?'more':'less'} than records`}
                </div>
              )}

              <MF label="Counted by"><input style={S.mi} value={form.person||''} onChange={setF('person')} placeholder="Name"/></MF>
              <MF label={`Note${!recMatch?' (required)':' (optional)'}`}>
                <input style={S.mi} value={form.note||''} onChange={setF('note')} placeholder="e.g. Missing taxi receipt"/>
              </MF>
              <div style={S.mac}>
                <button style={S.btnC} onClick={closeModal}>Cancel</button>
                <button style={{...S.btnS,background:'#1A3F7A'}} onClick={saveReconcile} disabled={saving}>{saving?'Saving…':'Save reconciliation'}</button>
              </div>
            </>}

          </div>
        </div>
      )}

      {toast.msg && <div style={{...S.toast,background:toast.err?'#8B1A1A':'#1A1916'}}>{toast.msg}</div>}
    </div>
  );
}

function MF({ label, children }) {
  return (
    <div style={{marginBottom:'0.85rem'}}>
      <label style={{display:'block',fontSize:10,fontWeight:500,letterSpacing:'0.07em',textTransform:'uppercase',color:'#6B6860',marginBottom:4}}>{label}</label>
      {children}
    </div>
  );
}

const S = {
  page:      { minHeight:'100vh', background:'#F5F3EE', fontFamily:"'DM Sans', sans-serif" },
  topbar:    { background:'#fff', borderBottom:'1px solid #E0DDD5', height:54, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 1.25rem', position:'sticky', top:0, zIndex:20 },
  tl:        { display:'flex', alignItems:'center', gap:10 },
  backBtn:   { background:'none', border:'none', cursor:'pointer', color:'#6B6860', fontSize:13, padding:'5px 10px', borderRadius:10 },
  officeName:{ fontSize:14, fontWeight:500 },
  tr:        { display:'flex', alignItems:'center', gap:8 },
  btnRec:    { padding:'6px 13px', borderRadius:10, border:'none', background:'#EAF0FB', color:'#1A3F7A', fontSize:12, cursor:'pointer' },
  btnTopup:  { padding:'6px 13px', borderRadius:10, border:'none', background:'#FEF5E4', color:'#7C5200', fontSize:12, cursor:'pointer' },
  btnAdd:    { padding:'6px 13px', borderRadius:10, border:'none', background:'#2A5A3A', color:'#fff', fontSize:12, fontWeight:500, cursor:'pointer' },
  hero:      { padding:'1.25rem 1.25rem 0.75rem', display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'start', maxWidth:960, margin:'0 auto' },
  balCard:   { background:'#fff', border:'1px solid #E0DDD5', borderRadius:16, padding:'1.4rem 1.5rem' },
  balLabel:  { fontSize:10, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'#AAA89F', marginBottom:8 },
  balAmt:    { fontFamily:'monospace', fontSize:40, fontWeight:400, letterSpacing:'-0.03em', lineHeight:1 },
  balSub:    { fontSize:12, color:'#AAA89F', marginTop:8 },
  stats:     { display:'flex', flexDirection:'column', gap:10, minWidth:155 },
  stat:      { background:'#fff', border:'1px solid #E0DDD5', borderRadius:10, padding:'0.75rem 1rem' },
  statL:     { fontSize:10, fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'#AAA89F', marginBottom:3 },
  statV:     { fontFamily:'monospace', fontSize:17 },
  mnav:      { padding:'0 1.25rem 0.75rem', display:'flex', alignItems:'center', maxWidth:960, margin:'0 auto' },
  mb:        { background:'none', border:'1px solid #E0DDD5', padding:'5px 11px', fontSize:16, cursor:'pointer', color:'#6B6860' },
  mlbl:      { padding:'5px 18px', border:'1px solid #E0DDD5', borderLeft:'none', borderRight:'none', fontSize:13, fontWeight:500, minWidth:130, textAlign:'center', background:'#fff' },
  tableWrap: { padding:'0 1.25rem 2rem', maxWidth:960, margin:'0 auto' },
  empty:     { textAlign:'center', padding:'2.5rem', color:'#AAA89F', fontSize:13, lineHeight:2.2, background:'#fff', border:'1px solid #E0DDD5', borderRadius:16 },
  table:     { width:'100%', borderCollapse:'collapse', background:'#fff', border:'1px solid #E0DDD5', borderRadius:16, overflow:'hidden', tableLayout:'fixed' },
  th:        { fontSize:10, fontWeight:500, letterSpacing:'0.06em', textTransform:'uppercase', color:'#AAA89F', padding:'9px 13px', borderBottom:'1px solid #E0DDD5' },
  td:        { padding:'11px 13px', verticalAlign:'middle', fontSize:14 },
  badge:     { fontSize:11, padding:'3px 8px', borderRadius:20, fontWeight:500, display:'inline-block' },
  pill:      { fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:600, letterSpacing:'0.04em', textTransform:'uppercase', display:'inline-block' },
  av:        { width:24, height:24, borderRadius:'50%', background:'#E6F0EA', color:'#183D26', fontSize:9, fontWeight:600, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  editBtn:   { background:'none', border:'none', cursor:'pointer', color:'#AAA89F', fontSize:13, padding:'3px 5px', borderRadius:5 },
  delBtn:    { background:'none', border:'none', cursor:'pointer', color:'#AAA89F', fontSize:15, padding:'3px 5px', borderRadius:5, lineHeight:1 },
  overlay:   { position:'fixed', inset:0, background:'rgba(0,0,0,0.22)', backdropFilter:'blur(3px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' },
  modal:     { background:'#fff', borderRadius:16, border:'1px solid #E0DDD5', padding:'1.6rem', maxWidth:'100%' },
  mTitle:    { fontSize:16, fontWeight:600, marginBottom:'1.25rem' },
  infoBox:   { background:'#E6F0EA', borderRadius:10, padding:'0.7rem 1rem', fontSize:12, color:'#183D26' },
  mrow:      { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 },
  mi:        { width:'100%', padding:'9px 12px', border:'1px solid #E0DDD5', borderRadius:10, fontFamily:'inherit', fontSize:14, outline:'none', boxSizing:'border-box' },
  mac:       { display:'flex', gap:8, justifyContent:'flex-end', marginTop:'1.25rem', borderTop:'1px solid #E0DDD5', paddingTop:'1.1rem' },
  btnC:      { padding:'8px 16px', borderRadius:10, border:'1px solid #E0DDD5', background:'#fff', color:'#6B6860', fontFamily:'inherit', fontSize:13, cursor:'pointer' },
  btnS:      { padding:'8px 18px', borderRadius:10, border:'none', background:'#2A5A3A', color:'#fff', fontFamily:'inherit', fontSize:13, fontWeight:500, cursor:'pointer', minWidth:100 },
  uploadArea:{ border:'1.5px dashed #E0DDD5', borderRadius:10, padding:'0.85rem', textAlign:'center', cursor:'pointer', fontSize:13, color:'#6B6860' },
  toast:     { position:'fixed', bottom:'1.25rem', right:'1.25rem', color:'#fff', padding:'10px 18px', borderRadius:10, fontSize:13, zIndex:999 },
};
