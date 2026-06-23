import api from '../utils/api';

export const domainService = {
  listDomains: async () => {
    const res = await api.get('/domains');
    return res.data;
  },
  listDomainNames: async () => {
    const res = await api.get('/domains/names');
    return res.data;
  },
  createDomain: async (payload) => {
    const res = await api.post('/domains', payload);
    return res.data;
  },
  updateDomain: async (domainId, payload) => {
    const res = await api.put(`/domains/${domainId}`, payload);
    return res.data;
  },
  deleteDomain: async (domainId) => {
    const res = await api.delete(`/domains/${domainId}`);
    return res.data;
  },
  bulkDelete: async (payload) => {
    const res = await api.post('/domains/bulk-delete', payload);
    return res.data;
  },
  retrainDomain: async (domainId) => {
    const res = await api.post(`/domains/${domainId}/retrain`);
    return res.data;
  },
  uploadLogo: async (formData) => {
    const res = await api.post('/upload-logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },
};
