'use client';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const icons = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
  error: <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
  info: <Info className="w-5 h-5 text-blue-400 shrink-0" />,
};

const borderColors = {
  success: 'border-emerald-500/20 shadow-emerald-950/10',
  error: 'border-red-500/20 shadow-red-950/10',
  warning: 'border-amber-500/20 shadow-amber-950/10',
  info: 'border-blue-500/20 shadow-blue-950/10',
};

export default function ToastContainer({ toasts, onClose }) {
  return (
    <div className="fixed bottom-4 right-4 z-[9999999] flex flex-col gap-3 w-full max-w-sm pointer-events-none px-4">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 40, scale: 0.93 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.93, transition: { duration: 0.15 } }}
            className={`bg-white p-4 rounded-2xl shadow-2xl flex gap-3 border pointer-events-auto items-start ${borderColors[toast.type] || 'border-gray-200 shadow-black/30'}`}
          >
            {icons[toast.type] || <Info className="w-5 h-5 text-gray-500 shrink-0" />}
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-tight">{toast.message}</p>
              {toast.description && (
                <p className="text-xs text-gray-500 mt-1 leading-normal">{toast.description}</p>
              )}
            </div>

            <button
              onClick={() => onClose(toast.id)}
              className="p-1 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-white border-gray-200 transition-colors shrink-0"
              aria-label="Close notification"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
