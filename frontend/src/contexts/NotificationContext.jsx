'use client';
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { chatSessionService } from '../services/chatSessionService';
import { useToast } from './ToastContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { currentUser, userData } = useAuth();
  const [unreadStats, setUnreadStats] = useState({ total_unread: 0, sessions_with_unread: 0 });
  const toast = useToast();
  const prevUnreadRef = useRef(0);
  const isFirstFetchRef = useRef(true);

  const refetchUnread = async () => {
    if (!currentUser || !userData || userData.role === 'admin') return;
    try {
      const res = await chatSessionService.getUnreadCount();
      if (res?.success && res?.data) {
        const nextStats = res.data;
        if (!isFirstFetchRef.current && nextStats.total_unread > prevUnreadRef.current) {
          toast.info("New message received", "A customer has sent a new message in live support.");
        }
        isFirstFetchRef.current = false;
        prevUnreadRef.current = nextStats.total_unread;
        setUnreadStats(nextStats);
      }
    } catch (e) {
      console.error("Error fetching unread notification counts:", e);
    }
  };

  useEffect(() => {
    // Only proceed if there is an active logged-in user with non-admin role
    if (!currentUser || !userData || userData.role === 'admin') {
      setUnreadStats({ total_unread: 0, sessions_with_unread: 0 });
      return;
    }

    refetchUnread();

    const interval = setInterval(() => {
      // Check again inside the interval just to be safe
      if (currentUser && userData && userData.role !== 'admin') {
        refetchUnread();
      }
    }, 60000); // Poll every 60 seconds (1 minute)

    return () => clearInterval(interval);
  }, [currentUser, userData]);

  return (
    <NotificationContext.Provider value={{ ...unreadStats, refetchUnread }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
