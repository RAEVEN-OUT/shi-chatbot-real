'use client';
import React, { useState, useEffect } from 'react';
import { analyticsService } from '@/services/analyticsService';
import { Activity, Users, Globe, Database, Server, Cpu, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import api from '@/utils/api';

export default function AdminOverview() {
  const [stats, setStats] = useState({
    total_subscribers: 0,
    active_domains: 0,
    messages_today: 0,
    total_vectors: 0,
    chart_data: []
  });
  const [loading, setLoading] = useState(true);
  
  const [apiKeys, setApiKeys] = useState(null);
  const [testingKeys, setTestingKeys] = useState(false);
  const [testCooldownError, setTestCooldownError] = useState("");
  const hasFetched = React.useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const fetchStats = async () => {
      try {
        const data = await analyticsService.getAdminStats();
        setStats(data);
      } catch (e) {
        console.error("Failed to load admin telemetry stats:", e);
      } finally {
        setLoading(false);
      }
    };
    
    const fetchKeyStatus = async () => {
      try {
        const res = await api.get('/admin/env/key-status');
        setApiKeys(res.data);
      } catch (e) {
        console.error("Failed to load api key status:", e);
      }
    };

    fetchStats();
    fetchKeyStatus();
  }, []);

  const handleTestKeys = async () => {
    setTestingKeys(true);
    setTestCooldownError("");
    try {
      const res = await api.post('/admin/env/test-keys');
      setApiKeys(res.data);
    } catch (e) {
      if (e.response?.status === 429) {
         setTestCooldownError(e.response.data.detail || "Please wait 15 minutes before testing again.");
      } else {
         console.error("Error testing keys:", e);
         setTestCooldownError("Error testing keys. Check console.");
      }
    } finally {
      setTestingKeys(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Activity className="text-blue-500" /> Platform Operations
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl">
          <div className="flex items-center gap-3 text-gray-500 mb-2">
            <Users size={18} className="text-gray-500" />
            <span className="text-sm font-bold uppercase tracking-wider">Total Subscribers</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {loading ? '...' : stats.total_subscribers}
          </p>
          <p className="text-xs text-blue-600 mt-1 font-bold">Active users</p>
        </div>
        <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl">
          <div className="flex items-center gap-3 text-gray-500 mb-2">
            <Globe size={18} className="text-gray-500" />
            <span className="text-sm font-bold uppercase tracking-wider">Active Domains</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {loading ? '...' : stats.active_domains}
          </p>
          <p className="text-xs text-blue-600 mt-1 font-bold">Live configurations</p>
        </div>
        <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl">
          <div className="flex items-center gap-3 text-gray-500 mb-2">
            <Activity size={18} className="text-gray-500" />
            <span className="text-sm font-bold uppercase tracking-wider">Messages Today</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {loading ? '...' : stats.messages_today}
          </p>
          <p className="text-xs text-amber-400 mt-1 font-bold">Logged today</p>
        </div>
      </div>

      {apiKeys && (
        <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl mt-6 max-w-3xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
            <div className="flex items-center gap-3 text-gray-900">
              <Cpu size={20} className="text-blue-500" />
              <h2 className="text-lg font-bold">AI API Status</h2>
            </div>
            <button 
              onClick={handleTestKeys} 
              disabled={testingKeys}
              className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-900 rounded-xl font-medium transition-all shadow-sm text-sm border border-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${testingKeys ? 'animate-spin' : ''}`} /> 
              {testingKeys ? 'Testing APIs...' : 'Test & Reload Keys'}
            </button>
          </div>
          
          {testCooldownError && (
             <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p>{testCooldownError}</p>
             </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(apiKeys).map(([key, info]) => (
              <div key={key} className="border border-gray-100 bg-gray-50 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">{info.provider}</p>
                  {info.error && <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={info.error}>{info.error}</p>}
                </div>
                <div>
                  {info.status === 'active' ? (
                    <span className="flex items-center gap-1 text-xs font-bold bg-emerald-100 text-emerald-600 px-2.5 py-1 rounded-full">
                      <CheckCircle2 size={12} /> ACTIVE
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-bold bg-red-100 text-red-600 px-2.5 py-1 rounded-full">
                      <AlertTriangle size={12} /> EXPIRED
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Status is read directly from memory (no API requests are made unless you click Reload). 
            Testing is limited to once every 15 minutes to prevent unnecessary usage.
          </p>
        </div>
      )}

    </div>
  );
}
