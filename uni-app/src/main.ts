import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { setAuthHandlers } from './api/request';
import { useAuthStore } from './stores/auth';

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
    onUnauthorized: () => auth.clearSession()
  });

  return {
    app,
    Pinia: pinia
  };
}
