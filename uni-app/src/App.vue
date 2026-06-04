<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app';
import { useConfigStore } from './stores/config';
import { useUserStore } from './stores/user';
import { useAuthStore } from './stores/auth';

onLaunch(() => {
  const config = useConfigStore();
  config.hydrate();
  config.loadPublicConfig().catch(() => undefined);
});

onShow(() => {
  const auth = useAuthStore();
  if (auth.isLoggedIn) {
    useUserStore().loadFullProfile().catch(() => undefined);
  }
});
</script>

<style lang="scss">
@use './styles/common.scss';
</style>
