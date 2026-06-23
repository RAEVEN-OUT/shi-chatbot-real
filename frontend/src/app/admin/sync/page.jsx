'use client';
import React, { useState } from 'react';
import { RefreshCw, Database, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '@/utils/api';

export default function SyncChroma() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    
    try {
      const response = await api.get('/admin/env/sync-chroma');
      setResult(response.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-lg mx-auto">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 w-full relative overflow-hidden">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-blue-500/10 to-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10"></div>
        
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-blue-100">
          <Database size={32} className="text-blue-500" />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Chroma DB Manual Sync</h1>
        <p className="text-gray-500 text-sm mb-8">
          This is a hidden utility page. Click the button below to fetch all domains and active FAQs from Firebase and rebuild the local Chroma Vector Database.
        </p>
        
        {result && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start text-left gap-3">
            <CheckCircle2 size={24} className="text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-800">Sync Successful</p>
              <p className="text-xs text-emerald-600 mt-1">{result.message}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start text-left gap-3">
            <AlertTriangle size={24} className="text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800">Sync Failed</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
          </div>
        )}

        <button 
          onClick={handleSync}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {loading ? "Rebuilding Vectors..." : "Start Database Sync"}
        </button>
      </div>
    </div>
  );
}
