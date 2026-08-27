import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { setAuthHandlers } from './api/request';
import { useAuthStore } from './stores/auth';
import { ensureLoggedIn } from './utils/login-guard';

export function createApp() {
  const app = createSSRApp(App);
  const pinia = createPinia();
  app.use(pinia);

  const auth = useAuthStore(pinia);
  auth.hydrate();
  setAuthHandlers({
    getToken: () => auth.token,
    getRefreshToken: () => auth.refreshToken,
    onTokenRefreshed: (payload) => auth.applyTokenRefresh(payload),
    onUnauthorized: () => auth.clearSession(),
    onLoginRequired: () => {
      ensureLoggedIn({ title: '登录已过期', subtitle: '请重新登录并授权手机号后继续使用。' }).catch(() => undefined);
    }
  });

  return {
    app,
    Pinia: pinia
  };
}
