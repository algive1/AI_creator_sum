export function assertPrompt(prompt: string) {
  const text = prompt.trim();
  if (!text) {
    uni.showToast({ title: '请输入提示词', icon: 'none' });
    return false;
  }
  if (text.length > 2000) {
    uni.showToast({ title: '提示词最多 2000 字', icon: 'none' });
    return false;
  }
  return true;
}
