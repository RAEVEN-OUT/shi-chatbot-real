'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/utils/dateFormatter';
import { domainService } from '@/services/domainService';
import { failedQuestionService } from '@/services/failedQuestionService';
import { chatbotService } from '@/services/chatbotService';
import { MessageSquare, CheckCircle2, Globe, Activity, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';


export default function Home() {
  const { userData, currentUser } = useAuth();
  const customTimeStamp = userData?.custom_time_stamp;
  const [stats, setStats] = useState({
    totalChats: 0,
    successRate: 0,
    activeDomains: 0,
    messagesToday: 0
  });
  const [recentFailed, setRecentFailed] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const hasFetched = React.useRef(false);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [domains, failed, conversations, analyticsData] = await Promise.all([
          domainService.listDomains(),
          failedQuestionService.listFailedQuestions(),
          chatbotService.listConversations(),
          chatbotService.getAnalyticsSummary()
        ]);

        const domainsList = domains || [];
        const failedList = failed?.data || failed || [];
        const conversationsList = conversations || [];

        // Calculate stats
        const active = domainsList.filter(d => d.is_active).length;
        const total = conversationsList.length;
        const aiResolved = conversationsList.filter(c => c.resolution_type === 'AI').length;
        const humanResolved = conversationsList.filter(c => c.resolution_type === 'HUMAN').length;
        
        const totalInteractions = total + failedList.length;
        const success = totalInteractions > 0 
          ? Math.round(((aiResolved + humanResolved) / totalInteractions) * 100) 
          : 0;

        // Filter messages today
        const todayStr = new Date().toDateString();
        const todayMsgs = conversationsList.filter(c => {
          if (!c.created_at) return false;
          return new Date(c.created_at).toDateString() === todayStr;
        }).length;

        setStats({
          totalChats: total,
          successRate: `${success}%`,
          activeDomains: active,
          messagesToday: todayMsgs
        });
        
        setRecentFailed(failedList);
        setAnalytics(analyticsData);
      } catch (e) {
        console.error("Error loading dashboard metrics", e);
      } finally {
        setLoading(false);
      }
    };

    if (currentUser && !hasFetched.current) {
      hasFetched.current = true;
      loadDashboardData();
    }
  }, [currentUser]);

  const statCards = [
    { title: 'Messages Today', value: stats.messagesToday, icon: MessageSquare, color: 'text-blue-400', bg: 'bg-blue-400/20' },
    { title: 'Pending Failed Qs', value: recentFailed.length, icon: Activity, color: 'text-amber-400', bg: 'bg-amber-400/20' },
    { title: 'Active Domains', value: stats.activeDomains, icon: Globe, color: 'text-emerald-400', bg: 'bg-emerald-400/20' },
    { title: 'Success Rate', value: stats.successRate, icon: CheckCircle2, color: 'text-purple-400', bg: 'bg-purple-400/20' },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Hero */}
      <div className="bg-white p-8 rounded-3xl relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
            Welcome back{(() => {
              const name = userData?.display_name || userData?.name || currentUser?.displayName || (currentUser?.email ? currentUser.email : '');
              return name && name.toLowerCase() !== 'subscriber' ? `, ${name}` : '';
            })()}
          </h1>
          <p className="text-gray-500 max-w-lg mb-6">
            Here's what's happening with your AI support chatbots today.
          </p>
          <div className="flex gap-4">
            <Link href="/domains" className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white font-medium rounded-xl transition-colors">
              Manage Domains
            </Link>
            <Link href="/failed-questions" className="px-6 py-2.5 bg-white border-gray-200 hover:bg-white border-gray-200 text-gray-900 border border-gray-200 font-medium rounded-xl transition-colors">
              Review Failed Qs
            </Link>
          </div>
        </div>
        
        {/* Decorative orb inside card */}
        <div className="absolute right-0 top-0 w-64 h-64 bg-gradient-to-br from-primary/30 to-secondary/30 blur-[80px] rounded-full translate-x-1/3 -translate-y-1/3 pointer-events-none"></div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="bg-white p-6 rounded-2xl flex items-center gap-5">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color} shrink-0`}>
                <Icon size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 leading-none">{stat.value}</p>
                <p className="text-sm text-gray-500 mt-1">{stat.title}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Access Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Failed Questions Alert */}
        <div className="bg-white rounded-2xl overflow-hidden flex flex-col border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Needs Attention</h3>
            <Link href="/failed-questions" className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 font-medium">
              View All <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="flex-1 p-0 overflow-y-auto max-h-80">
            {recentFailed.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <CheckCircle2 size={32} className="mx-auto mb-3 text-emerald-500/50" />
                <p>All caught up! No failed questions.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {recentFailed.slice(0, 5).map(fq => (
                  <div key={fq.id} className="p-4 hover:bg-white border-gray-200 transition-colors">
                    <p className="text-sm font-medium text-gray-900 mb-1 break-all" style={{wordBreak: 'break-word', overflowWrap: 'anywhere'}} title={fq.customer_question}>"{fq.customer_question}"</p>
                    <p className="text-xs text-gray-500">{fq.created_at ? formatDate(fq.created_at, customTimeStamp) : 'N/A'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Support Analytics Teaser */}
        <div className="bg-white rounded-2xl overflow-hidden flex flex-col border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Support Insights</h3>
            <Link href="/analytics" className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 font-medium">
              Full Analytics <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="flex-1 p-6 flex flex-col justify-center">
            {analytics ? (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-500">FAQ Verified Matches</span>
                    <span className="text-gray-900 font-bold">{analytics.faqResolved}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${analytics.totalQueries > 0 ? (analytics.faqResolved/analytics.totalQueries)*100 : 0}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-500">AI Generative Fallbacks</span>
                    <span className="text-gray-900 font-bold">{analytics.aiResolved}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${analytics.totalQueries > 0 ? (analytics.aiResolved/analytics.totalQueries)*100 : 0}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-500">Spam Blocks</span>
                    <span className="text-gray-900 font-bold">{analytics.spamCount}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-red-500 h-2 rounded-full" style={{ width: `${analytics.totalQueries > 0 ? (analytics.spamCount/analytics.totalQueries)*100 : 0}%` }}></div>
                  </div>
                </div>
                <div className="pt-4 text-center">
                   <Link href="/analytics" className="inline-block px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors shadow-sm">
                      View Detailed Analytics
                   </Link>
                </div>
              </div>
            ) : (
              <div className="flex-1 p-8 flex flex-col items-center justify-center text-center">
                 <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                 <p className="text-gray-500 text-sm">Loading insights...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
