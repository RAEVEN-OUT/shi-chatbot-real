'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/utils/dateFormatter';
import { failedQuestionService } from '@/services/failedQuestionService';
import { domainService } from '@/services/domainService';
import { AlertOctagon, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { TableSkeleton } from '@/components/loaders/Skeletons';
import { useToast } from '@/contexts/ToastContext';
import { confirmAction } from '@/utils/confirm';

export default function SpamQuestions() {
  const { currentUser, userData } = useAuth();
  const customTimeStamp = userData?.custom_time_stamp;
  const toast = useToast();
  const [spamList, setSpamList] = useState([]);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedSpam, setSelectedSpam] = useState(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const fetchSpam = async () => {
    try {
      const data = await failedQuestionService.listSpamQuestions();
      setSpamList(data);
    } catch (e) {
      console.error("Failed to fetch spam logs", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDomains = async () => {
    try {
      const data = await domainService.listDomains();
      setDomains(data || []);
    } catch (e) {
      console.error("Failed to load domains", e);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchSpam();
      fetchDomains();
    }
  }, [currentUser]);

  const handleDelete = async (id) => {
    const confirmed = await confirmAction({
      title: "Delete Spam Log",
      text: "Are you sure you want to delete this spam log?",
      confirmButtonText: "Yes, delete"
    });
    if (!confirmed) return;
    try {
      await failedQuestionService.deleteSpamQuestion(id);
      fetchSpam();
      toast.success("Spam log deleted successfully");
    } catch (e) {
      console.error(e);
      toast.error("Error deleting spam log");
    }
  };

  const handleSelectSpam = (id) => {
    const newSelected = new Set(selectedSpam);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedSpam(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedSpam.size === spamList.length) {
      setSelectedSpam(new Set());
    } else {
      setSelectedSpam(new Set(spamList.map(s => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSpam.size === 0) return;
    const confirmed = await confirmAction({
      title: "Delete Selected Logs",
      text: `Are you sure you want to delete ${selectedSpam.size} selected spam logs?`,
      confirmButtonText: "Yes, delete them"
    });
    if (!confirmed) return;
    
    setIsBulkDeleting(true);
    try {
      const res = await failedQuestionService.bulkDeleteSpam({ ids: Array.from(selectedSpam) });
      setSelectedSpam(new Set());
      fetchSpam();
      if (res.details && res.details.failed && res.details.failed.length > 0) {
        if (res.details.success && res.details.success.length > 0) {
          toast.warning(res.message);
        } else {
          toast.error(res.details.failed[0].error || res.message || "Failed to delete spam logs");
        }
      } else {
        toast.success(res.message || `${selectedSpam.size} spam logs deleted`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.message || "Failed to delete spam logs");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Spam Protection Logs</h1>
          <p className="text-gray-500 text-sm mt-1">Review questions flagged as spam, nonsense, or abusive by your chatbot's built-in filters.</p>
        </div>
        {selectedSpam.size > 0 && (
          <button 
            onClick={handleBulkDelete}
            disabled={isBulkDeleting}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-red-50 text-red-600 rounded-xl font-medium transition-colors"
          >
            {isBulkDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            <span className="hidden sm:inline">Delete Selected ({selectedSpam.size})</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl overflow-hidden">
        {loading ? (
          <TableSkeleton rows={4} />
        ) : spamList.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-400 rounded-full flex items-center justify-center mb-4">
              <CheckCircle size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">No spam detected!</h3>
            <p className="text-gray-500">All chatbot interactions are clean and clear of filtered abuse.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-white">
                  <th className="p-4 text-left w-12">
                    <input 
                      type="checkbox"
                      checked={spamList.length > 0 && selectedSpam.size === spamList.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Filtered Text</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Domain</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Spam Count</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Blocked</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {spamList.map(s => {
                  const domain = domains.find(d => d.id === s.domain_id);
                  const domainName = domain ? domain.name : (s.domain_id || 'N/A');
                  return (
                    <tr key={s.id} className={`hover:bg-gray-50 transition-colors ${selectedSpam.has(s.id) ? 'bg-blue-50/50' : ''}`}>
                      <td className="p-4">
                        <input 
                          type="checkbox"
                          checked={selectedSpam.has(s.id)}
                          onChange={() => handleSelectSpam(s.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-medium text-gray-500 max-w-sm truncate" title={s.customer_question}>{s.customer_question}</p>
                      </td>
                      <td className="p-4 text-sm text-gray-700">
                        {domainName}
                      </td>
                      <td className="p-4 text-center text-sm font-bold text-gray-500">
                        {s.spam_count || 1}
                      </td>
                      <td className="p-4 text-sm text-gray-500">
                        {s.created_at ? formatDate(s.created_at, customTimeStamp) : 'N/A'}
                      </td>
                      <td className="p-4 text-right flex items-center justify-end">
                        <button 
                          onClick={() => handleDelete(s.id)}
                          className="p-2 bg-white border-gray-200 hover:bg-red-500/20 hover:text-gray-500 text-gray-700 rounded-xl transition-colors"
                          title="Delete log"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
