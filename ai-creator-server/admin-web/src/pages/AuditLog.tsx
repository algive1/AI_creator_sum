import { useEffect, useState } from 'react';
import { Table, Tag } from 'antd';
import api from '../services/api';

export default function AuditLog() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const fetch = (page = 1) => {
    setLoading(true);
    api.get('/settings/logs', { params: { page, pageSize: 20 } }).then((r: any) => {
      setData(r.data?.list || []);
      setPagination(prev => ({ ...prev, current: page, total: r.data?.pagination?.total || 0 }));
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const actionLabels: Record<string, string> = { update: '修改', create: '新增', delete: '删除' };

  const columns = [
    { title: '管理员', dataIndex: 'admin_name', width: 100 },
    { title: '分组', dataIndex: 'config_group', width: 80 },
    { title: '配置项', dataIndex: 'config_key', width: 180 },
    { title: '操作', dataIndex: 'action', width: 60, render: (v: string) => <Tag>{actionLabels[v] || v}</Tag> },
    { title: '旧值', dataIndex: 'old_value_masked', width: 140, ellipsis: true },
    { title: '新值', dataIndex: 'new_value_masked', width: 140, ellipsis: true },
    { title: 'IP', dataIndex: 'ip_address', width: 120 },
    { title: '时间', dataIndex: 'created_at', width: 170 },
  ];

  return (
    <div>
      <h2>操作日志</h2>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={pagination} onChange={(p: any) => fetch(p.current)} size="middle" />
    </div>
  );
}
