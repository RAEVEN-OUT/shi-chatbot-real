import api from '../utils/api';

export const settingsService = {
  listSubscribers: async (params) => {
    const res = await api.get('/admin/subscribers', { params });
    return res.data;
  },
  createSubscriber: async (payload) => {
    const res = await api.post('/admin/subscribers', payload);
    return res.data;
  },
  updateSubscriber: async (uid, payload) => {
    const res = await api.put(`/admin/subscribers/${uid}`, payload);
    return res.data;
  },
  deleteSubscriber: async (uid) => {
    const res = await api.delete(`/admin/subscribers/${uid}`);
    return res.data;
  }
};
