// ══════════════════════════════════════════════════════════════════════
// Где сейчас стоит человек с телефоном.
//
// Единственное место в проекте, где вызывается `navigator.geolocation`
// напрямую. Карта берёт позицию из контрола MapLibre, а отметке визита
// нужен ответ здесь и сейчас, до отправки запроса.
//
// ГЛАВНОЕ СВОЙСТВО: НИКОГДА НЕ БРОСАЕТ И НИКОГДА НЕ ВИСНЕТ.
//
// Отказ в доступе, выключенный GPS, подвал ресторана, старый телефон —
// всё это обычные будни полевой работы, и ни одно из них не должно мешать
// отметить визит. Не получилось — возвращаем null, и отметка уходит без
// подтверждения места. Потерянная отметка хуже неподтверждённой.
//
// ПОЧЕМУ СВОЙ ТАЙМАУТ, А НЕ ТОЛЬКО `timeout` В ОПЦИЯХ
//
// Браузерный `timeout` считается с момента, когда РАЗРЕШЕНИЕ уже получено.
// Пока висит системный диалог «разрешить доступ к геопозиции», он не идёт
// вовсе, и обещание может не завершиться минутами. Продавец в этот момент
// смотрит на кнопку, которая не отвечает.
// ══════════════════════════════════════════════════════════════════════

export interface Position {
  latitude: number;
  longitude: number;
  /** Радиус круга неопределённости в метрах, как его называет браузер. */
  accuracyM: number | null;
}

/** Сколько ждём ответа, прежде чем отметить визит без места. */
export const POSITION_TIMEOUT_MS = 8000;

export function readPosition(timeoutMs: number = POSITION_TIMEOUT_MS): Promise<Position | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise<Position | null>((resolve) => {
    let done = false;
    const finish = (value: Position | null) => {
      if (done) return;
      done = true;
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        const { latitude, longitude, accuracy } = pos.coords;
        // Проверяем на разумность: эмуляторы и сломанные датчики отдают
        // нули и NaN, а ноль-ноль — это точка в Атлантике, и она честно
        // покажется «в 5000 км от клиента».
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return finish(null);
        if (latitude === 0 && longitude === 0) return finish(null);
        finish({
          latitude,
          longitude,
          accuracyM: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
        });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        // Позиция минутной давности годится: продавец за минуту не уезжает
        // из квартала, а свежий замер стоит секунд ожидания и заряда.
        maximumAge: 60_000,
      },
    );
  });
}
