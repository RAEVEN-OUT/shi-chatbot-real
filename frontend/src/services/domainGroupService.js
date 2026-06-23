import api from '../utils/api';

export const domainGroupService = {
  getDomainGroups: async (domainId) => {
    const res = await api.get(`/domains/${domainId}/groups`);
    return res.data;
  },
  updateDomainGroups: async (domainId, payload) => {
    const res = await api.put(`/domains/${domainId}/groups`, payload);
    return res.data;
  }
};
