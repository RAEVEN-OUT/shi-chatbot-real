import axios from 'axios';
import { auth } from '../firebase/config';

const getBaseURL = () => {
  if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof import.meta !== 'undefined' && import.meta && import.meta.env && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return 'http://localhost:8000';
};

const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000, // 30 seconds timeout to prevent pending requests forever
});

const GET_CACHE_PREFIX = 'shi_api_get_cache_v1:';
const GET_CACHE_MAX_AGE = 10 * 60 * 1000;
const GET_CACHE_STALE_AFTER = 20 * 1000;
const memoryCache = new Map();
const pendingRefreshes = new Map();

function stableStringify(value) {
  if (!value) return '';
  const keys = Object.keys(value).sort();
  return JSON.stringify(keys.reduce((acc, key) => {
    acc[key] = value[key];
    return acc;
  }, {}));
}

function getCacheKey(url, config = {}) {
  const uid = auth.currentUser?.uid || 'anonymous';
  return `${uid}:${url}:${stableStringify(config.params)}`;
}

function readCachedResponse(key) {
  const now = Date.now();
  const memoryValue = memoryCache.get(key);
  if (memoryValue && now - memoryValue.savedAt < GET_CACHE_MAX_AGE) {
    return memoryValue;
  }

  try {
    const raw = sessionStorage.getItem(GET_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (now - parsed.savedAt >= GET_CACHE_MAX_AGE) {
      sessionStorage.removeItem(GET_CACHE_PREFIX + key);
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedResponse(key, response) {
  const cached = {
    savedAt: Date.now(),
    data: response.data,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  };
  memoryCache.set(key, cached);
  try {
    sessionStorage.setItem(GET_CACHE_PREFIX + key, JSON.stringify(cached));
  } catch {
    // Session storage can be full or unavailable; memory cache is enough.
  }
}

function clearGetCache() {
  memoryCache.clear();
  pendingRefreshes.clear();
  try {
    Object.keys(sessionStorage)
      .filter(key => key.startsWith(GET_CACHE_PREFIX))
      .forEach(key => sessionStorage.removeItem(key));
  } catch {
    // Ignore storage cleanup failures.
  }
}

function responseFromCache(cached, config) {
  return {
    data: cached.data,
    status: cached.status || 200,
    statusText: cached.statusText || 'OK',
    headers: cached.headers || {},
    config,
    request: null,
    cached: true,
  };
}

// Automatically attach Firebase ID Token to every request
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (e) {
      console.error("Failed to retrieve Firebase ID token", e);
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

const rawGet = api.get.bind(api);
api.get = async (url, config = {}) => {
  const response = await rawGet(url, config);
  // Disabled caching to ensure real-time data is retrieved directly from DB
  return response;
};

['post', 'put', 'patch', 'delete'].forEach(method => {
  const rawMethod = api[method].bind(api);
  api[method] = async (...args) => {
    const response = await rawMethod(...args);
    clearGetCache();
    return response;
  };
});

api.clearGetCache = clearGetCache;

export default api;
