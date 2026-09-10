import type { Position } from './position';

// ══════════════════════════════════════════════════════════════════════
// Непрерывное слежение за позицией — второе и последнее место в проекте,
// где вызывается `navigator.geolocation`.
//
// ОТДЕЛЬНО ОТ `readPosition`, ПОТОМУ ЧТО ЗАДАЧА ОБРАТНАЯ. Отметке визита
// нужен один ответ и как можно скорее: не успел за восемь секунд — идём
// без места. Записи дня спешить некуда, зато ей нужна ТОЧНОСТЬ и
// свежесть: замер минутной давности здесь означал бы, что человек «стоял»
// там, откуда уже уехал. Поэтому здесь `maximumAge: 0` и своего таймаута
// нет вовсе — слежение просто ждёт, пока приёмник поймает небо.
//
// НИКОГДА НЕ БРОСАЕТ. Отказ в доступе, выключенный GPS, старый браузер —
// это будни, а не исключения. Обо всех сообщаем через `onFail` одним
// понятным словом, чтобы экран мог сказать человеку, что делать.
// ══════════════════════════════════════════════════════════════════════

/** Почему слежение не идёт. Разные причины требуют разных слов на экране. */
export type WatchFailure = 'unsupported' | 'denied' | 'unavailable';

export interface WatchSample extends Position {
  /** Момент замера по часам браузера. */
  at: number;
  /** Метры в секунду и градусы — если приёмник их дал. */
  speedMps: number | null;
  headingDeg: number | null;
}

/** Остановить слежение. Вызывать дважды безопасно. */
export type StopWatch = () => void;

export function watchPosition(
  onSample: (sample: WatchSample) => void,
  onFail: (reason: WatchFailure) => void,
): StopWatch {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onFail('unsupported');
    return () => {};
  }

  let id: number | null = null;
  try {
    id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed, heading } = pos.coords;
        // Те же проверки на разумность, что у разовой позиции: эмуляторы
        // и сломанные датчики отдают нули и NaN, а ноль-ноль — это точка
        // в Атлантике.
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        if (latitude === 0 && longitude === 0) return;
        onSample({
          latitude,
          longitude,
          accuracyM: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
          // Время берём из замера, а не из `Date.now()`: браузер отдаёт
          // накопленные точки пачкой, и все они получили бы один момент.
          at: Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now(),
          speedMps: typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed : null,
          headingDeg:
            typeof heading === 'number' && Number.isFinite(heading) && heading >= 0 && heading < 360
              ? Math.round(heading)
              : null,
        });
      },
      (error) => {
        // `PERMISSION_DENIED` — единственный отказ, который человек может
        // исправить сам, и говорить о нём надо иначе, чем о потерянном
        // небе в подвале.
        onFail(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        // Таймаут щедрый: холодный старт приёмника под крышей занимает
        // полминуты и больше. Короткий превратил бы обычный подвал в
        // поток отказов, и экран мигал бы предупреждением всю смену.
        timeout: 60_000,
      },
    );
  } catch {
    onFail('unsupported');
    return () => {};
  }

  return () => {
    if (id === null) return;
    try {
      navigator.geolocation.clearWatch(id);
    } catch {
      // Слежение уже снято браузером — не повод падать при выходе.
    }
    id = null;
  };
}
