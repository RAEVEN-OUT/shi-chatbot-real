'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import api from '../lib/axios';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    return signOut(auth);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          // Send token to FastAPI to sync user in PostgreSQL and get profile
          const response = await api.post('/auth/login');
          if (response.data.status === 'success') {
            setUserData(response.data.user);
          } else {
            setUserData({ role: 'subscriber', subscription_tier: 'free' });
          }
        } catch (error) {
          console.error("Failed to fetch user data from FastAPI:", error);
          setUserData({ role: 'subscriber', subscription_tier: 'free' });
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const updateProfileData = (updates) => {
    setUserData(prev => ({ ...prev, ...updates }));
  };

  const value = {
    currentUser,
    userData,
    login,
    logout,
    updateProfileData
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="fixed inset-0 z-[9999] bg-gray-50 flex flex-col items-center justify-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-[#0A0D14] to-[#0A0D14]" />
          <div className="relative w-24 h-24 bg-white rounded-full border border-blue-500/50 shadow-[0_0_40px_rgba(59,130,246,0.3)] flex items-center justify-center z-10 backdrop-blur-xl">
            <div className="animate-pulse flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                <path d="M12 4.5a2.5 2.5 0 0 0-4.96-.46 2.5 2.5 0 0 0-1.98 3 2.5 2.5 0 0 0-1.32 4.24 3 3 0 0 0 .34 5.58 2.5 2.5 0 0 0 2.96 3.08 2.5 2.5 0 0 0 4.91.05L12 20V4.5Z"/>
                <path d="M16 8V5c0-1.1.9-2 2-2"/>
                <path d="M12 13h4"/>
                <path d="M12 18h6a2 2 0 0 1 2 2v1"/>
                <path d="M22 15a2 2 0 0 1-2 2h-1"/>
                <path d="M22 9a2 2 0 0 1-2 2h-1"/>
              </svg>
            </div>
          </div>
          <p className="mt-8 text-xs font-mono font-bold text-blue-400 uppercase tracking-[0.2em] relative z-10 animate-pulse">
            Authenticating...
          </p>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
}
