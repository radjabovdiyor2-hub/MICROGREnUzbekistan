export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection' = 'light') {
  if (typeof window === 'undefined') return;
  
  const tg = (window as any).Telegram?.WebApp;
  if (!tg || !tg.HapticFeedback) return;

  try {
    if (type === 'selection') {
      tg.HapticFeedback.selectionChanged();
    } else if (['light', 'medium', 'heavy'].includes(type)) {
      tg.HapticFeedback.impactOccurred(type as 'light' | 'medium' | 'heavy');
    } else {
      tg.HapticFeedback.notificationOccurred(type as 'success' | 'warning' | 'error');
    }
  } catch (e) {
    // Ignore haptic errors
  }
}
