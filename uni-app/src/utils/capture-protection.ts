type VisualEffect = 'hidden' | 'none';

let activeCount = 0;
let captureListenerAttached = false;

const captureHandler = () => {
  if (!activeCount) return;
  uni.showToast({
    title: '模板内容受保护，请勿截屏传播',
    icon: 'none'
  });
};

export function enableSensitiveCaptureProtection() {
  activeCount += 1;
  if (activeCount === 1) {
    setCaptureVisualEffect('hidden');
    attachCaptureListener();
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    activeCount = Math.max(0, activeCount - 1);
    if (!activeCount) {
      setCaptureVisualEffect('none');
      detachCaptureListener();
    }
  };
}

function setCaptureVisualEffect(visualEffect: VisualEffect) {
  // #ifdef MP-WEIXIN
  const wxApi = (globalThis as Record<string, any>).wx;
  if (wxApi && typeof wxApi.setVisualEffectOnCapture === 'function') {
    wxApi.setVisualEffectOnCapture({
      visualEffect,
      fail: () => undefined
    });
  }
  // #endif
}

function attachCaptureListener() {
  if (captureListenerAttached) return;
  const uniApi = uni as unknown as {
    onUserCaptureScreen?: (callback: () => void) => void;
  };
  if (typeof uniApi.onUserCaptureScreen !== 'function') return;
  uniApi.onUserCaptureScreen(captureHandler);
  captureListenerAttached = true;
}

function detachCaptureListener() {
  const uniApi = uni as unknown as {
    offUserCaptureScreen?: (callback: () => void) => void;
  };
  if (typeof uniApi.offUserCaptureScreen !== 'function') return;
  uniApi.offUserCaptureScreen(captureHandler);
  captureListenerAttached = false;
}
