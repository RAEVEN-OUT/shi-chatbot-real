'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { useAuth } from '@/contexts/AuthContext';
import { domainService } from '@/services/domainService';
import { ArrowLeft, Settings, MessageSquare, PieChart, Code, Network, Users } from 'lucide-react';

// Tab Components (placeholders for now)
import OverviewTab from './tabs/OverviewTab';
import FaqsTab from './tabs/FaqsTab';
import WidgetStyleTab from './tabs/WidgetStyleTab';
import AnalyticsTab from './tabs/AnalyticsTab';
import FaqHierarchyManager from './FaqHierarchyManager';
import LeadCollectionTab from './tabs/LeadCollectionTab';
import DomainLeadsTab from './tabs/DomainLeadsTab';



export default function DomainDetail() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const [domain, setDomain] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser || !id) return;
    const fetchDomain = async () => {
      try {
        const data = await domainService.listDomains();
        const found = data.find(d => d.id === id);
        setDomain(found || null);
      } catch (e) {
        console.error("Failed to load domain", e);
        setDomain(null);
      } finally {
        setLoading(false);
      }
    };
    fetchDomain();
  }, [id, currentUser]);

  if (loading) return <div className="p-12 text-center text-gray-900"><div className="w-8 h-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  if (!domain) return <div className="p-12 text-center text-gray-500">Domain not found or unauthorized.</div>;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: PieChart },
    { id: 'faqs', label: 'FAQ Categories', icon: MessageSquare },
    { id: 'hierarchy', label: 'FAQ Workspace', icon: Network },
    { id: 'widget', label: 'Widget & Embed', icon: Settings },
    { id: 'analytics', label: 'Analytics', icon: PieChart },
    { id: 'lead_collection', label: 'Lead Settings', icon: Settings },
    { id: 'captured_leads', label: 'Captured Leads', icon: Users },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/domains" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 w-fit mb-4 transition-colors">
          <ArrowLeft size={16} /> Back to Domains
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              {domain.name}
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${domain.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-500'}`}>
                {domain.is_active ? 'Active' : 'Disabled'}
              </span>
            </h1>
            <p className="text-gray-500 text-sm mt-1">{domain.domain_url}</p>
          </div>
        </div>
      </div>


      {/* Tabs Navigation */}
      <div className="flex overflow-x-auto hide-scrollbar border-b border-gray-200">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                isActive ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-white/20'
              }`}
            >
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="py-4">
        {activeTab === 'overview' && <OverviewTab domain={domain} />}
        {activeTab === 'faqs' && <FaqsTab domain={domain} />}
        {activeTab === 'hierarchy' && (
          <div className="h-[75vh] min-h-[600px] border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <FaqHierarchyManager scopedDomainId={domain.id} />
          </div>
        )}
        {activeTab === 'widget' && <WidgetStyleTab domain={domain} />}
        {activeTab === 'analytics' && <AnalyticsTab domain={domain} />}
        { activeTab === 'lead_collection' && <LeadCollectionTab domain={domain} />}
        { activeTab === 'captured_leads' && <DomainLeadsTab domain={domain} />}
      </div>
    </div>
  );
}
