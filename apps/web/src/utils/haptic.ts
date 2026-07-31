export const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' = 'light') => {
  if (typeof window !== 'undefined') {
    // 1. Try Telegram native Haptic Feedback (Works on iOS and Android)
    const tg = window.Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      if (['light', 'medium', 'heavy'].includes(type)) {
        tg.HapticFeedback.impactOccurred(type);
      } else if (type === 'success') {
        tg.HapticFeedback.notificationOccurred('success');
      } else if (type === 'warning') {
        tg.HapticFeedback.notificationOccurred('warning');
      }
      return;
    }

    // 2. Fallback to standard web vibration API (Android only usually)
    if (window.navigator && window.navigator.vibrate) {
      try {
        switch (type) {
          case 'light': window.navigator.vibrate(30); break;
          case 'medium': window.navigator.vibrate(60); break;
          case 'heavy': window.navigator.vibrate(100); break;
          case 'success': window.navigator.vibrate([30, 50, 60]); break;
          case 'warning': window.navigator.vibrate([60, 50, 60, 50, 100]); break;
          default: window.navigator.vibrate(30);
        }
      } catch {
        // Вибрация — украшение: браузер вправе её запретить, и это не ошибка.
      }
    }
  }
};
