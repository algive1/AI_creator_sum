<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app';
import { useConfigStore } from './stores/config';
import { useUserStore } from './stores/user';
import { useAuthStore } from './stores/auth';

let lastProfileLoad = 0;
const PROFILE_RELOAD_INTERVAL = 30_000; // 30 秒内不重复加载

onLaunch(() => {
  const config = useConfigStore();
  config.hydrate();
  config.loadPublicConfig().catch(() => undefined);
});

onShow(async () => {
  const auth = useAuthStore();
  await auth.hydrate();
  if (auth.isLoggedIn) {
    const now = Date.now();
    if (now - lastProfileLoad > PROFILE_RELOAD_INTERVAL) {
      lastProfileLoad = now;
      useUserStore().loadFullProfile().catch(() => undefined);
    }
  }
});
</script>

<style lang="scss">
@use './styles/common.scss';
</style>
