import api from '../utils/api';

export const failedQuestionService = {
  listFailedQuestions: async (params) => {
    const res = await api.get('/failed-questions', { params });
    return res.data;
  },
  deleteFailedQuestion: async (failedId) => {
    const res = await api.delete(`/failed-questions/${failedId}`);
    return res.data;
  },
  flagAsSpam: async (failedId) => {
    const res = await api.post(`/failed-questions/${failedId}/spam`);
    return res.data;
  },
  promoteQuestion: async (failedId, payload) => {
    const res = await api.post(`/failed-questions/${failedId}/promote`, payload);
    return res.data;
  },
  listSpamQuestions: async () => {
    const res = await api.get('/spam-questions');
    return res.data;
  },
  deleteSpamQuestion: async (spamId) => {
    const res = await api.delete(`/spam-questions/${spamId}`);
    return res.data;
  },
  bulkDeleteFailed: async (payload) => {
    const res = await api.post('/failed-questions/bulk-delete', payload);
    return res.data;
  },
  bulkDeleteSpam: async (payload) => {
    const res = await api.post('/spam-questions/bulk-delete', payload);
    return res.data;
  }
};
