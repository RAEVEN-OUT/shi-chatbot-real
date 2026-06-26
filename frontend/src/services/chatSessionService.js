import api from '../utils/api';

export const chatSessionService = {
  listSessions: async (params = {}) => {
    const res = await api.get('/chat-sessions', { params });
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

    // Compute unread by tab
    const unreadCounts = {
      active: list.some(s => (s.status === 'active' || s.status === 'open') && s.unread_admin_count > 0),
      closed: list.some(s => s.status === 'closed' && s.unread_admin_count > 0),
      spam: list.some(s => s.status === 'spam' && s.unread_admin_count > 0),
      all: list.some(s => s.unread_admin_count > 0)
    };

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

    return { data: list, pagination: { page: 1, total_pages: 1 }, unreadCounts };
  },

  getSession: async (sessionId) => {
    const res = await api.get(`/chat-sessions/${sessionId}`);
    const messages = res.data.messages || [];
    const lastMsg = messages.length > 0 ? messages[messages.length - 1].message : null;
    const data = {
      ...res.data,
      session_id: res.data.id,
      messages_json: messages,
      last_message: lastMsg,
      unread_admin_count: res.data.unread_admin
    };
    return { success: true, data };
  },

  sendAdminMessage: async (sessionId, message, type = 'text') => {
    const res = await api.post(`/chat-sessions/${sessionId}/messages`, {
      message,
      type,
      sender: 'admin'
    });
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
    await api.post('/chat-sessions/bulk-delete', { session_ids: ids });
    return { details: { success: ids, failed: [] } };
  },

  /**
   * Fetch the current unread count directly from the API (no cache).
   * The NotificationContext now uses a WebSocket for live updates and only
   * calls this on mount / reconnect — no polling needed.
   */
  getUnreadCount: async () => {
    const res = await api.get('/notifications/unread-count');
    return res.data;
  }
};
