import React, { useEffect, useState } from 'react';
import { MessageSquareWarning, MessageCircle, Activity, CheckCircle, ShieldAlert, TrendingUp } from 'lucide-react';
import { chatSessionService } from '@/services/chatSessionService';
import { failedQuestionService } from '@/services/failedQuestionService';

export default function AnalyticsTab({ domain }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        // Fetch all sessions for this domain using the existing chat-sessions API
        const [res, spamRes] = await Promise.all([
          chatSessionService.listSessions({
            domain_id: domain.id,
            page_size: 1000, // fetch all sessions
          }),
          failedQuestionService.listSpamQuestions()
        ]);

        // res could be { sessions: [...], total: N } or just an array
        const sessions = Array.isArray(res) ? res : (res.sessions || res.data || []);
        const spamListAll = Array.isArray(spamRes) ? spamRes : (spamRes.data || []);

        // Compute analytics from real session data
        const total = sessions.length;
        const active = sessions.filter(s => s.status === 'active' || s.status === 'open').length;
        const closed = sessions.filter(s => s.status === 'closed').length;
        
        // Compute spam blocks specific to this domain
        const domainSpamList = spamListAll.filter(s => s.domain_id === domain.id);
        const spam = domainSpamList.reduce((acc, curr) => acc + (curr.spam_count || 1), 0);

        // Count total messages across all sessions
        let totalMessages = 0;
        let aiMessages = 0;
        let adminMessages = 0;
        sessions.forEach(s => {
          totalMessages += s.message_count || 0;
          aiMessages += s.ai_message_count || 0;
          adminMessages += s.admin_message_count || 0;
        });

        setStats({
          total_conversations: total,
          active_conversations: active,
          closed_conversations: closed,
          spam_conversations: spam,
          total_messages: totalMessages,
          ai_messages: aiMessages,
          admin_messages: adminMessages,
        });
      } catch (e) {
        console.error('Failed to load analytics', e);
        setError(e);
      } finally {
        setLoading(false);
      }
    };

    if (domain && domain.id) {
      fetchAnalytics();
    }
  }, [domain]);

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-900">
        <div className="w-8 h-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-gray-500 text-sm">Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-12 text-center text-gray-500">
        Failed to load analytics. Please try again later.
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-12 text-center text-gray-500">
        No analytics data available yet.
      </div>
    );
  }

  const metricCards = [
    {
      label: 'Total Conversations',
      value: stats.total_conversations,
      icon: MessageCircle,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    {
      label: 'Active Conversations',
      value: stats.active_conversations,
      icon: Activity,
      color: 'text-emerald-400',
      bg: 'bg-emerald-100',
      border: 'border-emerald-500/20',
    },
    {
      label: 'Closed Conversations',
      value: stats.closed_conversations,
      icon: CheckCircle,
      color: 'text-gray-500',
      bg: 'bg-gray-500/10',
      border: 'border-slate-500/20',
    },
    {
      label: 'Spam Blocks',
      value: stats.spam_conversations,
      icon: ShieldAlert,
      color: 'text-gray-500',
      bg: 'bg-red-100',
      border: 'border-red-500/20',
    },
    {
      label: 'Total Messages',
      value: stats.total_messages,
      icon: TrendingUp,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
    },
    {
      label: 'AI Responses',
      value: stats.ai_messages,
      icon: MessageSquareWarning,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`p-5 rounded-2xl bg-white border ${card.border} hover:scale-[1.02] transition-transform duration-200`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center ${card.color}`}>
                  <Icon size={20} />
                </div>
                <h3 className="text-sm font-medium text-gray-500">{card.label}</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900">{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Summary Insight */}
      {stats.total_conversations > 0 && (
        <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 flex gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
            <TrendingUp size={24} />
          </div>
          <div>
            <h4 className="text-gray-900 font-bold mb-1">Conversation Summary</h4>
            <p className="text-gray-500 text-sm">
              This domain has <span className="text-gray-900 font-semibold">{stats.total_conversations}</span> total conversations
              with <span className="text-emerald-400 font-semibold">{stats.active_conversations}</span> currently active.
              {stats.admin_messages > 0 && (
                <> An admin has responded to <span className="text-gray-900 font-semibold">{stats.admin_messages}</span> messages.</>
              )}
            </p>
          </div>
        </div>
      )}

      {stats.total_conversations === 0 && (
        <div className="p-5 rounded-2xl border border-gray-200 bg-gray-50/50 flex gap-4">
          <div className="w-12 h-12 rounded-xl bg-gray-100/50 flex items-center justify-center text-gray-500 shrink-0">
            <MessageCircle size={24} />
          </div>
          <div>
            <h4 className="text-gray-900 font-bold mb-1">No Conversations Yet</h4>
            <p className="text-gray-500 text-sm">
              No chat sessions have been recorded for this domain yet. Once visitors start interacting with the chatbot widget, analytics will appear here automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
