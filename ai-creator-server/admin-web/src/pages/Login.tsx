import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

interface AdminLoginResponse {
  code?: number;
  message?: string;
  data?: {
    token?: string;
  };
}

async function login(username: string, password: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch('/api/v1/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error('网络连接失败，请检查服务是否正常运行');
  }

  const body = await response.json().catch(() => null) as AdminLoginResponse | null;
  if (!response.ok || body?.code !== 0) {
    throw new Error(body?.message || '登录失败，请稍后重试');
  }
  if (!body.data?.token) {
    throw new Error('登录响应缺少 token');
  }
  return body.data.token;
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return '网络连接失败，请检查服务是否正常运行';
}

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const nav = useNavigate();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get('username') || '').trim();
    const password = String(formData.get('password') || '');
    if (!username || !password) {
      setErrorMessage('请输入用户名和密码');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const token = await login(username, password);
      localStorage.setItem('admin_token', token);
      nav('/', { replace: true });
    } catch (error) {
      setErrorMessage(loginErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <h1 id="login-title" className="login-title">AI创作工坊 管理后台</h1>
        <form className="login-form" onSubmit={onSubmit} noValidate>
          <div className="login-field">
            <label className="login-label" htmlFor="username">用户名</label>
            <input id="username" className="login-input" name="username" type="text" autoComplete="username" disabled={loading} />
          </div>
          <div className="login-field">
            <label className="login-label" htmlFor="password">密码</label>
            <input id="password" className="login-input" name="password" type="password" autoComplete="current-password" disabled={loading} />
          </div>
          {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
          <button className="login-submit" type="submit" disabled={loading}>{loading ? '登录中…' : '登录'}</button>
        </form>
      </section>
    </main>
  );
}
