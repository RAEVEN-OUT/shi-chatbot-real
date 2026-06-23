import React from 'react';
import { motion } from 'framer-motion';

// Basic Pulse for text or icons
export const MetricPulse = () => (
  <div className="flex h-3 w-3 relative">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
  </div>
);

const shimmerTransition = {
  duration: 1.5,
  repeat: Infinity,
  ease: "linear"
};

export const CardSkeleton = () => (
  <div className="bg-white border border-gray-200 p-6 rounded-xl flex flex-col justify-between relative overflow-hidden h-32">
    <motion.div 
      initial={{ x: "-100%" }}
      animate={{ x: "200%" }}
      transition={shimmerTransition}
      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent w-full" 
    />
    <div className="flex justify-between items-start mb-2 relative z-10">
      <div className="h-3 bg-white border-gray-200 rounded w-1/3" />
      <div className="h-4 w-4 bg-white border-gray-200 rounded" />
    </div>
    <div className="h-8 bg-white border-gray-200 rounded w-1/2 mt-auto relative z-10" />
  </div>
);

export const TableSkeleton = ({ rows = 5 }) => (
  <div className="w-full text-left border-collapse bg-white border border-gray-200 rounded-xl overflow-hidden">
    <div className="p-4 border-b border-gray-200 bg-gray-50 flex gap-4">
      <div className="h-3 bg-gray-200 rounded w-1/3" />
      <div className="h-3 bg-gray-200 rounded w-1/4" />
      <div className="h-3 bg-gray-200 rounded w-1/4" />
    </div>
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-4 relative overflow-hidden h-[72px]">
          <motion.div 
            initial={{ x: "-100%" }}
            animate={{ x: "200%" }}
            transition={{ ...shimmerTransition, delay: i * 0.1 }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent w-full z-20" 
          />
          <div className="h-4 bg-gray-100 rounded w-1/3 relative z-10" />
          <div className="h-4 bg-gray-100 rounded w-1/4 relative z-10" />
          <div className="h-4 bg-gray-100 rounded w-1/4 relative z-10" />
        </div>
      ))}
    </div>
  </div>
);

export const MetricSkeleton = () => (
  <div className="bg-white border border-gray-200 p-4 rounded-xl flex flex-col justify-between relative overflow-hidden h-[104px]">
    <motion.div 
      initial={{ x: "-100%" }}
      animate={{ x: "200%" }}
      transition={shimmerTransition}
      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent w-full" 
    />
    <div className="flex justify-between items-start mb-2 relative z-10">
      <div className="h-2 bg-white border-gray-200 rounded w-1/2" />
      <div className="h-3 w-3 bg-white border-gray-200 rounded" />
    </div>
    <div className="h-6 bg-white border-gray-200 rounded w-1/3 relative z-10" />
  </div>
);

export const AIThinkingSkeleton = ({ status }) => (
  <div className="flex-1 flex flex-col items-center justify-center mt-4 bg-gray-50 border border-gray-200 rounded-xl p-6 w-full">
    <div className="relative w-16 h-16 mb-6">
       <div className="absolute inset-0 rounded-full border-t-2 border-blue-500 animate-spin"></div>
       <div className="absolute inset-2 rounded-full border-b-2 border-purple-500 animate-[spin_2s_linear_reverse]"></div>
       <div className="absolute inset-0 m-auto w-6 h-6 bg-blue-400 rounded-full blur-[8px] animate-pulse"></div>
    </div>
    <p className="text-sm font-bold tracking-wide text-blue-400 uppercase animate-pulse">{status || "Processing..."}</p>
    
    <div className="w-full mt-8 space-y-3 opacity-20">
      <div className="h-3 bg-blue-300 rounded w-3/4 animate-pulse"></div>
      <div className="h-3 bg-blue-300 rounded w-full animate-pulse"></div>
      <div className="h-3 bg-blue-300 rounded w-5/6 animate-pulse"></div>
    </div>
  </div>
);
