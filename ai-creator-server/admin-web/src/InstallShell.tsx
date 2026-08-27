import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Install from './pages/Install';
import adminTheme from './adminTheme';

export default function InstallShell() {
  return (
    <ConfigProvider theme={adminTheme} locale={zhCN}>
      <AntApp>
        <Install />
      </AntApp>
    </ConfigProvider>
  );
}
