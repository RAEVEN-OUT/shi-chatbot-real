'use client';
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { chatSessionService } from '../services/chatSessionService';
import { useToast } from './ToastContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { currentUser, userData } = useAuth();
  const [totalUnread, setTotalUnread] = useState(0);
  const toast = useToast();
  const prevUnreadRef = useRef(0);
  const isFirstFetchRef = useRef(true);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  // ─── Initial count fetch ──────────────────────────────────────────────────

  const fetchUnreadCount = useCallback(async () => {
    if (!currentUser || !userData || userData.role === 'admin') return;
    try {
      const res = await chatSessionService.getUnreadCount();
      const count = res?.unread_count ?? 0;
      isFirstFetchRef.current = false;
      prevUnreadRef.current = count;
      setTotalUnread(count);
    } catch (e) {
      if (e.response && (e.response.status === 403 || e.response.status === 401)) {
        // Silently ignore auth errors which happen during logout race conditions
        return;
      }
      console.error('Error fetching unread notification counts:', e);
    }
  }, [currentUser, userData]);

  // ─── Dashboard WebSocket for real-time unread increments ─────────────────

  const connectWs = useCallback(() => {
    if (!currentUser || !userData || userData.role === 'admin') return;

    const baseUrl = (
      process.env.NEXT_PUBLIC_WITHOUT_API_URL
      || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '')
      || 'http://127.0.0.1:8005'
    ).trim();

    const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/ws/admin/dashboard';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'conversation_update') {
          const sender = data.sender;
          // Only customer messages increase the unread count for the bell
          if (sender === 'user' || sender === 'customer') {
            if (!isFirstFetchRef.current) {
              toast.info?.('New message received', 'A customer has sent a new message in live support.');
            }
            fetchUnreadCount();
          }
        }
      } catch (err) {
        console.error('Notification WS parse error', err);
      }
    };

    ws.onclose = () => {
      // Reconnect after 3 s; re-fetch count to catch up on anything missed
      reconnectRef.current = setTimeout(() => {
        fetchUnreadCount();
        connectWs();
      }, 3000);
    };

    ws.onerror = () => ws.close();
  }, [currentUser, userData, fetchUnreadCount]);

  useEffect(() => {
    if (!currentUser || !userData || userData.role === 'admin') {
      setTotalUnread(0);
      return;
    }

    // Initial fetch
    fetchUnreadCount();

    // WebSocket for live increments
    connectWs();

    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };
  }, [currentUser, userData, fetchUnreadCount, connectWs]);

  /**
   * Call this when the admin opens a conversation so the bell resets.
   */
  const markAllRead = useCallback(() => {
    prevUnreadRef.current = 0;
    setTotalUnread(0);
  }, []);

  return (
    <NotificationContext.Provider value={{ total_unread: totalUnread, markAllRead, refetchUnread: fetchUnreadCount }}>
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