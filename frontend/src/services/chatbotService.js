import api from '../utils/api';

export const chatbotService = {
  listConversations: async () => {
    const res = await api.get('/chat-sessions');
    return res.data;
  },
  getAnalyticsSummary: async () => {
    const res = await api.get('/analytics/summary');
    return res.data;
  },
  listLeads: async (params) => {
    const res = await api.get('/leads', { params });
    return res.data;
  },
  listLeadsTable: async (params) => {
    const res = await api.get('/leads/table', { params });
    return res.data;
  },
  getWidgetStyle: async (domainId) => {
    const res = await api.get(`/style/${domainId}`);
    return res.data;
  },
  updateWidgetStyle: async (domainId, payload) => {
    const res = await api.post(`/style/${domainId}`, payload);
    return res.data;
  },
  getLeadConfig: async (domainId) => {
    const res = await api.get(`/lead-config/${domainId}`);
    return res.data;
  },
  updateLeadConfig: async (domainId, payload) => {
    const res = await api.post(`/lead-config/${domainId}`, payload);
    return res.data;
  },
  listAdminAiLogs: async () => {
    const res = await api.get('/admin/ai-logs');
    return res.data;
  },
  adminAiSuggest: async (payload) => {
    const res = await api.post('/admin/ai-suggest', payload, { responseType: 'stream' });
    return res.data;
  },
  adminVectorSearch: async (payload) => {
    const res = await api.post('/admin/vector-search', payload);
    return res.data;
  }
};
