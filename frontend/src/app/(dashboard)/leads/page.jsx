'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/utils/dateFormatter';
import { chatbotService } from '@/services/chatbotService';
import { domainService } from '@/services/domainService';
import { Users, Mail, Phone, Calendar, Tag, Search } from 'lucide-react';
import { TableSkeleton } from '@/components/loaders/Skeletons';

export default function Leads() {
  const { currentUser, userData } = useAuth();
  const customTimeStamp = userData?.custom_time_stamp;
  
  const [leads, setLeads] = useState([]);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, total_pages: 1 });

  const loadDomains = async () => {
    try {
      const data = await domainService.listDomainNames();
      setDomains(data || []);
    } catch (e) {
      console.error("Failed to load domains", e);
    }
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await chatbotService.listLeadsTable({
        page,
        page_size: 20,
        domain_id: selectedDomainId || undefined,
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
    if (currentUser) {
      loadDomains();
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchLeads();
    }
  }, [currentUser, page, selectedDomainId, searchQuery]);

  const getDomainName = (domainId) => {
    const domain = domains.find(d => d.id === domainId || d.domain_id === domainId);
    return domain ? (domain.name || domain.domain_name) : 'Unknown Domain';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Members List</h1>
          <p className="text-gray-500 text-sm mt-1">Review contact information captured across all domains.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* Domain Filter */}
          <select
            className="bg-white border-gray-200 border rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500/50 min-w-[200px]"
            value={selectedDomainId}
            onChange={(e) => {
              setSelectedDomainId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Domains</option>
            {domains.map(d => (
              <option key={d.id} value={d.id}>{d.name || d.domain_name}</option>
            ))}
          </select>
          
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
            <input
              type="text"
              placeholder="Search name/email/phone..."
              className="w-full bg-white border-gray-200 border rounded-xl pl-9 pr-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500/50"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : leads.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-gray-50 border border-gray-200 text-gray-400 rounded-full flex items-center justify-center mb-4">
              <Users size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">No leads found</h3>
            <p className="text-gray-500 text-sm">Leads will be collected automatically or adjust your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Domain</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Session ID</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Captured Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map(lead => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm font-semibold text-blue-600">
                      {getDomainName(lead.domain_id)}
                    </td>
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
