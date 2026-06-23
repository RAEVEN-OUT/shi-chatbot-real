'use client';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTasks } from '@/contexts/TaskContext';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

export default function GlobalTaskWidget() {
  const { tasks } = useTasks();

  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {tasks.map(task => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            className="w-80 bg-gray-900/40 backdrop-blur-sm  border border-gray-200 rounded-xl p-4 shadow-2xl pointer-events-auto overflow-hidden relative"
          >
            {/* Background progress fill */}
            {task.status === 'processing' && (
              <motion.div 
                className="absolute left-0 top-0 bottom-0 bg-blue-500/10 z-0"
                initial={{ width: 0 }}
                animate={{ width: `${task.progress || 50}%` }}
                transition={{ duration: 0.5 }}
              />
            )}

            <div className="flex items-start gap-3 relative z-10">
              <div className="mt-0.5">
                {task.status === 'processing' && <Loader2 size={18} className="text-blue-400 animate-spin" />}
                {task.status === 'success' && <CheckCircle2 size={18} className="text-emerald-400" />}
                {task.status === 'error' && <XCircle size={18} className="text-red-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{task.title}</p>
                <p className="text-xs text-gray-500 mt-1 capitalize">{task.status === 'processing' ? 'Processing...' : task.status}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
