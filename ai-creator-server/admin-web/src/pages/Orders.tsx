import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Descriptions, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import api from '../services/api';
import { ORDER_TYPE_LABELS, STATUS_LABELS, labelOf } from '../utils/adminLabels';

const { Text } = Typography;

const payStatusOptions = [
  { value: 'unpaid', label: '未支付' },
  { value: 'paying', label: '支付中' },
  { value: 'paid', label: '已支付' },
  { value: 'closed', label: '已关闭' },
  { value: 'failed', label: '失败' },
];

const grantStatusOptions = [
  { value: 'pending', label: '待发放' },
  { value: 'granted', label: '已到账' },
  { value: 'failed', label: '发放失败' },
];

const statusMeta: Record<string, { color: string; text: string }> = {
  created: { color: 'default', text: '已创建' },
  paying: { color: 'processing', text: '支付中' },
  paid: { color: 'green', text: '已支付' },
  cancelled: { color: 'default', text: '已取消' },
  expired: { color: 'orange', text: '已过期' },
  closed: { color: 'default', text: '已关闭' },
  failed: { color: 'red', text: '失败' },
};

const payStatusMeta: Record<string, { color: string; text: string }> = {
  unpaid: { color: 'default', text: '未支付' },
  paying: { color: 'processing', text: '支付中' },
  paid: { color: 'green', text: '已支付' },
  closed: { color: 'default', text: '已关闭' },
  failed: { color: 'red', text: '失败' },
};

const grantStatusMeta: Record<string, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待发放' },
  granted: { color: 'green', text: '已到账' },
  failed: { color: 'red', text: '发放失败' },
};

function money(value: number): string {
  return `¥${(Number(value || 0) / 100).toFixed(2)}`;
}

function canRegrant(row: any): boolean {
  return row?.payStatus === 'paid' && ['pending', 'failed'].includes(String(row?.grantStatus || ''));
}

export default function Orders() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [payStatus, setPayStatus] = useState<string>();
  const [grantStatus, setGrantStatus] = useState<string>();
  const [orderType, setOrderType] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;
  const [detail, setDetail] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchOrders = useCallback(async (page = 1, keywordValue = keywordRef.current) => {
    setLoading(true);
    try {
      const res: any = await api.get('/payments/orders', {
        params: {
          page,
          pageSize: pagination.pageSize,
          payStatus,
          grantStatus,
          orderType,
          keyword: keywordValue || undefined,
        },
      });
      setData(res.data?.list || []);
      setPagination(prev => ({
        ...prev,
        current: page,
        total: res.data?.pagination?.total || 0,
      }));
    } finally {
      setLoading(false);
    }
  }, [grantStatus, orderType, pagination.pageSize, payStatus]);

  useEffect(() => {
    fetchOrders(1);
  }, [fetchOrders]);

  const openDetail = async (orderNo: string) => {
    const res: any = await api.get(`/payments/orders/${orderNo}`);
    setDetail(res.data);
    setDetailOpen(true);
  };

  const queryWechat = async (orderNo: string) => {
    await api.post(`/payments/orders/${orderNo}/query-wechat`);
    message.success('微信支付状态已同步');
    fetchOrders(pagination.current);
  };

  const regrant = (row: any) => {
    Modal.confirm({
      title: '重新发放订单权益？',
      content: `订单 ${row.orderNo} 已支付，但权益状态为 ${labelOf(STATUS_LABELS, row.grantStatus)}。是否继续？`,
      okText: '重新发放',
      cancelText: '取消',
      onOk: async () => {
        await api.post(`/payments/orders/${row.orderNo}/regrant`);
        message.success('权益已重新发放');
        fetchOrders(pagination.current);
      },
    });
  };

  const columns = [
    { title: '订单号', dataIndex: 'orderNo', width: 210 },
    {
      title: '订单类型',
      dataIndex: 'orderType',
      width: 120,
      render: (value: string) => value === 'points' ? <Tag color="blue">积分套餐</Tag> : <Tag color="purple">{labelOf(ORDER_TYPE_LABELS, value)}</Tag>,
    },
    {
      title: '支付状态',
      dataIndex: 'payStatus',
      width: 110,
      render: (value: string) => <Tag color={payStatusMeta[value]?.color}>{payStatusMeta[value]?.text || value}</Tag>,
    },
    {
      title: '权益状态',
      dataIndex: 'grantStatus',
      width: 120,
      render: (value: string) => <Tag color={grantStatusMeta[value]?.color}>{grantStatusMeta[value]?.text || value}</Tag>,
    },
    { title: '金额', dataIndex: 'amountTotal', width: 110, render: money },
    {
      title: '用户',
      width: 160,
      render: (_: any, row: any) => row.nickname || row.openid || row.userId || <Text type="secondary">-</Text>,
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 180 },
    { title: '支付时间', dataIndex: 'paidAt', width: 180, render: (value: string) => value || <Text type="secondary">-</Text> },
    {
      title: '操作',
      fixed: 'right' as const,
      width: 260,
      render: (_: any, row: any) => (
        <Space>
          <Button size="small" onClick={() => openDetail(row.orderNo)}>详情</Button>
          <Button size="small" onClick={() => queryWechat(row.orderNo)}>查询微信</Button>
          {canRegrant(row) && (
            <Button size="small" type="primary" onClick={() => regrant(row)}>重新发放</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h2>支付订单</h2>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="订单号 / 商品 / 用户 / 微信交易号"
          allowClear
          style={{ width: 320 }}
          onSearch={(value) => {
            const nextKeyword = value.trim();
            setKeyword(nextKeyword);
            fetchOrders(1, nextKeyword);
          }}
        />
        <Select placeholder="支付状态" allowClear style={{ width: 140 }} onChange={setPayStatus} options={payStatusOptions} />
        <Select placeholder="权益状态" allowClear style={{ width: 140 }} onChange={setGrantStatus} options={grantStatusOptions} />
        <Select
          placeholder="订单类型"
          allowClear
          style={{ width: 150 }}
          onChange={setOrderType}
          options={[{ value: 'points', label: '积分套餐' }, { value: 'membership', label: '会员套餐' }]}
        />
      </Space>
      <Table
        rowKey="orderNo"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={pagination}
        onChange={(pageInfo: any) => fetchOrders(pageInfo.current)}
        scroll={{ x: 1500 }}
      />

      <Modal
        title="支付订单详情"
        open={detailOpen}
        footer={null}
        width={760}
        onCancel={() => setDetailOpen(false)}
      >
        {detail && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="订单号">{detail.orderNo}</Descriptions.Item>
            <Descriptions.Item label="订单类型">{labelOf(ORDER_TYPE_LABELS, detail.orderType)}</Descriptions.Item>
            <Descriptions.Item label="订单状态"><Tag color={statusMeta[detail.status]?.color}>{statusMeta[detail.status]?.text || detail.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="支付状态"><Tag color={payStatusMeta[detail.payStatus]?.color}>{payStatusMeta[detail.payStatus]?.text || detail.payStatus}</Tag></Descriptions.Item>
            <Descriptions.Item label="权益状态"><Tag color={grantStatusMeta[detail.grantStatus]?.color}>{grantStatusMeta[detail.grantStatus]?.text || detail.grantStatus}</Tag></Descriptions.Item>
            <Descriptions.Item label="金额">{money(detail.amountTotal)}</Descriptions.Item>
            <Descriptions.Item label="商品">{detail.productName || '-'}</Descriptions.Item>
            <Descriptions.Item label="用户">{detail.nickname || detail.openid || detail.userId || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detail.createdAt || '-'}</Descriptions.Item>
            <Descriptions.Item label="支付时间">{detail.paidAt || '-'}</Descriptions.Item>
            <Descriptions.Item label="微信交易号" span={2}>{detail.wxTransactionId || '-'}</Descriptions.Item>
            <Descriptions.Item label="权益发放说明" span={2}>{detail.grantMessage || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
