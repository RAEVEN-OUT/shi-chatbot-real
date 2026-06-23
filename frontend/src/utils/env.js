export const getEnv = (key, fallback = '') => {
  if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG[key]) {
    return window.APP_CONFIG[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  if (typeof import.meta !== 'undefined' && import.meta && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  return fallback;
};
