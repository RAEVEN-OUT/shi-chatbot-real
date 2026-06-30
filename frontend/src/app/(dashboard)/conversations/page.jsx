'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate, formatTime } from '@/utils/dateFormatter';
import { chatSessionService } from '@/services/chatSessionService';
import { domainService } from '@/services/domainService';
import {
  MessageSquare, Calendar, User, Mail, Phone, Tag, Search,
  Clock, Send, Bot, Check, ShieldAlert, CheckCheck, XCircle,
  Sparkles, RefreshCw, Power, PowerOff, HelpCircle, Archive,
  Trash2, Square, CheckSquare
} from 'lucide-react';
import { TableSkeleton } from '@/components/loaders/Skeletons';
import { useToast } from '@/contexts/ToastContext';

export default function Conversations() {
  const { currentUser, userData } = useAuth();
  const { showToast } = useToast();
  const customTimeStamp = userData?.custom_time_stamp;
  const [sessions, setSessions] = useState([]);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loadingSessionDetail, setLoadingSessionDetail] = useState(false);

  // Bulk Delete State
  const [selectedSessions, setSelectedSessions] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [statusTab, setStatusTab] = useState('active');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, total_pages: 1 });

  // Input states
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  // Action loading states
  const [togglingAI, setTogglingAI] = useState(false);
  const [closingSession, setClosingSession] = useState(false);
  const [togglingSpam, setTogglingSpam] = useState(false);

  // Unread indicators per tab
  const [unreadByTab, setUnreadByTab] = useState({ active: false, closed: false, spam: false, all: false });
  const [wsTrigger, setWsTrigger] = useState(0);

  const messagesEndRef = useRef(null);
  const dashboardWsRef = useRef(null);
  const sessionWsRef = useRef(null);
  const dashboardWsReconnectRef = useRef(null);
  const sessionWsReconnectRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // ─── Initial data load ────────────────────────────────────────────────────

  useEffect(() => {
    if (currentUser) {
      loadDomains();
      loadSessions();
    }
  }, [currentUser?.uid, selectedDomainId, statusTab, searchQuery, page, wsTrigger]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedSession?.messages_json]);

  // ─── Dashboard WebSocket (conversation list updates) ──────────────────────

  const connectDashboardWs = useCallback(() => {
    if (!currentUser) return;

    const baseUrl = process.env.NEXT_PUBLIC_WITHOUT_API_URL
      || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '');
    const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/ws/admin/dashboard';

    const ws = new WebSocket(wsUrl);
    dashboardWsRef.current = ws;

    ws.onopen = () => {
      // Clear any pending reconnect timer
      if (dashboardWsReconnectRef.current) {
        clearTimeout(dashboardWsReconnectRef.current);
        dashboardWsReconnectRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'conversation_update') {
          // Trigger a lightweight background reload of the active sessions list
          // so tabs, unread counts, and session sorting stay perfectly synced.
          setWsTrigger(prev => prev + 1);
        }
      } catch (err) {
        console.error('Dashboard WS parse error', err);
      }
    };

    ws.onclose = () => {
      // Reconnect after 3 s and do a single background fetch to catch up
      dashboardWsReconnectRef.current = setTimeout(() => {
        loadSessions(); // catch-up fetch after disconnect
        connectDashboardWs();
      }, 3000);
    };

    ws.onerror = () => ws.close();
  }, [currentUser]);

  useEffect(() => {
    connectDashboardWs();
    return () => {
      dashboardWsRef.current?.close();
      if (dashboardWsReconnectRef.current) clearTimeout(dashboardWsReconnectRef.current);
    };
  }, [connectDashboardWs]);

  // ─── Session WebSocket (active conversation messages) ─────────────────────

  useEffect(() => {
    // Tear down previous session WS
    if (sessionWsRef.current) {
      sessionWsRef.current.onclose = null;
      sessionWsRef.current.close();
      sessionWsRef.current = null;
    }
    if (sessionWsReconnectRef.current) {
      clearTimeout(sessionWsReconnectRef.current);
      sessionWsReconnectRef.current = null;
    }

    if (!selectedSessionId) return;

    // Load messages from DB immediately (initial load / recovery)
    loadActiveSession(selectedSessionId);

    const connectSessionWs = () => {
      const baseUrl = process.env.NEXT_PUBLIC_WITHOUT_API_URL
        || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '');
      const wsUrl = baseUrl.replace(/^http/, 'ws') + `/api/ws/admin/chat/${selectedSessionId}`;

      const ws = new WebSocket(wsUrl);
      sessionWsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message' && data.message) {
            // Append message to active conversation — WebSocket is source of truth
            setSelectedSession(prev => {
              if (!prev) return prev;
              const exists = prev.messages_json?.find(m => m.id === data.message.id);
              if (exists) return prev;
              return {
                ...prev,
                messages_json: [...(prev.messages_json || []), data.message]
              };
            });

            // Clear unread badge for active session when admin is viewing it
            if (data.message.sender === 'user' || data.message.sender === 'customer') {
              chatSessionService.markRead(selectedSessionId).catch(console.error);
            }
          }
        } catch (err) {
          console.error('Session WS parse error', err);
        }
      };

      ws.onclose = () => {
        // On disconnect: reconnect and do a one-time recovery fetch
        sessionWsReconnectRef.current = setTimeout(() => {
          loadActiveSession(selectedSessionId, true); // silent catch-up
          connectSessionWs();
        }, 3000);
      };

      ws.onerror = () => ws.close();
    };

    connectSessionWs();

    return () => {
      if (sessionWsRef.current) {
        sessionWsRef.current.onclose = null;
        sessionWsRef.current.close();
      }
      if (sessionWsReconnectRef.current) clearTimeout(sessionWsReconnectRef.current);
    };
  }, [selectedSessionId]);

  // ─── Data loaders ─────────────────────────────────────────────────────────

  const loadDomains = async () => {
    try {
      const data = await domainService.listDomains();
      setDomains(data || []);
    } catch (e) {
      console.error('Failed to load domains', e);
    }
  };

  const loadSessions = async () => {
    try {
      const params = {
        page,
        page_size: 20,
        status: statusTab === 'all' ? undefined : statusTab,
        domain_id: selectedDomainId || undefined,
        search: searchQuery.trim() || undefined
      };
      const res = await chatSessionService.listSessions(params);
      setSessions(res.data || []);
      setPagination(res.pagination || { page: 1, total_pages: 1 });
      if (res.unreadCounts) setUnreadByTab(res.unreadCounts);
    } catch (e) {
      console.error('Failed to load sessions', e);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveSession = async (sessionId, isSilent = false) => {
    if (!isSilent) setLoadingSessionDetail(true);
    try {
      const res = await chatSessionService.getSession(sessionId);
      if (res?.success && res?.data) {
        setSelectedSession(res.data);
        setSessions(prevSessions =>
          prevSessions.map(s =>
            s.session_id === sessionId
              ? {
                  ...s,
                  customer_name: res.data.customer_name,
                  last_message: res.data.last_message,
                  unread_admin_count: 0
                }
              : s
          )
        );
        // Trigger a background refresh to instantly clear the unread blue dot from tabs
        setWsTrigger(prev => prev + 1);
      }
    } catch (e) {
      console.error('Failed to load active session details', e);
    } finally {
      if (!isSilent) setLoadingSessionDetail(false);
    }
  };

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || sending || !selectedSessionId) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (sessionWsRef.current?.readyState === WebSocket.OPEN) {
      sessionWsRef.current.send(JSON.stringify({ type: 'typing_stopped' }));
    }

    setSending(true);
    try {
      const text = replyText.trim();
      setReplyText('');
      await chatSessionService.sendAdminMessage(selectedSessionId, text);
      // The admin message will arrive via Redis → session WS → state update.
      // No manual list reload needed.
    } catch (e) {
      console.error('Failed to send admin reply', e);
    } finally {
      setSending(false);
    }
  };

  const handleToggleAI = async () => {
    if (!selectedSession || togglingAI) return;
    const nextVal = !selectedSession.ai_enabled;
    setTogglingAI(true);
    try {
      await chatSessionService.updateSession(selectedSessionId, { ai_enabled: nextVal });
      setSelectedSession(prev => ({ ...prev, ai_enabled: nextVal }));
      setSessions(prevSessions =>
        prevSessions.map(s =>
          s.session_id === selectedSessionId
            ? { ...s, ai_enabled: nextVal }
            : s
        )
      );
    } catch (e) {
      console.error('Failed to toggle AI', e);
    } finally {
      setTogglingAI(false);
    }
  };

  const handleCloseSession = async () => {
    if (!selectedSessionId || closingSession) return;
    setClosingSession(true);
    try {
      await chatSessionService.updateSession(selectedSessionId, { status: 'closed', ai_enabled: false });
      loadSessions();
      setSelectedSessionId(null);
      setSelectedSession(null);
    } catch (e) {
      console.error('Failed to close session', e);
    } finally {
      setClosingSession(false);
    }
  };

  const handleToggleSpam = async () => {
    if (!selectedSession || togglingSpam) return;
    const nextStatus = selectedSession.status === 'spam' ? 'active' : 'spam';
    setTogglingSpam(true);
    try {
      await chatSessionService.updateSession(selectedSessionId, { status: nextStatus });
      loadSessions();
      setSelectedSessionId(null);
      setSelectedSession(null);
    } catch (e) {
      console.error('Failed to change spam status', e);
    } finally {
      setTogglingSpam(false);
    }
  };

  const getDomainName = (domainId) => {
    const domain = domains.find(d => d.id === domainId || d.domain_id === domainId);
    return domain ? domain.name : 'Unknown Domain';
  };

  const getDomainUrl = (domainId) => {
    const domain = domains.find(d => d.id === domainId || d.domain_id === domainId);
    return domain ? domain.domain_url : 'Unknown Domain';
  };

  const handleBulkDelete = async () => {
    if (selectedSessions.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedSessions.size} conversation(s)? This cannot be undone.`)) return;

    setDeleting(true);
    try {
      const res = await chatSessionService.bulkDelete(Array.from(selectedSessions));
      if (res.details && res.details.failed && res.details.failed.length > 0) {
        showToast(`Deleted ${res.details.success?.length || 0} items, but ${res.details.failed.length} failed.`, 'error');
      } else {
        showToast(`Successfully deleted ${selectedSessions.size} conversations.`, 'success');
      }
      setSelectedSessions(new Set());
      if (selectedSessions.has(selectedSessionId)) {
        setSelectedSessionId(null);
        setSelectedSession(null);
      }
      loadSessions();
    } catch (e) {
      console.error('Bulk delete failed:', e);
      showToast('Failed to delete selected conversations.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelectSession = (e, id) => {
    e.stopPropagation();
    const newSet = new Set(selectedSessions);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedSessions(newSet);
  };

  const handleSelectAll = () => {
    if (selectedSessions.size === sessions.length && sessions.length > 0) {
      setSelectedSessions(new Set());
    } else {
      setSelectedSessions(new Set(sessions.map(s => s.session_id)));
    }
  };

  const [isSelecting, setIsSelecting] = useState(false);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 md:space-y-6 h-[calc(100vh-80px)] md:h-[calc(100vh-120px)] flex flex-col">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="text-blue-500" />
            Live Chat & History
          </h1>
          <p className="hidden md:block text-gray-500 text-sm mt-1">
            Realtime customer conversations, automated AI answers, and direct admin takeovers.
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-6 overflow-hidden min-h-0">

        {/* LEFT PANEL: SESSIONS LIST */}
        <div className={`w-full lg:w-80 bg-white rounded-xl lg:rounded-2xl flex flex-col overflow-hidden shrink-0 border border-gray-200 shadow-sm ${selectedSessionId ? 'hidden lg:flex' : 'flex'}`}>
          {/* Filters */}
          <div className="p-3 md:p-4 border-b border-gray-200 space-y-3 bg-gray-50">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
              <input
                type="text"
                placeholder="Search name/email..."
                className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500/50 transition-colors"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              />
            </div>

            <select
              className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500/50"
              value={selectedDomainId}
              onChange={(e) => { setSelectedDomainId(e.target.value); setPage(1); }}
            >
              <option value="">All Domains</option>
              {domains.map(d => (
                <option key={d.id} value={d.id} className="bg-white text-gray-900">{d.name}</option>
              ))}
            </select>

            <div className="flex border-b border-gray-200 mt-2 px-1">
              {['active', 'closed', 'spam', 'all'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setStatusTab(tab); setPage(1); }}
                  className={`relative flex-1 text-center py-2 text-xs font-bold capitalize transition-all border-b-2 ${
                    statusTab === tab
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab}
                  {unreadByTab[tab] && (
                    <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk Action Bar */}
          {(isSelecting || selectedSessions.size > 0) && (
            <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b border-blue-100">
              <div className="flex items-center gap-2">
                <button onClick={handleSelectAll} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                  {selectedSessions.size === sessions.length && sessions.length > 0 ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-xs text-blue-400 font-medium px-2 py-0.5 bg-blue-100 rounded-full">
                  {selectedSessions.size}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedSessions.size > 0 && (
                  <button onClick={handleBulkDelete} disabled={deleting} className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors">
                    {deleting ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Delete
                  </button>
                )}
                <button onClick={() => { setIsSelecting(false); setSelectedSessions(new Set()); }} className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!isSelecting && selectedSessions.size === 0 && sessions.length > 0 && (
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex justify-end">
              <button onClick={() => setIsSelecting(true)} className="text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <CheckSquare size={12} /> Select
              </button>
            </div>
          )}

          {/* Sessions Stream */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {loading ? (
              <div className="p-4 space-y-4">
                {[...Array(5)].map((_, idx) => (
                  <div key={idx} className="h-24 bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <div className="h-3 bg-gray-200 rounded animate-pulse w-1/3"></div>
                      <div className="h-2 bg-gray-200 rounded animate-pulse w-1/6"></div>
                    </div>
                    <div className="h-2 bg-gray-200 rounded animate-pulse w-2/3"></div>
                    <div className="flex gap-2 mt-1">
                      <div className="h-4 w-12 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-4 w-12 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                No active conversations matching filters.
              </div>
            ) : (
              sessions.map(session => {
                const isSelected = session.session_id === selectedSessionId;
                const isChecked = selectedSessions.has(session.session_id);
                const hasUnread = session.unread_admin_count > 0;

                return (
                  <div key={session.session_id} className="relative group flex items-stretch">
                    {(isSelecting || isChecked) && (
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center z-10 cursor-pointer transition-colors ${isChecked ? 'bg-blue-50' : 'bg-transparent hover:bg-gray-50'}`}
                        onClick={(e) => toggleSelectSession(e, session.session_id)}
                      >
                        {isChecked ? <CheckSquare className="text-blue-500" size={16} /> : <Square className="text-gray-300" size={16} />}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        if (isSelecting) {
                          toggleSelectSession(e, session.session_id);
                        } else {
                          setSelectedSessionId(session.session_id);
                        }
                      }}
                      className={`w-full text-left p-4 transition-all border-l-4 flex flex-col gap-2 relative ${
                        isSelected
                          ? 'bg-blue-50 border-blue-500 bg-gradient-to-r from-blue-50 to-transparent'
                          : 'border-transparent hover:bg-gray-50'
                      } ${(isSelecting || isChecked) ? 'pl-10' : ''}`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs text-blue-400 font-semibold font-mono truncate max-w-[140px]">
                          {session.customer_name !== 'Anonymous' ? session.customer_name : `Guest-${session.session_id.substring(0, 8)}`}
                        </span>
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Clock size={10} />
                          {formatDate(session.last_message_at || session.created_at, customTimeStamp)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between w-full">
                        <p className="text-xs text-gray-500 truncate max-w-[200px] pr-2">
                          {session.last_message || 'No messages yet'}
                        </p>

                        {hasUnread && (
                          <span className="w-5 h-5 rounded-full bg-blue-500 text-[10px] font-bold text-gray-900 flex items-center justify-center animate-pulse shrink-0">
                            {session.unread_admin_count}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          session.status === 'active' || session.status === 'open' ? 'bg-emerald-100 text-emerald-400 border border-emerald-500/20' :
                          session.status === 'spam' ? 'bg-red-100 text-gray-500 border border-red-500/20' :
                          'bg-gray-500/10 text-gray-500 border border-slate-500/20'
                        }`}>
                          {session.status}
                        </span>

                        {session.ai_enabled && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-0.5">
                            <Bot size={8} /> AI
                          </span>
                        )}

                        {session.admin_joined && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            Live
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="p-3 border-t border-gray-200 flex justify-between items-center text-xs bg-gray-50">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded bg-white border-gray-200 hover:bg-white border-gray-200 disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-gray-500">Page {page} of {pagination.total_pages}</span>
              <button
                disabled={page >= pagination.total_pages}
                onClick={() => setPage(p => p + 1)}
                className="px-2.5 py-1 rounded bg-white border-gray-200 hover:bg-white border-gray-200 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* MIDDLE & RIGHT PANEL: ACTIVE CHAT */}
        <div className={`flex-1 bg-white rounded-xl lg:rounded-2xl flex overflow-hidden min-w-0 border border-gray-200 shadow-sm ${!selectedSessionId ? 'hidden lg:flex' : 'flex'}`}>
          {loadingSessionDetail ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4 p-8 bg-gray-50">
              <RefreshCw size={32} className="text-blue-500 animate-spin" />
              <p className="text-gray-500 text-sm font-medium">Loading conversation...</p>
            </div>
          ) : selectedSession ? (
            <div className="flex-1 flex flex-col lg:flex-row min-h-0">

              {/* CHAT LOG STREAM */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* Header */}
                <div className="p-3 md:p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedSessionId(null)}
                      className="lg:hidden p-1.5 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 transition-colors"
                    >
                      <span className="text-xl leading-none px-1">←</span>
                    </button>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        {selectedSession.customer_name || 'Anonymous Guest'}
                        <span className="hidden lg:inline text-gray-500 font-mono text-[10px]">({selectedSession.session_id.substring(0, 12)}...)</span>
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[150px] lg:max-w-none">
                        Domain: <span className="text-blue-400 font-medium">{getDomainUrl(selectedSession.domain_id)}</span>
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11px] text-gray-500">
                        {selectedSession.customer_name && selectedSession.customer_name !== 'Anonymous' && selectedSession.customer_name !== 'Not Provided' && (
                          <span><strong className="text-gray-700 font-semibold">Name:</strong> {selectedSession.customer_name}</span>
                        )}
                        {selectedSession.customer_email && selectedSession.customer_email !== 'Not captured' && selectedSession.customer_email !== 'Not Provided' && (
                          <span><strong className="text-gray-700 font-semibold">Email:</strong> {selectedSession.customer_email}</span>
                        )}
                        {selectedSession.customer_phone && selectedSession.customer_phone !== 'Not captured' && selectedSession.customer_phone !== 'Not Provided' && (
                          <span><strong className="text-gray-700 font-semibold">Phone:</strong> {selectedSession.customer_phone}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 lg:gap-2">
                    <button
                      onClick={handleToggleSpam}
                      disabled={togglingSpam}
                      className={`px-2.5 lg:px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        selectedSession.status === 'spam'
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                      }`}
                    >
                      {togglingSpam ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                      <span className="hidden lg:inline">{togglingSpam ? 'Updating...' : (selectedSession.status === 'spam' ? 'Unmark Spam' : 'Mark Spam')}</span>
                    </button>

                    <button
                      onClick={handleToggleAI}
                      disabled={togglingAI}
                      className={`px-2.5 lg:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        selectedSession.ai_enabled
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                          : 'bg-white border-gray-200 text-gray-500 border border-gray-200'
                      }`}
                    >
                      {togglingAI ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span className="hidden lg:inline">Updating...</span>
                        </>
                      ) : selectedSession.ai_enabled ? (
                        <>
                          <Power className="w-3.5 h-3.5" />
                          <span className="hidden lg:inline">AI Answering</span>
                        </>
                      ) : (
                        <>
                          <PowerOff className="w-3.5 h-3.5" />
                          <span className="hidden lg:inline">AI Paused</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleCloseSession}
                      disabled={closingSession}
                      className="px-2.5 lg:px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-600/20 text-gray-500 border border-red-500/30 hover:bg-red-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {closingSession ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                      <span className="hidden lg:inline">{closingSession ? 'Closing...' : 'Close Chat'}</span>
                    </button>
                  </div>
                </div>

                {/* Messages stream */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 flex flex-col bg-gray-50">
                  {selectedSession.messages_json?.map((msg, idx, arr) => {
                    const isCustomer = msg.sender === 'customer' || msg.sender === 'user';
                    const isSystem = msg.sender === 'system';
                    const isAI = msg.sender === 'ai' || msg.sender === 'bot';

                    let dateSeparator = null;
                    const currentMsgDate = new Date(msg.timestamp || msg.created_at);
                    const prevMsgDate = idx > 0 ? new Date(arr[idx - 1].timestamp || arr[idx - 1].created_at) : null;
                    const showSeparator = !prevMsgDate || (currentMsgDate - prevMsgDate > 1000 * 60 * 60);

                    if (showSeparator && !isNaN(currentMsgDate.getTime())) {
                      const dateText = currentMsgDate.toLocaleDateString(undefined, {
                        weekday: 'short', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      });
                      dateSeparator = (
                        <div key={`sep-${idx}`} className="flex justify-center my-4 w-full">
                          <span className="text-[10px] font-medium text-gray-500 bg-gray-200/60 px-3 py-1 rounded-full uppercase tracking-widest shadow-sm">
                            {dateText}
                          </span>
                        </div>
                      );
                    }

                    let msgContent = null;
                    if (isSystem) {
                      msgContent = (
                        <div key={msg.id || idx} className="self-center my-2 text-[11px] bg-white border-gray-200 border border-gray-200 text-gray-500 px-3 py-1 rounded-full flex items-center gap-1 font-medium">
                          <Sparkles size={10} className="text-blue-400" />
                          {msg.message}
                        </div>
                      );
                    } else {
                      msgContent = (
                        <div
                          key={msg.id || idx}
                          className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isCustomer ? 'self-end items-end' : 'self-start items-start'}`}
                        >
                          <div
                            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                              isCustomer
                                ? 'bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-600/10'
                                : isAI
                                ? 'bg-white border-gray-200 border border-gray-200 text-gray-800 rounded-bl-none'
                                : 'bg-indigo-600/10 border border-indigo-500/20 text-gray-800 rounded-bl-none'
                            }`}
                          >
                            {msg.message}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 px-1">
                            {isAI && msg.source && (
                              <span className="text-[8px] bg-indigo-500/20 text-indigo-300 px-1 py-0.2 rounded font-bold uppercase tracking-wider">
                                AI: {msg.source}
                              </span>
                            )}
                            {!isCustomer && !isAI && (
                              <span className="text-[8px] bg-blue-500/20 text-gray-700 px-1 py-0.2 rounded font-bold uppercase tracking-wider">
                                ADMIN
                              </span>
                            )}
                            <span className="text-[10px] text-gray-500">
                              {formatTime(msg.timestamp || msg.created_at, customTimeStamp)}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <React.Fragment key={msg.id || idx}>
                        {dateSeparator}
                        {msgContent}
                      </React.Fragment>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input box */}
                <form onSubmit={handleSendReply} className="p-3 lg:p-4 border-t border-gray-200 flex gap-2 lg:gap-3 bg-gray-50">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => {
                      setReplyText(e.target.value);
                      if (sessionWsRef.current?.readyState === WebSocket.OPEN) {
                        sessionWsRef.current.send(JSON.stringify({ type: 'typing_started' }));
                        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                        typingTimeoutRef.current = setTimeout(() => {
                          if (sessionWsRef.current?.readyState === WebSocket.OPEN) {
                            sessionWsRef.current.send(JSON.stringify({ type: 'typing_stopped' }));
                          }
                        }, 3000);
                      }
                    }}
                    placeholder={selectedSession.ai_enabled ? 'AI is responding. Type to pause AI...' : 'Type reply to customer...'}
                    className="flex-1 bg-white border-gray-200 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors flex items-center justify-center shrink-0"
                  >
                    {sending ? <RefreshCw className="animate-spin" size={16} /> : <Send size={16} />}
                  </button>
                </form>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8">
              <MessageSquare size={48} className="text-gray-600 mb-3" />
              <p>Select a live chat session from the list to view and reply.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
