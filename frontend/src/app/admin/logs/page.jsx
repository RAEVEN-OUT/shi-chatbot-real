'use client';
import React, { useEffect, useState } from 'react';
import { formatDate } from '@/utils/dateFormatter';
import { useAuth } from '@/contexts/AuthContext';
import { chatbotService } from '@/services/chatbotService';
import { BrainCircuit, Activity, Cpu } from 'lucide-react';
import { TableSkeleton } from '@/components/loaders/Skeletons';

export default function AdminAILogs() {
  const { userData } = useAuth();
  const customTimeStamp = userData?.custom_time_stamp;
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const data = await chatbotService.listAdminAiLogs();
      setLogs(data);
    } catch (e) {
      console.error("Failed to load AI logs", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <BrainCircuit className="text-blue-500" /> AI Fallback Suggest Logs
        </h1>
        <p className="text-gray-500 text-sm mt-1">Review cloud fallback logs, token metrics, and response generation latency.</p>
      </div>

      <div className="bg-white border-gray-200 border border-gray-200 rounded-2xl overflow-hidden shadow-2xl">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : logs.length === 0 ? (
          <div className="p-16 text-center text-gray-500">
            <Cpu size={32} className="mx-auto mb-3 text-gray-600" />
            <p>No generative AI logs recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-white shadow-sm border-gray-200">
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider">Session ID</th>
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider">Prompt Query</th>
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider">AI Fallback Output</th>
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider">Provider</th>
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider">Generated Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-mono text-xs text-primary font-semibold">
                      {log.session_id ? log.session_id.substring(0, 12) + '...' : log.id.substring(0, 12) + '...'}
                    </td>
                    <td className="p-4 text-sm font-medium text-gray-900 max-w-xs truncate" title={log.query}>
                      {log.query}
                    </td>
                    <td className="p-4 text-sm text-gray-500 max-w-sm truncate" title={log.response}>
                      {log.response}
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-0.5 bg-red-100 border border-blue-500/20 rounded-md text-[10px] font-bold uppercase text-gray-500">
                        {log.message_type || 'AI Fallback'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-500">
                      {log.created_at ? formatDate(log.created_at, customTimeStamp) : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
