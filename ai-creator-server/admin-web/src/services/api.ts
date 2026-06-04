import axios, { AxiosResponse } from 'axios';
import { message } from 'antd';

const api = axios.create({ baseURL: '/api/v1/admin' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});

api.interceptors.response.use(
  (res: AxiosResponse) => {
    const body = res.data;
    if (body && typeof body.code === 'number' && body.code !== 0) {
      const err: any = new Error(body.message || '请求失败');
      err.response = { ...res, data: body };
      message.error(body.message || '请求失败');
      return Promise.reject(err);
    }
    return body;
  },
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin_token');
      message.error('登录已过期，请重新登录');
      setTimeout(() => { window.location.href = '/login'; }, 1500);
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
