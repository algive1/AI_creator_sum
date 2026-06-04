import { appEnv } from '@/env/index';
import { PAGE_ROUTES, STORAGE_KEYS } from '@/utils/constants';
import { getFriendlyError } from '@/utils/error-map';

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  requestId?: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions<TData = Record<string, unknown>> {
  url: string;
  method?: HttpMethod;
  data?: TData;
  header?: Record<string, string>;
  loading?: boolean | string;
  dedupe?: boolean;
  timeout?: number;
  silent?: boolean;
}

export interface UploadOptions {
  url?: string;
  filePath: string;
  name?: string;
  fileCategory?: string;
  visibility?: 'public' | 'private';
  formData?: Record<string, unknown>;
  loading?: boolean | string;
  timeout?: number;
}

export interface WechatPaymentParams {
  orderNo: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA' | 'MD5';
  paySign: string;
}

export class RequestError extends Error {
  code: number;
  requestId?: string;
  response?: unknown;

  constructor(message: string, code = -1, requestId?: string, response?: unknown) {
    super(message);
    this.name = 'RequestError';
    this.code = code;
    this.requestId = requestId;
    this.response = response;
  }
}

let authHandlers = {
  getToken: () => String(uni.getStorageSync(STORAGE_KEYS.token) || ''),
  getRefreshToken: () => String(uni.getStorageSync(STORAGE_KEYS.refreshToken) || ''),
  onTokenRefreshed: (_payload: { token: string; refreshToken?: string; expiresIn?: string }) => {},
  onUnauthorized: () => {
    uni.removeStorageSync(STORAGE_KEYS.token);
    uni.removeStorageSync(STORAGE_KEYS.refreshToken);
    uni.removeStorageSync(STORAGE_KEYS.user);
  }
};

let loadingCount = 0;
let redirectingLogin = false;
let refreshPromise: Promise<boolean> | null = null;
const pendingRequests = new Map<string, Promise<unknown>>();

export function setAuthHandlers(handlers: Partial<typeof authHandlers>) {
  authHandlers = { ...authHandlers, ...handlers };
}

export function request<T = unknown, TData = Record<string, unknown>>(options: RequestOptions<TData>): Promise<T> {
  const method = options.method || 'GET';
  const shouldDedupe = options.dedupe !== false && method !== 'GET';
  const requestKey = shouldDedupe ? buildDedupeKey(method, options.url, options.data) : '';
  if (requestKey && pendingRequests.has(requestKey)) return pendingRequests.get(requestKey) as Promise<T>;

  const promise = rawRequest<T, TData>({ ...options, method }).finally(() => {
    if (requestKey) pendingRequests.delete(requestKey);
  });
  if (requestKey) pendingRequests.set(requestKey, promise);
  return promise;
}

export function get<T = unknown>(url: string, data?: Record<string, unknown>, options: Omit<RequestOptions, 'url' | 'method' | 'data'> = {}) {
  return request<T>({ ...options, url, method: 'GET', data });
}

export function post<T = unknown>(url: string, data?: Record<string, unknown>, options: Omit<RequestOptions, 'url' | 'method' | 'data'> = {}) {
  return request<T>({ ...options, url, method: 'POST', data });
}

export function put<T = unknown>(url: string, data?: Record<string, unknown>, options: Omit<RequestOptions, 'url' | 'method' | 'data'> = {}) {
  return request<T>({ ...options, url, method: 'PUT', data });
}

export function uploadFile<T = unknown>(options: UploadOptions): Promise<T> {
  const token = authHandlers.getToken();
  showLoading(options.loading);
  return new Promise<T>((resolve, reject) => {
    uni.uploadFile({
      url: resolveUrl(options.url || '/files/upload'),
      filePath: options.filePath,
      name: options.name || 'file',
      timeout: options.timeout || appEnv.timeout,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      formData: {
        fileCategory: options.fileCategory || 'general',
        visibility: options.visibility || 'private',
        ...(options.formData || {})
      } as Record<string, string>,
      success: (res) => {
        try {
          const parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          resolve(handleApiResponse<T>(parsed));
        } catch (error) {
          reject(error);
        }
      },
      fail: (err) => reject(normalizeNetworkError(err)),
      complete: () => hideLoading(options.loading)
    });
  }).catch((error) => {
    handleError(error);
    throw error;
  });
}

export function downloadFile(url: string, options: { loading?: boolean | string; timeout?: number } = {}) {
  const token = authHandlers.getToken();
  showLoading(options.loading);
  return new Promise<string>((resolve, reject) => {
    uni.downloadFile({
      url: resolveUrl(url),
      timeout: options.timeout || appEnv.timeout,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new RequestError('文件下载失败', res.statusCode));
          return;
        }
        resolve(res.tempFilePath);
      },
      fail: (err) => reject(normalizeNetworkError(err)),
      complete: () => hideLoading(options.loading)
    });
  }).catch((error) => {
    handleError(error);
    throw error;
  });
}

export async function payWithWechat(orderNo: string) {
  const params = await post<WechatPaymentParams>('/payments/wechat/jsapi', { orderNo }, { loading: '正在拉起支付' });
  await new Promise<void>((resolve, reject) => {
    if (typeof uni.requestPayment !== 'function') {
      reject(new RequestError('当前平台不支持微信支付', 3002));
      return;
    }
    uni.requestPayment({
      provider: 'wxpay',
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType,
      paySign: params.paySign,
      success: () => resolve(),
      fail: (error) => reject(error)
    } as UniApp.RequestPaymentOptions);
  });
  return post('/payments/wechat/query', { orderNo }, { loading: '同步支付结果' });
}

async function rawRequest<T, TData>(options: RequestOptions<TData>): Promise<T> {
  return rawRequestOnce<T, TData>(options).catch(async (error) => {
    const canRetry = error instanceof RequestError
      && error.code === 401
      && options.url !== '/auth/refresh-token'
      && await refreshAccessToken();
    if (!canRetry) {
      if (!options.silent) handleError(error);
      throw error;
    }
    return rawRequestOnce<T, TData>(options).catch((retryError) => {
      if (!options.silent) handleError(retryError);
      throw retryError;
    });
  });
}

async function rawRequestOnce<T, TData>(options: RequestOptions<TData>): Promise<T> {
  const token = authHandlers.getToken();
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.header || {})
  };
  if (token) header.Authorization = `Bearer ${token}`;

  showLoading(options.loading);
  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: resolveUrl(options.url),
      method: options.method,
      data: options.data,
      timeout: options.timeout || appEnv.timeout,
      header,
      success: (res) => {
        if (res.statusCode === 401) {
          reject(new RequestError('登录已过期，请重新登录', 401));
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          const body = res.data as Partial<ApiResponse>;
          reject(new RequestError(body?.message || '请求失败', res.statusCode, body?.requestId, body));
          return;
        }
        try {
          resolve(handleApiResponse<T>(res.data));
        } catch (error) {
          reject(error);
        }
      },
      fail: (err) => reject(normalizeNetworkError(err)),
      complete: () => hideLoading(options.loading)
    } as UniApp.RequestOptions);
  });
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const refreshToken = authHandlers.getRefreshToken();
  if (!refreshToken) return false;

  refreshPromise = new Promise<boolean>((resolve) => {
    uni.request({
      url: resolveUrl('/auth/refresh-token'),
      method: 'POST',
      data: { refreshToken },
      timeout: appEnv.timeout,
      header: { 'Content-Type': 'application/json' },
      success: (res) => {
        try {
          if (res.statusCode === 401 || (res.statusCode && res.statusCode >= 400)) {
            resolve(false);
            return;
          }
          const payload = handleApiResponse<{ token: string; refreshToken?: string; expiresIn?: string }>(res.data);
          if (!payload?.token) {
            resolve(false);
            return;
          }
          authHandlers.onTokenRefreshed(payload);
          resolve(true);
        } catch {
          resolve(false);
        }
      },
      fail: () => resolve(false),
      complete: () => {
        refreshPromise = null;
      }
    } as UniApp.RequestOptions);
  });

  return refreshPromise;
}

function handleApiResponse<T>(raw: unknown): T {
  const body = raw as ApiResponse<T>;
  if (!body || typeof body !== 'object' || typeof body.code !== 'number') {
    throw new RequestError('接口响应格式异常', -2, undefined, raw);
  }
  if (body.code === 0) return body.data;
  throw new RequestError(getFriendlyError(body.code, body.message), body.code, body.requestId, body);
}

function handleError(error: unknown) {
  const err = error instanceof RequestError ? error : normalizeNetworkError(error);
  if (err.code === 401) {
    redirectToLogin();
    return;
  }
  uni.showToast({
    title: err.message || '请求失败，请稍后重试',
    icon: 'none',
    duration: 2400
  });
}

function redirectToLogin() {
  authHandlers.onUnauthorized();
  if (redirectingLogin) return;
  redirectingLogin = true;
  const current = getCurrentRoute();
  const query = current && current !== PAGE_ROUTES.login ? `?redirect=${encodeURIComponent(current)}` : '';
  uni.reLaunch({
    url: `${PAGE_ROUTES.login}${query}`,
    complete: () => {
      setTimeout(() => {
        redirectingLogin = false;
      }, 600);
    }
  });
}

function showLoading(loading?: boolean | string) {
  if (!loading) return;
  loadingCount += 1;
  if (loadingCount === 1) {
    uni.showLoading({
      title: typeof loading === 'string' ? loading : '加载中',
      mask: true
    });
  }
}

function hideLoading(loading?: boolean | string) {
  if (!loading) return;
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0) uni.hideLoading();
}

function resolveUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${appEnv.baseURL}${path}`;
}

function normalizeNetworkError(error: unknown) {
  const err = error as { errMsg?: string; message?: string; code?: number };
  const message = err?.errMsg || err?.message || '';
  if (/timeout/i.test(message)) return new RequestError('请求超时，请稍后重试', -3);
  return new RequestError(message || '网络连接失败，请检查网络', err?.code || -1, undefined, error);
}

function buildDedupeKey(method: string, url: string, data: unknown) {
  return `${method}:${url}:${stableStringify(data)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

function getCurrentRoute() {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  if (!current) return '';
  const route = current.route?.startsWith('/') ? current.route : `/${current.route}`;
  const options = (current as unknown as { options?: Record<string, string> }).options || {};
  const query = Object.keys(options).map((key) => `${key}=${encodeURIComponent(options[key])}`).join('&');
  return query ? `${route}?${query}` : route;
}
