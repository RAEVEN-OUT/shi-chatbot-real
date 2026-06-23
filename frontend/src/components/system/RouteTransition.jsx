'use client';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

export default function RouteTransition({ children }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, filter: "blur(8px)", y: 10 }}
        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        exit={{ opacity: 0, filter: "blur(8px)", y: -10 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="h-full w-full relative"
      >
        {/* Top Progress Beam */}
        <motion.div 
          initial={{ width: "0%", opacity: 1 }}
          animate={{ width: "100%", opacity: 0 }}
          transition={{ duration: 0.8, ease: "circOut", opacity: { delay: 0.6 } }}
          className="absolute top-[-24px] left-[-24px] right-[-24px] h-[2px] bg-gradient-to-r from-transparent via-white to-transparent z-50 shadow-[0_0_10px_rgba(255,255,255,0.8)] pointer-events-none"
        />
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
