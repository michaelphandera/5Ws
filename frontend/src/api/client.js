import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Sliding session renewal: once the token enters the last quarter of its
// lifetime, any successful API call triggers a silent, single-flight refresh.
let refreshing = null;
let lastRefreshAttempt = 0;
const REFRESH_THROTTLE_MS = 10 * 60 * 1000;

function maybeRefreshToken() {
  const token = localStorage.getItem('token');
  if (!token) return;
  let payload;
  try {
    payload = JSON.parse(atob(token.split('.')[1]));
  } catch {
    return;
  }
  if (!payload.exp || !payload.iat) return;
  const now = Date.now() / 1000;
  const lifetime = payload.exp - payload.iat;
  if (payload.exp - now > lifetime / 4) return; // not yet in the final quarter
  if (refreshing || Date.now() - lastRefreshAttempt < REFRESH_THROTTLE_MS) return;
  lastRefreshAttempt = Date.now();
  refreshing = api
    .post('/auth/refresh')
    .then(({ data }) => {
      localStorage.setItem('token', data.token);
      // Keep the Pinia store in sync without a circular import.
      import('../stores/auth').then(({ useAuthStore }) => {
        useAuthStore().setToken(data.token);
      });
    })
    .catch(() => {})
    .finally(() => {
      refreshing = null;
    });
}

api.interceptors.response.use(
  (res) => {
    if (!res.config.url.includes('/auth/')) maybeRefreshToken();
    return res;
  },
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    // Temporary-password users are locked out of everything but /auth.
    if (
      err.response?.status === 403 &&
      err.response?.data?.code === 'PASSWORD_CHANGE_REQUIRED' &&
      window.location.pathname !== '/change-password'
    ) {
      window.location.href = '/change-password';
    }
    return Promise.reject(err);
  }
);

export default api;
