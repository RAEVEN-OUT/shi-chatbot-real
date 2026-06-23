'use client';
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit } from 'lucide-react';

const BOOT_SEQUENCE = [
  "Initializing AI Workspace...",
  "Connecting Realtime Infrastructure...",
  "Loading Subscriber Intelligence...",
  "Preparing AI Operations Center...",
];

export default function GlobalAppLoader({ children }) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [bootStep, setBootStep] = useState(0);

  useEffect(() => {
    // Check if we've already done the cinematic boot this session
    if (sessionStorage.getItem("ai_workspace_initialized")) {
      setIsInitializing(false);
      return;
    }

    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      if (step < BOOT_SEQUENCE.length) {
        setBootStep(step);
      } else {
        clearInterval(interval);
        sessionStorage.setItem("ai_workspace_initialized", "true");
        setTimeout(() => setIsInitializing(false), 500); // Wait for last text to show
      }
    }, 1200);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <AnimatePresence>
        {isInitializing && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
            className="fixed inset-0 z-[9999] bg-gray-50 flex flex-col items-center justify-center overflow-hidden"
          >
            {/* Ambient Lighting */}
            <div className="absolute inset-0  from-blue-900/10 via-[#0A0D14] to-[#0A0D14]" />
            
            {/* Core Neural UI */}
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="relative w-32 h-32 flex items-center justify-center mb-12"
            >
              {/* Pulsing rings */}
              <motion.div 
                animate={{ scale: [1, 1.5, 2], opacity: [0.5, 0.2, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border border-blue-500/30 rounded-full"
              />
              <motion.div 
                animate={{ scale: [1, 1.2, 1.5], opacity: [0.8, 0.3, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: 0.5 }}
                className="absolute inset-0 border border-blue-400/50 rounded-full"
              />
              {/* Center Brain */}
              <div className="w-20 h-20 bg-white rounded-full border border-blue-500/50 shadow-[0_0_40px_rgba(59,130,246,0.3)] flex items-center justify-center relative z-10 ">
                 <BrainCircuit className="text-blue-400" size={32} />
              </div>
            </motion.div>

            {/* Changing Text Sequence */}
            <div className="h-8 overflow-hidden relative mb-8">
              <AnimatePresence mode="wait">
                <motion.p
                  key={bootStep}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-xs font-mono font-bold text-blue-400 uppercase tracking-[0.2em] text-center"
                >
                  {BOOT_SEQUENCE[bootStep]}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Glowing Progress Line */}
            <div className="w-64 h-1 bg-white border-gray-200 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: "0%" }}
                animate={{ width: `${((bootStep + 1) / BOOT_SEQUENCE.length) * 100}%` }}
                transition={{ duration: 1.2, ease: "easeInOut" }}
                className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* We only render children once initialized to prevent background flashing before ready */}
      {!isInitializing && children}
    </>
  );
}
