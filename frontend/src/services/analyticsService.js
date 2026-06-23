import api from '../utils/api';

export const analyticsService = {
  getAdminStats: async () => {
    const res = await api.get('/admin/stats');
    return res.data;
  },
  getAdminHealth: async () => {
    const res = await api.get('/admin/health');
    return res.data;
  }
};
