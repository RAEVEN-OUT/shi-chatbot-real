import api from '../utils/api';

export const domainCategoryService = {
  getDomainCategories: async (domainId) => {
    const res = await api.get(`/domains/${domainId}/categories`);
    return res.data;
  },
  updateDomainCategories: async (domainId, payload) => {
    const res = await api.put(`/domains/${domainId}/categories`, payload);
    return res.data;
  }
};
