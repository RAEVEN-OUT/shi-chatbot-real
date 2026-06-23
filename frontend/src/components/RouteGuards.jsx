'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export function PrivateRoute({ children }) {
  const { currentUser, userData, logout } = useAuth();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (currentUser === undefined) return;
    if (!currentUser) {
      router.replace('/login');
    } else if (userData && userData.is_active === false) {
      if (logout) logout();
      router.replace('/login?error=inactive');
    } else if (userData?.role === 'admin') {
      router.replace('/admin');
    } else {
      setAuthorized(true);
    }
  }, [currentUser, userData, logout, router]);

  if (!authorized) return null;
  return <>{children}</>;
}

export function AdminRoute({ children }) {
  const { currentUser, userData } = useAuth();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (currentUser === undefined) return;
    if (!currentUser) {
      router.replace('/login');
    } else if (userData?.role !== 'admin') {
      router.replace('/');
    } else {
      setAuthorized(true);
    }
  }, [currentUser, userData, router]);

  if (!authorized) return null;
  return <>{children}</>;
}
