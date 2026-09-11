import type { StopWatch, WatchFailure, WatchSample } from '@/lib/geo/watch';

import { isNativeApp, nativePlugin } from './bridge';

// ══════════════════════════════════════════════════════════════════════
// Слежение за позицией СИСТЕМОЙ, а не вкладкой.
//
// РАДИ ЭТОГО И ДЕЛАЛОСЬ ПРИЛОЖЕНИЕ. `navigator.geolocation` работает,
// пока вкладка на экране: свернул — замолчал, на iOS почти сразу. Родная
// служба Android пишет с погашенным экраном и телефоном в кармане — то
// есть ровно в том положении, в котором телефон и находится весь день.
//
// ПОСТОЯННОЕ УВЕДОМЛЕНИЕ — НЕ ФОРМАЛЬНОСТЬ. Android не даёт фоновую
// геопозицию без видимого уведомления, и это правильно: человек обязан
// видеть, что его пишут. Текст уведомления говорит прямо — «смена идёт,
// маршрут записывается», — а не прячется за «приложение работает».
//
// Форма ответа та же, что у `watchPosition`, поэтому вызывающий не знает,
// откуда пришла точка, и не должен знать.
// ══════════════════════════════════════════════════════════════════════

/** Точка от родной службы. Поля — как отдаёт плагин. */
interface NativeLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  bearing: number | null;
  time: number | null;
}

interface NativeError {
  code?: string;
  message?: string;
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundTitle: string;
      backgroundMessage: string;
      requestPermissions: boolean;
      stale: boolean;
      distanceFilter: number;
    },
    callback: (location?: NativeLocation, error?: NativeError) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}

/** Имя модуля в оболочке. Совпадает с `apps/mobile`. */
const PLUGIN = 'BackgroundGeolocation';

/** Модуль уведомлений — только ради права их показывать. */
const NOTICE_PLUGIN = 'LocalNotifications';

interface NoticePermissions {
  checkPermissions(): Promise<{ display: string }>;
  requestPermissions(): Promise<{ display: string }>;
}

/**
 * Спросить право показывать постоянное уведомление.
 *
 * ЗАЧЕМ ОТДЕЛЬНО. Модуль геопозиции просит только доступ к координатам —
 * право на уведомления он не запрашивает вовсе. На Android 13+ без него
 * постоянное уведомление «Смена идёт» НЕ ПОКАЗЫВАЕТСЯ: служба работает, а
 * человек не видит, что его пишут. Для этого проекта это не мелочь —
 * видимость записи здесь часть уговора, а не украшение.
 *
 * ОТКАЗ НЕ ОСТАНАВЛИВАЕТ ЗАПИСЬ. Право на уведомление и право на
 * геопозицию — разные вещи; молча выключить трек из-за первого значило бы
 * наказать за не тот отказ.
 */
async function askForNotice(): Promise<void> {
  const plugin = nativePlugin<NoticePermissions>(NOTICE_PLUGIN);
  if (!plugin) return;
  const state = await plugin.checkPermissions();
  if (state.display === 'granted') return;
  await plugin.requestPermissions();
}

/**
 * Тот же порог, что у записи в браузере: 25 метров.
 *
 * Родная служба фильтрует сама, до пробуждения приложения, — поэтому
 * число здесь, а не только в очереди. Оставить ноль значит будить телефон
 * на каждый метр дрожи приёмника и сажать батарею за полдня.
 */
const DISTANCE_FILTER_M = 25;

/**
 * Начать слежение системой. `null` — оболочки нет, слежение не начато.
 *
 * Вызывающий обязан проверить `null` и взять браузерный путь: приложение
 * старой версии может не иметь модуля вовсе.
 */
export function watchNative(
  onSample: (sample: WatchSample) => void,
  onFail: (reason: WatchFailure) => void,
): StopWatch | null {
  if (!isNativeApp()) return null;
  const plugin = nativePlugin<BackgroundGeolocationPlugin>(PLUGIN);
  if (!plugin) return null;

  let watcherId: string | null = null;
  let stopped = false;

  // Право на уведомление спрашиваем ДО службы и не ждём ответа: служба не
  // должна стоять из-за него, а отказ ничего не ломает.
  void askForNotice().catch((error) => {
    console.error('[geo] право на уведомление не выдано:', error);
  });

  plugin
    .addWatcher(
      {
        backgroundTitle: 'Смена идёт',
        backgroundMessage: 'Маршрут записывается. Закончите смену — запись остановится.',
        // Разрешение спрашивает система, и спрашивает один раз. Отказ —
        // это `NOT_AUTHORIZED` в колбэке, а не молчание.
        requestPermissions: true,
        // Устаревшую точку из кэша не берём: замер минутной давности
        // означал бы, что человек «стоит» там, откуда уже уехал.
        stale: false,
        distanceFilter: DISTANCE_FILTER_M,
      },
      (location, error) => {
        if (error) {
          onFail(error.code === 'NOT_AUTHORIZED' ? 'denied' : 'unavailable');
          return;
        }
        if (!location) return;

        const { latitude, longitude, accuracy, speed, bearing, time } = location;
        // Те же проверки на разумность, что и у браузера: ноль-ноль — это
        // точка в Атлантике, а не позиция.
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        if (latitude === 0 && longitude === 0) return;

        onSample({
          latitude,
          longitude,
          accuracyM: typeof accuracy === 'number' && Number.isFinite(accuracy)
            ? Math.round(accuracy)
            : null,
          at: typeof time === 'number' && Number.isFinite(time) ? time : Date.now(),
          speedMps: typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed : null,
          headingDeg:
            typeof bearing === 'number' && Number.isFinite(bearing) && bearing >= 0 && bearing < 360
              ? Math.round(bearing)
              : null,
        });
      },
    )
    .then((id) => {
      watcherId = id;
      // Успели остановить, пока служба заводилась, — снимаем сразу, иначе
      // она пишет в пустоту до конца дня.
      if (stopped) void plugin.removeWatcher({ id });
    })
    .catch(() => onFail('unavailable'));

  return () => {
    stopped = true;
    if (watcherId === null) return;
    const id = watcherId;
    watcherId = null;
    void plugin.removeWatcher({ id }).catch(() => {
      // Служба уже снята системой — не повод падать при выходе.
    });
  };
}
