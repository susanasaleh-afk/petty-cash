import React from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import UserDashboard from './pages/UserDashboard';

function AppInner() {
  const { user, profile, loading } = useAuth();

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#F5F3EE', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'monospace', fontSize:12, color:'#AAA89F' }}>
      Loading…
    </div>
  );

  if (!user) return <Login />;
  return profile?.isAdmin ? <AdminDashboard /> : <UserDashboard />;
}

export default function App() {
  return <AuthProvider><AppInner /></AuthProvider>;
}
