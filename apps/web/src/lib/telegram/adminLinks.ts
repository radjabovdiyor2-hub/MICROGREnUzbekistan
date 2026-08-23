// ══════════════════════════════════════════════════════════════════════
// Ссылки в админку для сообщений, которые шлёт САМА витрина.
//
// ЗАЧЕМ ВТОРАЯ ТАКАЯ ЖЕ
//
// В офисе это `apps/tgas/shared/admin_links.py`, и переиспользовать её
// нельзя: между приложениями нет импортов, только HTTP (см. конституцию).
// Ходить в офис ради построения строки было бы хуже копии — сообщение о
// заказе стало бы зависеть от живости соседнего контейнера.
//
// Поэтому здесь повторён КОНТРАКТ, а не код: тот же адрес
// `/admin?tab=…&focus=…`, то же правило про Mini App и то же поведение при
// незаданных переменных. Расхождение ловит тест: имена вкладок сверяются
// с `adminTabs.tsx` — единственным реестром экранов.
//
// ПОЧЕМУ ЭТО ВАЖНО
//
// Самое читаемое сообщение системы — «новый заказ» — вело в никуда: номер
// заказа в тексте был, а открыть его можно было только зайдя на сайт,
// вспомнив пароль и найдя вкладку глазами. То же у продажи в кассе, у
// возврата, у «кончается товар» и у дневного отчёта.
// ══════════════════════════════════════════════════════════════════════

/** Кнопка Telegram: либо Mini App, либо обычная ссылка. */
export interface TelegramButton {
  text: string;
  url?: string;
  web_app?: { url: string };
}

/** Подпись по умолчанию — та же, что у офиса: человек привыкает к одной. */
export const OPEN_TEXT = '🏢 Открыть в админке';

/**
 * Публичный адрес витрины без хвостового слэша.
 *
 * Переменная ОДНА и та же, что у офиса (`settings.public_web_url`): ссылку
 * на один и тот же экран строят обе половины, и разойдись источники —
 * половина кнопок вела бы не туда.
 *
 * Второй ступенью здесь стояла `NEXT_PUBLIC_SITE_URL`, которой нет ни в
 * `.env.example`, ни в compose. Незадекларированная переменная — это
 * функция, молча выключенная в проде; сторож `check_env_declared` ловит
 * ровно такое. Убрана, а не объявлена: задавать её было некому и незачем.
 */
function baseUrl(): string {
  const raw = process.env.PUBLIC_WEB_URL || 'https://microgreenuzbekistan.com';
  return raw.replace(/\/+$/, '');
}

/** Адрес экрана админки. `focus` — конкретная запись на нём. */
export function adminUrl(tab: string, focus?: string | null): string {
  let url = `${baseUrl()}/admin?tab=${encodeURIComponent(tab)}`;
  if (focus !== undefined && focus !== null && focus !== '') {
    url += `&focus=${encodeURIComponent(String(focus))}`;
  }
  return url;
}

/** Telegram ID владельцев — тот же список, что пускает в Mini App. */
function ownerIds(): Set<string> {
  return new Set(
    (process.env.OWNER_TELEGRAM_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

/**
 * Уместен ли здесь Mini App.
 *
 * Bot API разрешает `web_app` ТОЛЬКО в личной переписке: в групповом чате
 * Telegram отклонит сообщение целиком — то есть уведомление о заказе не
 * дойдёт вообще никуда. Идентификаторы групп отрицательные.
 *
 * Владельца сверяем отдельно: Mini App пускает в админку без пароля, и
 * предлагать эту дверь другим получателям `ADMIN_CHAT_ID` незачем.
 */
export function isOwnerDirectChat(chatId: string | number): boolean {
  const id = String(chatId).trim();
  if (id.startsWith('-')) return false;
  return ownerIds().has(id);
}

/** Кнопка «открыть экран» для КОНКРЕТНОГО получателя. */
export function openButton(
  chatId: string | number,
  tab: string,
  focus?: string | null,
  text: string = OPEN_TEXT,
): TelegramButton {
  const url = adminUrl(tab, focus);
  return isOwnerDirectChat(chatId) ? { text, web_app: { url } } : { text, url };
}

/**
 * Готовая клавиатура из одной кнопки.
 *
 * Строится для каждого получателя своя — по той же причине, что и в офисе:
 * одна клавиатура на рассылку означала бы `web_app` там, где он запрещён.
 */
export function openKeyboard(
  chatId: string | number,
  tab: string,
  focus?: string | null,
  text: string = OPEN_TEXT,
): { inline_keyboard: TelegramButton[][] } {
  return { inline_keyboard: [[openButton(chatId, tab, focus, text)]] };
}
