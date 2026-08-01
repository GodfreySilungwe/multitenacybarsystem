import axios from 'axios';

const DEFAULT_API_BASE_URL = 'https://d3hizi1y25kzis.cloudfront.net/api';

const resolveApiBaseUrl = () => {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  return DEFAULT_API_BASE_URL;
};

const apiBaseUrl = resolveApiBaseUrl();

// Create axios instance with base URL
const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

// Request interceptor for debugging
api.interceptors.request.use(
  config => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;
    const headers = config.headers || {};

    if (token) {
      if (typeof headers.set === 'function') {
        headers.set('Authorization', `Bearer ${token}`);
      } else {
        headers.Authorization = `Bearer ${token}`;
      }
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      if (typeof headers.delete === 'function') {
        headers.delete('Authorization');
      } else {
        delete headers.Authorization;
      }
      delete api.defaults.headers.common.Authorization;
    }

    config.headers = headers;
    console.log(`📤 ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Response interceptor for debugging
api.interceptors.response.use(
  response => {
    console.log(`📥 ${response.status} ${response.config.url}`);
    return response;
  },
  async error => {
    const { config, response } = error || {};

    if (response?.status === 404 && config && !config.__isRetry) {
      const originalBaseURL = config.baseURL || '';
      const fallbackBaseURL = originalBaseURL.replace(/\/api$/, '');
      const fallbackUrl = config.url?.replace(/^\/api/, '') || '';

      if (fallbackBaseURL !== originalBaseURL || fallbackUrl !== config.url) {
        const retryConfig = {
          ...config,
          __isRetry: true,
          baseURL: fallbackBaseURL,
          url: fallbackUrl
        };

        console.warn(`🔁 Retrying API request without /api prefix: ${retryConfig.url}`);
        return api.request(retryConfig);
      }
    }

    console.error('❌ API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default api;