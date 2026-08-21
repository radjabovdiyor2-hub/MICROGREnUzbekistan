// ══════════════════════════════════════════════════════════════════════
// Навигация к заведению: ссылки в мобильные навигаторы.
//
// До этого «Маршрут» на карте вёл на `2gis.uz/geo/<lon>,<lat>` — страницу
// МЕСТА в вебе, а не маршрут. На телефоне открывался браузер, показывал
// точку, и дальше человек вбивал адрес в навигатор руками. Кнопка была, а
// навигации не было.
//
// ПОЧЕМУ ВЫБОР, А НЕ ОДНА ССЫЛКА
//
// Узнать из браузера, какой навигатор стоит у человека, нельзя — такого
// API нет ни в одной платформе. Поэтому даём выбрать один раз и помним
// выбор: дальше это одно нажатие. Гадать за него — значит регулярно
// открывать не то приложение.
//
// ПОЧЕМУ https, А НЕ СХЕМЫ ПРИЛОЖЕНИЙ
//
// `https://yandex.uz/maps/...` мобильная ОС отдаёт установленному
// приложению сама, а если его нет — открывает сайт. Схема `yandexnavi://`
// так не умеет: без приложения она не делает НИЧЕГО — пустой экран без
// ошибки. Поэтому схема есть только у Навигатора (у него нет универсальной
// ссылки), и к ней приложен запасной путь — см. `fallbackUrl`.
// ══════════════════════════════════════════════════════════════════════

export interface NavApp {
  id: string;
  ru: string;
  uz: string;
  /** Ссылка на построение маршрута до точки. */
  url: (lat: number, lon: number) => string;
  /**
   * Куда уйти, если ссылка выше — схема приложения и оно не установлено.
   * Пусто у тех, чья ссылка https: она сама открывает сайт.
   */
  fallbackUrl?: (lat: number, lon: number) => string;
}

/**
 * Координата в ссылке — всегда точка, независимо от локали.
 *
 * `String(41,31)` в русской локали дал бы «41,31» через запятую, а запятая
 * в этих URL разделяет широту и долготу: маршрут ушёл бы в никуда, и
 * молча — навигатор просто показал бы другое место.
 */
function coord(value: number): string {
  return value.toFixed(6);
}

/**
 * Порядок — узбекистанский: Яндекс здесь основной навигатор, 2ГИС силён
 * по заведениям, Google в Узбекистане слабее по адресам и пробкам.
 */
export const NAV_APPS: NavApp[] = [
  {
    id: 'yandexnavi',
    ru: 'Яндекс Навигатор',
    uz: 'Yandex Navigator',
    url: (lat, lon) =>
      `yandexnavi://build_route_on_map?lat_to=${coord(lat)}&lon_to=${coord(lon)}`,
    fallbackUrl: (lat, lon) =>
      `https://yandex.uz/maps/?rtext=~${coord(lat)},${coord(lon)}&rtt=auto`,
  },
  {
    id: 'yandexmaps',
    ru: 'Яндекс Карты',
    uz: 'Yandex Xaritalar',
    url: (lat, lon) => `https://yandex.uz/maps/?rtext=~${coord(lat)},${coord(lon)}&rtt=auto`,
  },
  {
    id: '2gis',
    ru: '2ГИС',
    uz: '2GIS',
    // У 2ГИС координаты в маршруте идут ДОЛГОТА,ШИРОТА — наоборот к Яндексу.
    url: (lat, lon) => `https://2gis.uz/routeSearch/rsType/car/to/${coord(lon)},${coord(lat)}`,
  },
  {
    id: 'google',
    ru: 'Google Карты',
    uz: 'Google Xaritalar',
    url: (lat, lon) =>
      `https://www.google.com/maps/dir/?api=1&destination=${coord(lat)},${coord(lon)}&travelmode=driving`,
  },
];

export const DEFAULT_NAV_APP = NAV_APPS[0].id;

export function navApp(id: string | null | undefined): NavApp {
  return NAV_APPS.find((a) => a.id === id) ?? NAV_APPS[0];
}

/** Ключ в localStorage: выбор навигатора переживает перезагрузку. */
export const NAV_APP_KEY = 'mg-nav-app';

/**
 * Маршрут через несколько точек — для объезда.
 *
 * Поддерживают не все: у 2ГИС промежуточные точки в URL не описаны, и
 * подсовывать ему конечную вместо полного объезда значит соврать. Такие
 * возвращают null, и вызывающий честно скажет, что объезд целиком умеют
 * Яндекс и Google.
 */
export function buildMultiStopUrl(
  id: string,
  stops: { latitude: number; longitude: number }[],
): string | null {
  if (stops.length === 0) return null;

  if (id === 'yandexnavi' || id === 'yandexmaps') {
    // `rtext` — точки через тильду. Первая пустая означает «от меня».
    const points = stops.map((s) => `${coord(s.latitude)},${coord(s.longitude)}`).join('~');
    return `https://yandex.uz/maps/?rtext=~${points}&rtt=auto`;
  }

  if (id === 'google') {
    const last = stops[stops.length - 1];
    const middle = stops.slice(0, -1);
    const waypoints = middle
      .map((s) => `${coord(s.latitude)},${coord(s.longitude)}`)
      .join('|');
    return (
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${coord(last.latitude)},${coord(last.longitude)}` +
      (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '') +
      `&travelmode=driving`
    );
  }

  return null;
}
