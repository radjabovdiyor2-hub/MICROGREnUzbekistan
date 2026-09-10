// ══════════════════════════════════════════════════════════════════════
// Мост в родную оболочку — единственное место, где витрина знает про APK.
//
// ПОЧЕМУ БЕЗ ЗАВИСИМОСТЕЙ. Приложение — это Capacitor, который открывает
// НАСТОЯЩИЙ сайт в системном WebView и подмешивает туда свой мост
// `window.Capacitor`. Ставить пакеты Capacitor в сборку Next.js незачем:
// в браузере они мертвы, а в приложении мост уже есть. Одна лишняя
// зависимость в главном бандле дороже двадцати строк здесь.
//
// ЕСЛИ МОСТА НЕТ — ЭТО ОБЫЧНЫЙ БРАУЗЕР, и всё продолжает работать
// по-старому. Ни один экран не должен спрашивать «а есть ли приложение»:
// об этом знает только этот модуль.
// ══════════════════════════════════════════════════════════════════════

/** То немногое из моста Capacitor, чем мы пользуемся. */
interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: <T>(name: string) => T;
}

declare global {
  interface Window {
    Capacitor?: CapacitorBridge;
  }
}

/** Мы внутри приложения? В браузере — всегда `false`. */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = window.Capacitor;
  if (!bridge) return false;
  // `isNativePlatform` появился не сразу; наличие моста само по себе уже
  // означает оболочку, но спрашиваем честно, когда есть кого спросить.
  return bridge.isNativePlatform ? bridge.isNativePlatform() === true : true;
}

/** Какая оболочка: `android`, `ios` или `web`. */
export function nativePlatform(): string {
  if (typeof window === 'undefined') return 'web';
  return window.Capacitor?.getPlatform?.() ?? 'web';
}

/**
 * Родной модуль по имени. `null` — мы в браузере или модуля нет в сборке.
 *
 * Проверять на `null` обязан вызывающий: приложение старой версии может не
 * иметь нужного модуля, и падать из-за этого весь экран не должен.
 */
export function nativePlugin<T>(name: string): T | null {
  if (typeof window === 'undefined') return null;
  const register = window.Capacitor?.registerPlugin;
  if (!register) return null;
  try {
    return register<T>(name);
  } catch {
    return null;
  }
}
