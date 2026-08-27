import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Descriptions, Drawer, Form, Input, InputNumber, Modal, Row, Select, Space, Statistic, Table, Tag, message } from 'antd';
import { CrownOutlined, PlusCircleOutlined, UserOutlined } from '@ant-design/icons';
import api from '../services/api';
import { MEMBER_LEVEL_LABELS, labelOf } from '../utils/adminLabels';

function formatDate(d: string | null) {
  if (!d) return '-'; const date = new Date(d);
  return Number.isNaN(date.getTime()) ? d : date.toISOString().slice(0, 10);
}
function formatLastActive(d: string | null) {
  if (!d) return '-'; const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  const diff = Date.now() - date.getTime();
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  return date.toISOString().slice(0, 10);
}

export default function Users() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [stats, setStats] = useState<any>({});
  const [keyword, setKeyword] = useState('');
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;
  const [memberFilter, setMemberFilter] = useState<string>();
  const [statusFilter, setStatusFilter] = useState<string>();
  const [detailUser, setDetailUser] = useState<any>(null);
  const [membershipUser, setMembershipUser] = useState<any>(null);
  const [pointsUser, setPointsUser] = useState<any>(null);
  const [memberForm] = Form.useForm();
  const [pointsForm] = Form.useForm();
  const [plans, setPlans] = useState<any[]>([]);
  const [membershipSaving, setMembershipSaving] = useState(false);

  const fetchUsers = useCallback((page = 1, keywordValue = keywordRef.current) => {
    setLoading(true);
    const params: any = { page, pageSize: 20 };
    if (keywordValue) params.keyword = keywordValue;
    if (memberFilter) params.memberLevel = memberFilter;
    if (statusFilter) params.status = statusFilter;
    api.get('/users', { params }).then((r: any) => {
      setData(r.data.list || []); setPagination(p => ({ ...p, current: page, total: r.data.pagination?.total || 0 }));
      if (r.data.stats) setStats(r.data.stats);
    }).finally(() => setLoading(false));
  }, [memberFilter, statusFilter]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const fetchPlans = () => { api.get('/membership/plans').then((r: any) => setPlans(r.data || [])); };

  const openDetail = async (uid: number) => {
    try {
      const r: any = await api.get('/users/' + uid);
      const d = r.data || {}, u = d.user || {}, p = d.points || {};
      const m = (d.memberships || []).find((x: any) => x.status === 'active' && new Date(x.expire_at) > new Date());
      setDetailUser({ userId: u.id, nickname: u.nickname, phone: u.phone, membershipLevel: m?.level_after || 'free', memberExpireAt: m?.expire_at, points: p.balance || 0, totalEarned: p.total_earned || 0, totalSpent: p.total_spent || 0, imageCreations: (d.tasks || []).filter((t: any) => t.task_type === 'image').length, videoCreations: (d.tasks || []).filter((t: any) => t.task_type === 'video').length, status: u.status, createdAt: u.createdAt || u.created_at, memberships: d.memberships || [], pointLogs: (d.pointLogs || []).slice(0, 10), tasks: (d.tasks || []).slice(0, 5) });
      fetchPlans();
    } catch { message.error('获取用户详情失败'); }
  };

  const openMembership = (r: any) => {
    setMembershipUser(r);
    const activeMembership = (r.memberships || []).find((m: any) => m.status === 'active' && new Date(m.expire_at).getTime() > Date.now());
    memberForm.resetFields();
    memberForm.setFieldsValue({
      target: activeMembership?.plan_id ? String(activeMembership.plan_id) : 'free',
      durationDays: 30,
    });
  };
  const saveMembership = async () => {
    try {
      const v = await memberForm.validateFields();
      setMembershipSaving(true);
      if (v.target === 'free') {
        await api.put('/users/' + membershipUser.userId + '/membership', { level: 'free', durationDays: 0 });
      } else {
        await api.put('/users/' + membershipUser.userId + '/membership', { planId: Number(v.target), durationDays: v.durationDays });
      }
      message.success('已调整');
      const userId = membershipUser.userId;
      setMembershipUser(null);
      fetchUsers(pagination.current);
      if (detailUser?.userId === userId) await openDetail(userId);
    } catch (e: any) {
      if (!e?.errorFields) message.error(e?.response?.data?.message || '调整会员失败');
    } finally {
      setMembershipSaving(false);
    }
  };
  const openPoints = (r: any) => { setPointsUser(r); pointsForm.resetFields(); pointsForm.setFieldsValue({ amount: 0, reason: '后台调整' }); };
  const savePoints = async () => { const v = await pointsForm.validateFields(); await api.put('/users/' + pointsUser.userId + '/points', v); message.success('已调整'); setPointsUser(null); };
  const handleBan = (uid: number, cur: string) => { const b = cur === 'banned'; Modal.confirm({ title: b ? '确认解封？' : '确认封禁？', onOk: () => { api.put('/users/' + uid + '/status', { status: b ? 'normal' : 'banned' }).then(() => { message.success(b ? '已解封' : '已封禁'); fetchUsers(pagination.current); }); } }); };

  const cols = [
    { title: '用户 ID', dataIndex: 'userId', width: 80 },
    { title: '用户', width: 130, render: (_: any, r: any) => <span><UserOutlined style={{ marginRight: 6, color: '#8b5cf6' }} />{r.nickname || '未设置'}</span> },
    { title: '手机号', dataIndex: 'phone', width: 130, render: (v: string) => v || '-' },
    { title: '积分', dataIndex: 'points', width: 80, render: (v: number) => <strong>{v || 0}</strong> },
    { title: '会员等级', dataIndex: 'memberLevel', width: 100, render: (v: string) => <Tag color={v === 'free' ? 'default' : 'blue'}>{labelOf(MEMBER_LEVEL_LABELS, v, '普通用户')}</Tag> },
    { title: '会员到期', dataIndex: 'memberExpireAt', width: 105, render: (v: string) => v ? formatDate(v) : <span style={{ color: '#999' }}>-</span> },
    { title: '图片', dataIndex: 'imageCreations', width: 70 },
    { title: '视频', dataIndex: 'videoCreations', width: 70 },
    { title: '最近活跃', dataIndex: 'lastLoginAt', width: 95, render: (v: string) => formatLastActive(v) },
    { title: '注册', dataIndex: 'createdAt', width: 100, render: (v: string) => formatDate(v) },
    { title: '操作', width: 120, fixed: 'right' as const, render: (_: any, r: any) => (
      <Space size={4}><Button size="small" type="primary" onClick={() => openDetail(r.userId)}>详情</Button><Button size="small" danger={r.status !== 'banned'} onClick={() => handleBan(r.userId, r.status)}>{r.status === 'banned' ? '解封' : '封禁'}</Button></Space>)},
  ];

  return (
    <div>
      <h2>用户管理</h2>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="总用户" value={stats.totalUsers || 0} prefix={<UserOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="今日新增" value={stats.todayNew || 0} valueStyle={{ color: '#3f8600' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="会员用户" value={stats.memberUsers || 0} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="封禁用户" value={stats.bannedUsers || 0} valueStyle={{ color: '#999' }} /></Card></Col>
      </Row>
      <Space style={{ marginBottom: 12 }}>
        <Input.Search placeholder="搜索昵称/ID" style={{ width: 200 }} onSearch={(v) => { setKeyword(v); fetchUsers(1, v); }} />
        <Select placeholder="会员等级" allowClear style={{ width: 130 }} value={memberFilter} onChange={setMemberFilter} options={[{ label: '普通用户', value: 'free' }, { label: '专业会员', value: 'pro' }, { label: '商业会员', value: 'business' }]} />
        <Select placeholder="状态" allowClear style={{ width: 100 }} value={statusFilter} onChange={setStatusFilter} options={[{ label: '正常', value: 'normal' }, { label: '封禁', value: 'banned' }]} />
      </Space>
      <Table rowKey="userId" columns={cols} dataSource={data} loading={loading} pagination={pagination} onChange={(p: any) => fetchUsers(p.current)} size="middle" scroll={{ x: 1200 }} />

      <Drawer title={`用户详情：${detailUser?.nickname || ''}`} open={!!detailUser} onClose={() => setDetailUser(null)} width={520}>
        {detailUser && (<div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 8 }}>
            <UserOutlined style={{ fontSize: 32, color: '#8b5cf6' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{detailUser.nickname || '未设置'} <span style={{ color: '#999', fontWeight: 400, fontSize: 13 }}>ID: {detailUser.userId}</span></div>
              <Tag color={detailUser.status === 'banned' ? 'red' : 'green'}>{detailUser.status === 'banned' ? '封禁' : '正常'}</Tag>
            </div>
          </div>

          <Descriptions column={3} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="手机号">{detailUser.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="积分">{detailUser.points || 0}</Descriptions.Item>
            <Descriptions.Item label="会员">{labelOf(MEMBER_LEVEL_LABELS, detailUser.membershipLevel, '普通用户')}{detailUser.memberExpireAt ? <span style={{ color: '#888', fontSize: 11, marginLeft: 4 }}>· {formatDate(detailUser.memberExpireAt)}到期</span> : ''}</Descriptions.Item>
            <Descriptions.Item label="创作">生图{detailUser.imageCreations || 0} 生视频{detailUser.videoCreations || 0}</Descriptions.Item>
          </Descriptions>

          <Space style={{ marginBottom: 16 }}>
            <Button icon={<CrownOutlined />} onClick={() => openMembership(detailUser)}>调整会员</Button>
            <Button icon={<PlusCircleOutlined />} onClick={() => openPoints(detailUser)}>调整积分</Button>
          </Space>

          {detailUser.memberships?.length > 0 && (
            <Card size="small" title="会员记录" style={{ marginBottom: 12 }}>
              {detailUser.memberships.slice(0, 5).map((m: any, i: number) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: i < Math.min(detailUser.memberships.length, 5) - 1 ? '1px solid #f0f0f0' : 'none', fontSize: 12 }}>
                  <Tag color="blue">{m.level_after}</Tag>
                  {m.plan_name && <span style={{ color: '#666', marginRight: 8 }}>{m.plan_name}</span>}
                  {formatDate(m.started_at)} → {formatDate(m.expire_at)}
                  {m.status === 'active' && <Tag color="green" style={{ marginLeft: 4 }}>有效</Tag>}
                </div>
              ))}
            </Card>
          )}

          {detailUser.pointLogs?.length > 0 && (
            <Card size="small" title="积分流水(最近)" style={{ marginBottom: 12 }}>
              {detailUser.pointLogs.map((l: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: i < detailUser.pointLogs.length - 1 ? '1px solid #fafafa' : 'none', fontSize: 12 }}>
                  <Space size={8}>
                    <span style={{ color: l.amount > 0 ? '#3f8600' : '#cf1322', fontWeight: 600, minWidth: 48 }}>{l.amount > 0 ? '+' : ''}{l.amount}</span>
                    <span style={{ color: '#666' }}>{l.title || l.ref_type || l.source}</span>
                  </Space>
                  <span style={{ color: '#999' }}>{formatDate(l.created_at)}</span>
                </div>
              ))}
            </Card>
          )}

          {detailUser.tasks?.length > 0 && (
            <Card size="small" title="最近任务">
              {detailUser.tasks.map((t: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: i < detailUser.tasks.length - 1 ? '1px solid #fafafa' : 'none', fontSize: 12 }}>
                  <Space size={8}>
                    <Tag color={t.task_type === 'video' ? 'purple' : 'blue'} style={{ fontSize: 10 }}>{t.task_type === 'video' ? '视频' : '图片'}</Tag>
                    <span>#{t.id} {t.title || '无标题'}</span>
                    <Tag color={t.status === 'completed' ? 'green' : t.status === 'failed' ? 'red' : 'default'} style={{ fontSize: 10 }}>{t.status}</Tag>
                  </Space>
                  <span style={{ color: '#999' }}>{formatDate(t.created_at)}</span>
                </div>
              ))}
            </Card>
          )}
        </div>)}
      </Drawer>

      <Modal title={`调整会员：${membershipUser?.nickname || ''}`} open={!!membershipUser} onCancel={() => setMembershipUser(null)} onOk={saveMembership} confirmLoading={membershipSaving} destroyOnClose>
        <Form form={memberForm} layout="vertical">
          <Form.Item name="target" label="会员身份" rules={[{ required: true, message: '请选择会员身份' }]}>
            <Select
              options={[
                { label: '普通用户', value: 'free' },
                ...plans.map((p: any) => ({ label: `${p.name}（${p.durationDays || 0}天）`, value: String(p.id) })),
              ]}
            />
          </Form.Item>
          <Form.Item name="durationDays" label="有效天数" rules={[{ required: true, message: '请输入有效天数' }]}>
            <InputNumber min={1} max={3650} precision={0} style={{ width: 160 }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`调整积分：${pointsUser?.nickname || ''}`} open={!!pointsUser} onCancel={() => setPointsUser(null)} onOk={savePoints} destroyOnClose>
        <Form form={pointsForm} layout="vertical"><Form.Item name="amount" label="数量" rules={[{ required: true }]} extra="正数增加，负数扣除。"><InputNumber style={{ width: 160 }} /></Form.Item><Form.Item name="reason" label="原因" rules={[{ required: true }]}><Input /></Form.Item></Form></Modal>
    </div>
  );
}
