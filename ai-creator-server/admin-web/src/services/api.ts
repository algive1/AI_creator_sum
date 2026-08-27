import axios, { AxiosResponse } from 'axios';
import { message } from 'antd';

const api = axios.create({ baseURL: '/api/v1/admin' });
let refreshPromise: Promise<string | null> | null = null;

function isFormDataPayload(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

function removeContentTypeHeader(headers: any) {
  if (!headers) return;
  if (typeof headers.delete === 'function') {
    headers.delete('Content-Type');
    headers.delete('content-type');
    return;
  }
  delete headers['Content-Type'];
  delete headers['content-type'];
}

function readTokenExp(token: string): number {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
    const parsed = JSON.parse(atob(padded));
    return Number(parsed.exp || 0) * 1000;
  } catch {
    return 0;
  }
}

function tokenNeedsRefresh(token: string): boolean {
  const exp = readTokenExp(token);
  if (!exp) return false;
  return exp - Date.now() < 15 * 60 * 1000 && exp > Date.now();
}

function refreshAdminToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  const token = localStorage.getItem('admin_token');
  if (!token) return Promise.resolve(null);
  refreshPromise = axios.post('/api/v1/admin/auth/refresh', {}, {
    headers: { Authorization: 'Bearer ' + token },
  }).then((res) => {
    const nextToken = res.data?.data?.token;
    if (nextToken) localStorage.setItem('admin_token', nextToken);
    return nextToken || null;
  }).catch(() => null).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('admin_token');
  const url = String(config.url || '');
  if (isFormDataPayload(config.data)) {
    removeContentTypeHeader(config.headers);
  }
  if (token && !url.includes('/auth/login')) {
    if (!url.includes('/auth/refresh') && tokenNeedsRefresh(token)) {
      await refreshAdminToken();
    }
    const nextToken = localStorage.getItem('admin_token');
    if (nextToken) config.headers.Authorization = 'Bearer ' + nextToken;
  }
  return config;
});

api.interceptors.response.use(
  (res: AxiosResponse) => {
    const body = res.data;
    if (body && typeof body.code === 'number' && body.code !== 0) {
      const err: any = new Error(body.message || '请求失败');
      err.response = { ...res, data: body };
      const isLoginRequest = String(res.config?.url || '').includes('/auth/login');
      if (!isLoginRequest) message.error(body.message || '请求失败');
      return Promise.reject(err);
    }
    return body;
  },
  (err) => {
    if (err.response?.status === 401) {
      const isLoginRequest = String(err.config?.url || '').includes('/auth/login');
      if (isLoginRequest) {
        return Promise.reject(err);
      } else {
        localStorage.removeItem('admin_token');
        window.location.href = '/login';
      }
    } else if (err.code === 'ECONNABORTED') {
      message.error('请求超时，请检查网络连接');
    } else if (!err.response) {
      message.error('网络连接失败，请检查服务器是否正常运行');
    } else {
      message.error(err.response?.data?.message || '请求失败');
    }
    return Promise.reject(err);
  }
);

export default api;
