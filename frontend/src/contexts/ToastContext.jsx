'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';
import ToastContainer from '../components/system/ToastContainer';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const parseToastMessage = (msg) => {
    if (!msg) return '';
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) {
       return msg.length > 0 ? (msg[0].msg || msg[0].message || JSON.stringify(msg[0])) : 'Unknown error';
    }
    if (typeof msg === 'object') {
       return msg.message || msg.msg || (typeof msg.detail === 'string' ? msg.detail : JSON.stringify(msg));
    }
    return String(msg);
  };

  const addToast = useCallback((type, rawMessage, rawDescription = '', duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    
    // Safely parse objects to prevent React "Objects are not valid as a React child" crashes
    const message = parseToastMessage(rawMessage) || 'An error occurred';
    const description = typeof rawDescription === 'string' ? rawDescription : parseToastMessage(rawDescription);

    setToasts((prev) => [...prev, { id, type, message, description, duration }]);
    
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (msg, desc, dur) => addToast('success', msg, desc, dur),
    error: (msg, desc, dur) => addToast('error', msg, desc, dur),
    warning: (msg, desc, dur) => addToast('warning', msg, desc, dur),
    info: (msg, desc, dur) => addToast('info', msg, desc, dur),
    showToast: (msg, type = 'info', desc, dur) => addToast(type, msg, desc, dur),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
