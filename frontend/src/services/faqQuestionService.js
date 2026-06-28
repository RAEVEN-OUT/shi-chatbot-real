import api from '../utils/api';

export const faqQuestionService = {
  listQuestions: async (params) => {
    const res = await api.get('/faq-questions', { params });
    return res.data;
  },
  createQuestion: async (payload) => {
    const res = await api.post('/faq-questions', payload);
    return res.data;
  },
  updateQuestion: async (questionId, payload) => {
    const res = await api.put(`/faq-questions/${questionId}`, payload);
    return res.data;
  },
  deleteQuestion: async (questionId) => {
    const res = await api.delete(`/faq-questions/${questionId}`);
    return res.data;
  },
  bulkDeleteQuestions: async (ids) => {
    const res = await api.post('/faq-questions/bulk-delete', { question_ids: ids });
    return res.data;
  },
  // Backward compatibility CRUD
  listFaqs: async (params) => {
    const res = await api.get('/faqs', { params });
    return res.data;
  },
  getFaqCounts: async () => {
    const res = await api.get('/faqs/counts');
    return res.data;
  },
  createFaq: async (payload) => {
    const res = await api.post('/faqs', payload);
    return res.data;
  },
  updateFaq: async (faqId, payload) => {
    const res = await api.put(`/faqs/${faqId}`, payload);
    return res.data;
  },
  deleteFaq: async (faqId) => {
    const res = await api.delete(`/faqs/${faqId}`);
    return res.data;
  }
};
