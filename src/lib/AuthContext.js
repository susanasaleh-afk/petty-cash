import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setUser(fbUser);
        const snap = await getDoc(doc(db, 'users', fbUser.uid));
        setProfile(snap.exists() ? snap.data() : null);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  const signIn  = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
  const signOut = () => fbSignOut(auth);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
