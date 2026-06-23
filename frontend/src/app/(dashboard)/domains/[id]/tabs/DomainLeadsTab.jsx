import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/utils/dateFormatter';
import { chatbotService } from '@/services/chatbotService';
import { Users, Mail, Phone, Tag, Search } from 'lucide-react';
import { TableSkeleton } from '@/components/loaders/Skeletons';

export default function DomainLeadsTab({ domain }) {
  const { currentUser, userData } = useAuth();
  const customTimeStamp = userData?.custom_time_stamp;
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, total_pages: 1 });

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await chatbotService.listLeads({
        domain_id: domain.id,
        page,
        page_size: 20,
        search: searchQuery.trim() || undefined
      });
      if (res.data) {
        setLeads(res.data);
        setPagination(res.pagination || { page: 1, total_pages: 1 });
      } else {
        setLeads(res || []);
      }
    } catch (e) {
      console.error("Failed to fetch leads", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && domain?.id) {
      fetchLeads();
    }
  }, [currentUser, domain?.id, page, searchQuery]);

  return (
    <div className="bg-white rounded-3xl p-6 border border-gray-200">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Captured Leads</h2>
          <p className="text-gray-500 text-sm mt-1">Review contact information captured for this domain.</p>
        </div>
        
        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
          <input
            type="text"
            placeholder="Search name/email/phone..."
            className="w-full bg-gray-50 border-gray-200 border rounded-xl pl-9 pr-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500/50"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : leads.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center bg-gray-50">
            <div className="w-16 h-16 bg-white border border-gray-200 text-gray-400 rounded-full flex items-center justify-center mb-4">
              <Users size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">No leads captured yet</h3>
            <p className="text-gray-500 text-sm">Leads will appear here when customers submit their details.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Session ID</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Captured Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {leads.map(lead => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm font-semibold text-gray-900">
                      {lead.name}
                    </td>
                    <td className="p-4 text-sm text-gray-700">
                      <div className="flex items-center gap-2">
                        <Mail size={14} className="text-gray-400" />
                        {lead.email}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-gray-700">
                      {lead.phone ? (
                        <div className="flex items-center gap-2">
                          <Phone size={14} className="text-gray-400" />
                          {lead.phone}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-4 font-mono text-xs text-gray-500">
                      {lead.session_id}
                    </td>
                    <td className="p-4 text-sm text-gray-500">
                      {lead.created_at ? formatDate(lead.created_at, customTimeStamp) : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="p-4 border-t border-gray-200 flex justify-between items-center text-sm bg-gray-50">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <span className="text-gray-500 font-medium">Page {page} of {pagination.total_pages}</span>
            <button
              disabled={page >= pagination.total_pages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
