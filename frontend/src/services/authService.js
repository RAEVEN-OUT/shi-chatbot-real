import api from '../utils/api';

export const authService = {
  getProfile: async () => {
    const res = await api.get('/auth/profile');
    return res.data;
  }
};
