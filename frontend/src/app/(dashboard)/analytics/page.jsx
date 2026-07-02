'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { chatbotService } from '@/services/chatbotService';
import { failedQuestionService } from '@/services/failedQuestionService';
import { BarChart3, TrendingUp, HelpCircle, AlertTriangle } from 'lucide-react';

export default function Analytics() {
  const { currentUser } = useAuth();
  
  const [summary, setSummary] = useState({
    totalQueries: 0,
    faqResolved: 0,
    aiResolved: 0,
    humanResolved: 0,
    failedQsCount: 0,
    spamCount: 0,
    totalLeads: 0,
    utmSourceCounts: {},
    utmMediumCounts: {}
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const data = await chatbotService.getAnalyticsSummary();
        if (data) {
          setSummary(data);
        }
      } catch (e) {
        console.error("Error fetching analytics summary", e);
      } finally {
        setLoading(false);
      }
    };
    if (currentUser) {
      fetchAnalytics();
    }
  }, [currentUser?.uid]);

  if (loading) {
    return <div className="text-gray-500 p-8">Loading analytics reports...</div>;
  }

  const { totalQueries, faqResolved, aiResolved, humanResolved, failedQsCount, spamCount, totalLeads } = summary;
  const totalInteractions = totalQueries + failedQsCount;
  
  const successRate = totalInteractions > 0 
    ? Math.round(((faqResolved + aiResolved) / totalInteractions) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">Track chat volumes, AI performance efficiency, and search accuracy metrics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <BarChart3 size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{totalQueries}</p>
            <p className="text-sm text-gray-500">Total Conversations</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-400 flex items-center justify-center">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{successRate}%</p>
            <p className="text-sm text-gray-500">Resolution Rate</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <HelpCircle size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{faqResolved}</p>
            <p className="text-sm text-gray-500">Direct FAQ Matches</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{failedQsCount}</p>
            <p className="text-sm text-gray-500">Pending Failed Queries</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* breakdown card */}
        <div className="bg-white p-6 rounded-3xl space-y-6">
          <h3 className="font-bold text-lg text-gray-900">Interaction Classification</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-500">FAQ Verified Matches</span>
                <span className="text-gray-900 font-bold">{faqResolved}</span>
              </div>
              <div className="w-full bg-white border-gray-200 rounded-full h-2">
                <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${totalQueries > 0 ? (faqResolved/totalQueries)*100 : 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-500">AI Generative Fallbacks</span>
                <span className="text-gray-900 font-bold">{aiResolved}</span>
              </div>
              <div className="w-full bg-white border-gray-200 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${totalQueries > 0 ? (aiResolved/totalQueries)*100 : 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-500">Spam Blocks</span>
                <span className="text-gray-900 font-bold">{spamCount}</span>
              </div>
              <div className="w-full bg-white border-gray-200 rounded-full h-2">
                <div className="bg-red-500 h-2 rounded-full" style={{ width: `${totalQueries > 0 ? (spamCount/totalQueries)*100 : 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-500">Human Resolved (Admin Messages)</span>
                <span className="text-gray-900 font-bold">{humanResolved}</span>
              </div>
              <div className="w-full bg-white border-gray-200 rounded-full h-2">
                <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${totalQueries > 0 ? (humanResolved/totalQueries)*100 : 0}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Lead Statistics */}
        <div className="bg-white p-6 rounded-3xl space-y-6">
          <h3 className="font-bold text-lg text-gray-900">Lead Collection</h3>
          
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex items-center justify-between">
              <span className="text-gray-500 font-semibold text-sm">Total Leads Captured</span>
              <span className="text-xl font-bold text-gray-900">{totalLeads}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
