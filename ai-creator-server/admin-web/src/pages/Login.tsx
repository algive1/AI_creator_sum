import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import api from '../services/api';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res: any = await api.post('/auth/login', values);
      const token = res?.data?.token;
      if (!token) throw new Error('登录响应缺少 token');
      localStorage.setItem('admin_token', token);
      message.success('登录成功');
      nav('/');
    } catch (e: any) {
      if (!e?.response) message.error('登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 400 }}>
        <h2 style={{ textAlign: 'center', marginBottom: 32 }}>AI创作工坊 管理后台</h2>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>登录</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
