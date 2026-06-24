import api from '../utils/api';

export const chatSessionService = {
  listSessions: async (params = {}) => {
    const res = await api.get('/chat-sessions', { params });
    // The backend currently returns a raw array and ignores filters.
    // We map id to session_id and apply filters on the client.
    let list = Array.isArray(res.data) ? res.data : [];
    
    list = list.map(s => ({ 
      ...s, 
      session_id: s.id, 
      unread_admin_count: s.unread_admin 
    }));
    
    // Sort recent sessions to top
    list.sort((a, b) => {
      const dateA = new Date(a.last_message_at || a.created_at || 0);
      const dateB = new Date(b.last_message_at || b.created_at || 0);
      return dateB - dateA;
    });
    
    if (params.status) {
      if (params.status === 'active') {
        list = list.filter(s => s.status === 'active' || s.status === 'open');
      } else {
        list = list.filter(s => s.status === params.status);
      }
    }
    if (params.domain_id) {
      list = list.filter(s => s.domain_id === params.domain_id);
    }
    if (params.search) {
      const term = params.search.toLowerCase();
      list = list.filter(s => 
        (s.customer_name || '').toLowerCase().includes(term) ||
        (s.customer_email || '').toLowerCase().includes(term)
      );
    }
    
    return { data: list, pagination: { page: 1, total_pages: 1 } };
  },
  getSession: async (sessionId) => {
    const res = await api.get(`/chat-sessions/${sessionId}`);
    // Map id to session_id, and messages to messages_json to match legacy frontend expectations
    const messages = res.data.messages || [];
    const lastMsg = messages.length > 0 ? messages[messages.length - 1].message : null;
    const data = { 
      ...res.data, 
      session_id: res.data.id,
      messages_json: messages,
      last_message: lastMsg,
      unread_admin_count: res.data.unread_admin
    };
    return { success: true, data: data };
  },
  sendAdminMessage: async (sessionId, message, type = 'text') => {
    const res = await api.post(`/chat-sessions/${sessionId}/messages`, { message, type, sender: 'admin' });
    return res.data;
  },
  updateSession: async (sessionId, updates) => {
    const res = await api.patch(`/chat-sessions/${sessionId}`, updates);
    return res.data;
  },
  markRead: async (sessionId) => {
    const res = await api.post(`/chat-sessions/${sessionId}/read`);
    return res.data;
  },
  deleteSession: async (sessionId) => {
    const res = await api.delete(`/chat-sessions/${sessionId}`);
    return res.data;
  },
  bulkDelete: async (ids) => {
    const res = await api.post('/chat-sessions/bulk-delete', { session_ids: ids });
    return { details: { success: ids, failed: [] } };
  },
  getUnreadCount: async () => {
    const CACHE_KEY = 'unread_count_cache';
    const CACHE_TIME_KEY = 'unread_count_time';
    const CACHE_DURATION = 60 * 1000; // 1 minute
    
    const now = Date.now();
    const lastFetch = localStorage.getItem(CACHE_TIME_KEY);
    
    if (lastFetch && now - parseInt(lastFetch, 10) < CACHE_DURATION) {
      const cachedData = localStorage.getItem(CACHE_KEY);
      if (cachedData) {
        return JSON.parse(cachedData);
      }
    }
    
    const res = await api.get('/notifications/unread-count');
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(res.data));
    localStorage.setItem(CACHE_TIME_KEY, now.toString());
    
    return res.data;
  }
};
