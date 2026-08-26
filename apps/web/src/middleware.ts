import { NextRequest, NextResponse } from 'next/server';
import { CATEGORY_SLUGS } from '@/lib/seo/categories';
import { SESSION_COOKIE, verifySession, type SessionRole } from '@/lib/session';

// ════════════════════════════════════════════════════════════════════
// Единая точка авторизации API + SEO-редирект каталога.
// ════════════════════════════════════════════════════════════════════

// CUSTOMER — «вошёл хоть кто-то из покупателей». Она отвечает только на
// вопрос «есть ли сессия», а не «его ли это заказ»: чей именно кабинет,
// решает сам роут по `getCustomerId()`. Middleware работает по префиксу
// пути и владельца записи знать не может.
type Access =
  | 'ADMIN'
  | 'STAFF'
  | 'PRODUCTION'
  | 'CUSTOMER';

interface Rule {
  prefix: string;
  access: Access;
  methods?: string[];
}

const RULES: Rule[] = [
  { prefix: '/api/admin', access: 'ADMIN' },
  // Теплица. Сажает не владелец, а агроном, и посадки — единственное, что
  // ему нужно. `findRule` берёт САМЫЙ ДЛИННЫЙ подходящий префикс, поэтому
  // эти три правила перебивают общий `/api/admin` выше независимо от порядка.
  { prefix: '/api/admin/grow-batches', access: 'PRODUCTION' },
  // Нормы культур и остатки сырья — только на чтение: форма посадки показывает
  // «нужно 30 г семян, на складе 1 200 г» до нажатия. Приход сырья и правка
  // справочника остаются владельцу — это деньги и общие нормативы.
  { prefix: '/api/admin/crop-norms', access: 'PRODUCTION', methods: ['GET'] },
  { prefix: '/api/admin/raw-materials', access: 'PRODUCTION', methods: ['GET'] },
  // Клиенты и карта открыты продавцу: по ним он и ездит. `findRule` берёт
  // самый длинный подходящий префикс И сверяет метод, поэтому всё, чего нет
  // в списке методов, падает обратно на общее правило ADMIN выше.
  //
  // Что осталось владельцу и почему:
  //   PUT   — бонусы и статус клиента, то есть деньги;
  //   DELETE — удаление карточек, в том числе пачкой;
  //   POST /geocode — пакетный прогон жжёт квоту провайдера.
  //   POST  — завести клиента с карты: продавец стоит у заведения,
  //           которого в базе нет, и завести его должен он, а не
  //           владелец вечером по его словам.
  { prefix: '/api/admin/customers', access: 'STAFF', methods: ['GET', 'POST'] },
  // Геокодер остаётся владельцу ЯВНЫМ правилом, а не отсутствием
  // метода в списке выше. Так он и был закрыт, и это сломалось в тот
  // же миг, когда продавцу открыли POST на клиентов: `/geocode`
  // начинается с того же префикса, и разрешение утекло на пакетный
  // прогон, который жжёт квоту провайдера.
  //
  // Поймал это тест sellerAccess: «пакетный геокодер — он жжёт квоту».
  // Здесь длинный префикс перебивает короткий, и связь между двумя
  // правилами больше не молчаливая.
  { prefix: '/api/admin/customers/geocode', access: 'ADMIN' },
  // План объезда. Продавец сохраняет и читает СВОЙ, владелец — все и
  // может назначить чужой. Разделение внутри роута по имени
  // сотрудника: два отдельных адреса пришлось бы держать в согласии,
  // и однажды они разошлись бы.
  { prefix: '/api/admin/visit-plans', access: 'STAFF', methods: ['GET', 'POST'] },
  // Пин переставляет тот, кто стоит у дверей: он видит двор, а геокодер нет.
  { prefix: '/api/admin/customers/map', access: 'STAFF', methods: ['GET', 'PATCH'] },
  // Отметка визита — смысл всей полевой работы, без неё карта пишется в стол.
  { prefix: '/api/admin/customers/visits', access: 'STAFF', methods: ['POST'] },
  { prefix: '/api/inventory/employees', access: 'ADMIN' },
  { prefix: '/api/inventory/debts', access: 'ADMIN' },
  { prefix: '/api/inventory/suppliers', access: 'ADMIN' },
  { prefix: '/api/inventory/export', access: 'ADMIN' },
  { prefix: '/api/inventory/analytics', access: 'ADMIN' },
  { prefix: '/api/inventory/cron', access: 'ADMIN' },
  { prefix: '/api/inventory/pos', access: 'STAFF' },
  { prefix: '/api/inventory/movements', access: 'STAFF' },
  { prefix: '/api/inventory', access: 'STAFF' },
  { prefix: '/api/products', access: 'ADMIN', methods: ['POST', 'PUT', 'PATCH', 'DELETE'] },
  { prefix: '/api/orders', access: 'ADMIN', methods: ['PUT', 'PATCH', 'DELETE'] },
  { prefix: '/api/upload', access: 'ADMIN' },
  // Директивы поведения ботов из петли обучения. Правила здесь не было
  // вовсе: роут отдавал анониму внутренние указания, по которым бот
  // разговаривает с клиентом. Бот проходит выше по общему секрету.
  { prefix: '/api/ai/behavior', access: 'ADMIN' },
  // Дайджест и аналитика журнала считались «внутренними», но в RULES их не
  // было вовсе: middleware сюда не заходил, и обе двери отвечали анониму.
  { prefix: '/api/marketing', access: 'ADMIN' },
  { prefix: '/api/magazine/analytics', access: 'ADMIN' },
  { prefix: '/api/notify', access: 'ADMIN' },
  { prefix: '/api/telegram', access: 'ADMIN' },
  { prefix: '/api/users/referral', access: 'ADMIN' },
  // Личный кабинет: без сессии сюда не пускаем вовсе, а внутри роут ещё раз
  // сверяет владельца. Без первого рубежа эти двери отвечали кому угодно,
  // достаточно было подставить чужой userId/telegramId/subscriptionId.
  //
  // `/api/users/telegram` зовёт витринный бот — он проходит выше по
  // hasBotSecret, поэтому правило его не задевает. `/api/orders` GET сюда
  // не попадает: там три разных вызывающих (админка, бот, покупатель), и
  // выбор между ними делает сам роут.
  { prefix: '/api/subscriptions', access: 'CUSTOMER' },
  { prefix: '/api/referral', access: 'CUSTOMER' },
  { prefix: '/api/users/telegram', access: 'CUSTOMER' },
];

const PUBLIC_EXCEPTIONS = ['/api/inventory/employees/auth'];

/**
 * Правило для пути и метода: самый длинный подходящий префикс.
 *
 * Экспортируется ради теста. Таблица `RULES` — это и есть ответ на вопрос
 * «кому что открыто», и расходится она молча: правило с лишним методом не
 * падает, оно просто пускает не того. Читать её глазами при каждой правке
 * ненадёжно, поэтому доступ проверяется по ней напрямую.
 */
export function findRule(pathname: string, method: string): Rule | null {
  let best: Rule | null = null;
  for (const rule of RULES) {
    if (pathname !== rule.prefix && !pathname.startsWith(`${rule.prefix}/`)) continue;
    if (rule.methods && !rule.methods.includes(method)) continue;
    if (!best || rule.prefix.length > best.prefix.length) best = rule;
  }
  return best;
}

function hasBotSecret(request: NextRequest): boolean {
  const secret = process.env.BOT_SECRET;
  if (!secret) return false;

  const xBot = request.headers.get('x-bot-secret') ?? '';
  if (xBot.length === secret.length && safeEq(xBot, secret)) return true;

  const bearer = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (bearer.length === expected.length && safeEq(bearer, expected)) return true;

  return false;
}

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Экспортируется ради теста: пускать не того — самая тихая из ошибок доступа. */
export function roleSatisfies(role: SessionRole, access: Access): boolean {
  if (access === 'ADMIN') return role === 'ADMIN';
  // Кабинет открыт и сотруднику: он тоже покупатель, и отдельного запрета нет.
  // Обратное неверно — CUSTOMER не проходит ни в ADMIN, ни в STAFF.
  if (access === 'CUSTOMER') return true;
  // Теплица и касса не пересекаются: агроном не открывает смену, продавец не
  // трогает партии. Владелец проходит везде.
  if (access === 'PRODUCTION') return role === 'ADMIN' || role === 'GROWER';
  return role === 'ADMIN' || role === 'SELLER';
}

// Источник векторных тайлов карты клиентов. Origin вычисляется из той же
// переменной, по которой карта их и грузит: если развести эти два места,
// смена NEXT_PUBLIC_MAP_TILES_URL молча убьёт карту — тайлы уедут на новый
// хост, а CSP останется разрешать старый, и в консоли будет только отказ.
const MAP_TILES_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_MAP_TILES_URL || 'https://tiles.openfreemap.org',
).origin;

/**
 * `'unsafe-eval'` — ТОЛЬКО в разработке.
 *
 * React в dev-режиме вызывает eval() для отладочных возможностей (сборка
 * стека вызовов из другого окружения). Под нашим CSP страница из-за этого
 * не отрисовывалась вовсе: `next dev` встречал «eval() is not supported in
 * this environment» ещё до первого экрана. Раньше это не всплывало, потому
 * что локально поднимали прод-сборку (`next start`), а в ней React eval()
 * не использует.
 *
 * На проде послабление не появляется ни при каких условиях: `'unsafe-eval'`
 * открывает ровно тот класс XSS, ради закрытия которого CSP и вводили.
 * `NODE_ENV` Next.js подставляет на сборке, поэтому в прод-бандле этой
 * ветки не остаётся.
 */
const DEV_SCRIPT_SRC = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${DEV_SCRIPT_SRC} https://telegram.org https://oauth.telegram.org https://www.googletagmanager.com https://www.google-analytics.com https://mc.yandex.ru`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "media-src 'self' blob:",
    // MAP_TILES_ORIGIN: MapLibre тянет style.json, .pbf-тайлы, спрайты и
    // глифы обычным fetch, все с одного хоста.
    `connect-src 'self' ${MAP_TILES_ORIGIN} https://www.google-analytics.com https://mc.yandex.ru https://api.telegram.org https://oauth.telegram.org https://*.googleapis.com https://dl.polyhaven.org https://poly.pizza https://graph.instagram.com`,
    "frame-src 'self' https://telegram.org https://oauth.telegram.org",
    // Воркер MapLibre берётся из public/maplibre/ — это same-origin, его
    // покрывает 'self' (адрес задаёт src/lib/map/worker.ts). Полагаться на
    // чанк бандлера нельзя: Turbopack приписывает воркеру и его спутнику
    // разные хеши, относительный импорт уходит в 404, и карта молча
    // показывает один фон. blob: оставлен как запасной путь самого
    // MapLibre, если module-воркер где-то не поддержан.
    "worker-src 'self' blob:",
  ].join('; ');
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // ── SEO: /catalog?category=<slug> → /catalog/<slug> ────────────────
  if (pathname === '/catalog') {
    const cat = searchParams.get('category');
    if (cat && CATEGORY_SLUGS.includes(cat) && !searchParams.get('search')) {
      const url = req.nextUrl.clone();
      url.pathname = `/catalog/${cat}`;
      url.searchParams.delete('category');
      return NextResponse.redirect(url, 301);
    }
  }

  // ── Авторизация API ───────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    if (!PUBLIC_EXCEPTIONS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      const rule = findRule(pathname, req.method);
      if (rule && !hasBotSecret(req)) {
        const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
        if (!session) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!roleSatisfies(session.role, rule.access)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }
    }
  }

  // ── CSP nonce на ВСЕ ответы (страницы + API) ──────────────────────
  const nonce = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set('x-nonce', nonce);
  response.headers.set('Content-Security-Policy', buildCsp(nonce));
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|icons/|manifest\\.json|sw\\.js|workbox-).*)'],
};
