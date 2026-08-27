import axios, { AxiosError, AxiosResponse } from 'axios';

export const ACCESS_TOKEN_KEY = 'user_web_token';
export const REFRESH_TOKEN_KEY = 'user_web_refresh_token';
export const USER_CACHE_KEY = 'user_web_profile';

export interface ApiEnvelope<T = any> {
  code: number;
  message: string;
  data: T;
  requestId?: string;
}

export interface AuthSession {
  token: string;
  refreshToken: string;
  expiresIn: number;
  refreshTokenExpiresIn: number;
  user: any;
  points?: any;
  membership?: any;
}

export interface UploadResult {
  uid?: string;
  fileId?: number;
  id?: number;
  fileNo?: string;
  file_no?: string;
  url?: string;
  cdnUrl?: string;
  accessUrl?: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
}

export class ApiError extends Error {
  code: number;
  status?: number;
  data?: any;

  constructor(message: string, code: number, status?: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
});

api.interceptors.request.use((requestConfig) => {
  const token = getAccessToken();
  if (token) {
    (requestConfig.headers as any).Authorization = `Bearer ${token}`;
  }
  return requestConfig;
});

api.interceptors.response.use(
  (response) => {
    const envelope = response.data as ApiEnvelope | undefined;
    if (envelope && typeof envelope.code === 'number' && envelope.code !== 0) {
      throw new ApiError(envelope.message || '请求失败', envelope.code, response.status, envelope.data);
    }
    return response;
  },
  async (error) => {
    const axiosError = error as AxiosError<ApiEnvelope>;
    const originalRequest = axiosError.config as any;
    if (axiosError.response?.status === 401 && originalRequest && !originalRequest.__retried) {
      originalRequest.__retried = true;
      const refreshed = await refreshAccessToken().catch(() => null);
      if (refreshed) {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${refreshed}`;
        return api(originalRequest);
      }
    }
    throw normalizeApiError(error);
  },
);

export function getAccessToken(): string {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || '';
}

export function getRefreshToken(): string {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || '';
}

export function setTokens(session: Pick<AuthSession, 'token' | 'refreshToken'>): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.token);
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_CACHE_KEY);
}

export function cacheSessionUser(session: AuthSession): void {
  localStorage.setItem(USER_CACHE_KEY, JSON.stringify({
    user: session.user,
    points: session.points,
    membership: session.membership,
  }));
}

export function readCachedSession() {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function unwrapData<T = any>(response: AxiosResponse<ApiEnvelope<T>>): T {
  return response.data.data;
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const axiosError = error as AxiosError<ApiEnvelope>;
  const envelope = axiosError.response?.data;
  if (envelope && typeof envelope.code === 'number') {
    return new ApiError(envelope.message || '请求失败', envelope.code, axiosError.response?.status, envelope.data);
  }
  if (axiosError.response?.status) {
    return new ApiError(axiosError.message || '网络请求失败', axiosError.response.status, axiosError.response.status);
  }
  return new ApiError(error instanceof Error ? error.message : '网络连接失败', 5000);
}

export const authApi = {
  async register(payload: { email: string; password: string; nickname?: string; inviteCode?: string }) {
    const response = await api.post<ApiEnvelope<AuthSession>>('/auth/register', payload);
    const session = unwrapData(response);
    setTokens(session);
    cacheSessionUser(session);
    return session;
  },
  async login(payload: { email: string; password: string }) {
    const response = await api.post<ApiEnvelope<AuthSession>>('/auth/login', payload);
    const session = unwrapData(response);
    setTokens(session);
    cacheSessionUser(session);
    return session;
  },
};

export async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new ApiError('登录已过期', 401, 401);
  const response = await axios.post<ApiEnvelope<AuthSession>>('/api/v1/auth/refresh-token', {
    refreshToken,
    clientType: 'web',
  });
  if (response.data.code !== 0) {
    throw new ApiError(response.data.message || '刷新登录失败', response.data.code, response.status);
  }
  setTokens(response.data.data);
  return response.data.data.token;
}

export async function uploadFile(file: File, fileCategory: 'image' | 'video' | 'audio' | 'general') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('fileCategory', fileCategory);
  formData.append('visibility', 'private');
  const response = await api.post<ApiEnvelope<UploadResult>>('/files/upload', formData, {
    timeout: 180000,
  });
  return unwrapData(response);
}

export function uploadKeyOf(file: UploadResult): string | number {
  return file.fileNo || file.file_no || file.fileId || file.id || file.url || file.cdnUrl || file.accessUrl || '';
}
