import api from '../utils/api';

export const faqCategoryService = {
  listCategories: async () => {
    const res = await api.get('/faq-categories');
    return res.data;
  },
  createCategory: async (payload) => {
    const res = await api.post('/faq-categories', payload);
    return res.data;
  },
  updateCategory: async (categoryId, payload) => {
    const res = await api.put(`/faq-categories/${categoryId}`, payload);
    return res.data;
  },
  deleteCategory: async (categoryId) => {
    const res = await api.delete(`/faq-categories/${categoryId}`);
    return res.data;
  },
  bulkDeleteCategories: async (ids) => {
    const res = await api.post('/faq-categories/bulk-delete', { ids });
    return res.data;
  }
};
