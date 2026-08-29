// ══════════════════════════════════════════════════════════════════════
// Подтверждение владения доменом.
//
// Каждая площадка требует доказать, что сайт наш, и делает это одинаково:
// просит положить в `<head>` метку со своим токеном. Без неё Merchant
// Center не примет фид, Meta не даст включить каталог для рекламы, а
// Яндекс.Вебмастер не покажет ни одной ошибки индексации.
//
// ПОЧЕМУ ПУСТЫЕ МЕТКИ НЕ ВЫВОДИМ
//
// `<meta name="facebook-domain-verification" content="">` — это не
// «ещё не настроено», а неверный токен: площадка читает его, не находит
// совпадения и помечает домен как непройденный. Пустая строка в
// переменной окружения (а она там появляется сама — `KEY=` в `.env`)
// должна означать «метки нет вовсе».
// ══════════════════════════════════════════════════════════════════════

/** Токены площадок из окружения. Пустые и пробельные значения — как отсутствующие. */
export function domainVerification(
  env: Record<string, string | undefined>,
): Record<string, string> | undefined {
  const tags: Record<string, string> = {};

  const add = (name: string, raw: string | undefined) => {
    const value = (raw ?? '').trim();
    if (value) tags[name] = value;
  };

  add('yandex-verification', env.NEXT_PUBLIC_YANDEX_VERIFICATION);
  // Нужна для каталога Meta: без неё домен в кабинете рекламы остаётся
  // непроверенным, а товарные объявления по каталогу не запускаются.
  add('facebook-domain-verification', env.NEXT_PUBLIC_FACEBOOK_DOMAIN_VERIFICATION);

  return Object.keys(tags).length > 0 ? tags : undefined;
}
