import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Layout from './components/Layout';
import adminTheme from './adminTheme';

export default function AdminShell() {
  return (
    <ConfigProvider theme={adminTheme} locale={zhCN}>
      <AntApp>
        <Layout />
      </AntApp>
    </ConfigProvider>
  );
}
