import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError('Invalid email or password');
    }
    setLoading(false);
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}><span style={s.dot}/>Petty Cash</div>
        <h1 style={s.title}>Sign in</h1>
        <form onSubmit={handleSubmit}>
          <div style={s.field}>
            <label style={s.label}>Email</label>
            <input style={s.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" required autoFocus/>
          </div>
          <div style={s.field}>
            <label style={s.label}>Password</label>
            <input style={s.input} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required/>
          </div>
          {error && <div style={s.error}>{error}</div>}
          <button style={s.btn} type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}

const s = {
  page:  { minHeight:'100vh', background:'#F5F3EE', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' },
  card:  { background:'#fff', border:'1px solid #E0DDD5', borderRadius:16, padding:'2rem', width:'100%', maxWidth:380 },
  logo:  { fontFamily:'monospace', fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'#AAA89F', marginBottom:'2rem', display:'flex', alignItems:'center', gap:8 },
  dot:   { width:7, height:7, borderRadius:'50%', background:'#2A5A3A', display:'inline-block' },
  title: { fontSize:22, fontWeight:300, marginBottom:'1.5rem', letterSpacing:'-0.02em' },
  field: { marginBottom:'1rem' },
  label: { display:'block', fontSize:10, fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'#6B6860', marginBottom:5 },
  input: { widt
