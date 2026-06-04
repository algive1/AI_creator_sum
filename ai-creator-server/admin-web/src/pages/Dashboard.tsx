import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic } from 'antd';
import { UserOutlined, DollarOutlined, SafetyCertificateOutlined, CrownOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, GiftOutlined } from '@ant-design/icons';
import api from '../services/api';

export default function Dashboard() {
  const [data, setData] = useState<any>({});

  useEffect(() => { api.get('/stats/dashboard').then((r: any) => setData(r.data)); }, []);

  return (
    <div>
      <h2>数据看板</h2>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="总用户数" value={data?.totalUsers || 0} prefix={<UserOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="今日新增用户" value={data?.todayNewUsers || 0} prefix={<UserOutlined />} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="付费会员数" value={data?.payingMembers || 0} prefix={<CrownOutlined />} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="今日收入" value={'¥' + ((data?.todayRevenue || 0) / 100).toFixed(2)} prefix={<DollarOutlined />} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="排队中任务" value={data?.queuedTasks || 0} prefix={<ClockCircleOutlined />} valueStyle={{ color: data?.queuedTasks > 10 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="今日成功生成" value={data?.todaySuccess || 0} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="今日失败" value={data?.todayFailed || 0} prefix={<CloseCircleOutlined />} valueStyle={{ color: data?.todayFailed > 0 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="今日积分消耗" value={data?.todayPointsSpent || 0} prefix={<GiftOutlined />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="待审核" value={data?.pendingAudits || 0} prefix={<SafetyCertificateOutlined />} valueStyle={{ color: data?.pendingAudits > 0 ? '#fa8c16' : '#3f8600' }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
