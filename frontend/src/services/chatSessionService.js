import api from '../utils/api';

export const chatSessionService = {
  listSessions: async (params = {}) => {
    const res = await api.get('/chat-sessions', { params });
    return res.data;
  },
  getSession: async (sessionId) => {
    const res = await api.get(`/chat-sessions/${sessionId}`);
    return res.data;
  },
  sendAdminMessage: async (sessionId, message, type = 'text') => {
    const res = await api.post(`/chat-sessions/${sessionId}/messages`, { message, type });
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
    const res = await api.post('/chat-sessions/bulk-delete', { ids });
    return res.data;
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
