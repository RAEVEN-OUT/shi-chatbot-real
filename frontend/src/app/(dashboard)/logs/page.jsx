'use client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/utils/dateFormatter';
import React, { useState, useEffect } from 'react';
import { Activity, Search, Shield, ChevronDown, ChevronUp, FileCode2, Clock, Trash2 } from 'lucide-react';
import api from '@/utils/api';
import { useToast } from '@/contexts/ToastContext';
import ModalWrapper from '@/components/ui/ModalWrapper';

export default function SystemLogs() {
  const { userData } = useAuth();
  const customTimeStamp = userData?.custom_time_stamp;
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  const [resourceType, setResourceType] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { showToast } = useToast();

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit });
      if (resourceType && resourceType !== 'All') params.append('resource_type', resourceType);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      
      const res = await api.get(`/audit-logs?${params.toString()}`);
      setLogs(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
      showToast('Failed to fetch system logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, limit, resourceType, startDate, endDate]);

  const filteredLogs = logs.filter(log => 
    (log.admin_message || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.resource_type || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.action || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionColor = (action) => {
    switch (action?.toUpperCase()) {
      case 'CREATE': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'UPDATE': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'DELETE': return 'bg-red-100 text-red-600 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-500 border-slate-500/30';
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-8 animate-fade-in custom-scrollbar">
      {/* Header & Filters */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Activity className="text-blue-500" size={32} />
              System Audit Logs
            </h1>
            <p className="text-gray-500 mt-2">
              Track and monitor all creations, updates, and deletions across your workspace.
            </p>
          </div>
          
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-500" />
            <input
              type="text"
              placeholder="Search current page..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* Server Filters */}
        <div className="flex flex-wrap gap-4 items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div className="flex items-center gap-2">
             <span className="text-sm font-medium text-gray-500">Menu:</span>
             <select 
                value={resourceType} 
                onChange={e => { setResourceType(e.target.value); setPage(1); }} 
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
             >
                <option value="All">All Categories</option>
                <option value="Domain">Domain</option>
                <option value="FAQ Category">FAQ Category</option>
                <option value="FAQ Question">FAQ Question</option>
                <option value="Failed Question">Failed Question</option>
                <option value="Spam Question">Spam Question</option>
                <option value="Conversation">Conversation</option>
                <option value="Bulk Upload">Bulk Upload</option>
                <option value="Widget Style">Widget Style</option>
             </select>
          </div>
          <div className="flex items-center gap-2">
             <span className="text-sm font-medium text-gray-500">Start Date:</span>
             <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex items-center gap-2">
             <span className="text-sm font-medium text-gray-500">End Date:</span>
             <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Resource Type</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Admin Message</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500">Loading logs...</td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500">No logs found matching your criteria.</td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Clock size={14} className="text-gray-500" />
                        {formatDate(log.timestamp, customTimeStamp)}
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border uppercase tracking-wider ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-700">{log.resource_type}</span>
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-gray-800 break-all" style={{wordBreak: 'break-word', overflowWrap: 'anywhere'}} title={log.admin_message}>
                        {log.admin_message}
                      </p>
                    </td>
                    <td className="p-4 whitespace-nowrap text-right">
                      <button 
                        onClick={() => setSelectedLog(log)}
                        className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-blue-400 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5 border border-gray-200 hover:border-slate-600"
                      >
                        <FileCode2 size={14} /> Developer View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
        <p className="text-sm text-gray-500">
          Showing {total === 0 ? 0 : (page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} logs
        </p>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-900 rounded-xl text-sm font-medium transition-colors"
          >
            Previous
          </button>
          <button 
            onClick={() => setPage(p => p + 1)}
            disabled={page * limit >= total}
            className="px-4 py-2 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-900 rounded-xl text-sm font-medium transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {/* Developer Log Modal */}
      {selectedLog && (
        <ModalWrapper
          isOpen={!!selectedLog}
          onClose={() => setSelectedLog(null)}
          title="Developer Log Payload"
          icon={FileCode2}
          iconColor="text-blue-400"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
               <div className="p-3 rounded-xl bg-white border border-gray-200">
                 <p className="text-xs text-gray-500 mb-1">Resource ID</p>
                 <code className="text-sm text-amber-400">{selectedLog.resource_id}</code>
               </div>
               <div className="p-3 rounded-xl bg-white border border-gray-200">
                 <p className="text-xs text-gray-500 mb-1">Actor (UID)</p>
                 <code className="text-sm text-emerald-400 truncate block">{selectedLog.subscriber_uid}</code>
               </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-inner">
              <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500">developer_payload.json</span>
              </div>
              <pre className="p-4 overflow-auto max-h-[400px] text-xs font-mono text-gray-700 custom-scrollbar leading-relaxed">
                {JSON.stringify(selectedLog.developer_payload, null, 2)}
              </pre>
            </div>
            
            <div className="flex justify-end pt-2">
              <button onClick={() => setSelectedLog(null)} className="px-5 py-2 bg-gray-50 hover:bg-gray-100 text-gray-900 rounded-xl text-sm font-medium transition-colors">
                Close
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}
    </div>
  );
}
