import { NextRequest, NextResponse } from 'next/server';
import { CATEGORY_SLUGS } from '@/lib/seo/categories';
import { SESSION_COOKIE, verifySession, type SessionRole } from '@/lib/session';
import crypto from 'crypto';

// ════════════════════════════════════════════════════════════════════
// Единая точка авторизации API + SEO-редирект каталога.
//
// Почему здесь, а не в каждом роуте: проверка была размазана по файлам и
// стояла в 20 из ~70 — весь inventory, запись товаров, загрузка файлов и
// выгрузки PII висели открытыми. Один шлюз означает, что новый роут под
// защищённым префиксом закрыт по умолчанию, а не когда про него вспомнят.
//
// Роуты сохраняют и собственные проверки (lib/adminAuth) — middleware их
// не заменяет, а ставит нижнюю границу.
// ════════════════════════════════════════════════════════════════════

type Access =
  /** Только владелец. */
  | 'ADMIN'
  /** Владелец или продавец за POS. */
  | 'STAFF';

interface Rule {
  /** Префикс пути. Проверяется по самому длинному совпадению. */
  prefix: string;
  access: Access;
  /**
   * Методы, к которым правило применяется. Пусто — все.
   * Так GET товаров остаётся публичным, а запись закрывается.
   */
  methods?: string[];
}

// Порядок значения не имеет: выбирается самое длинное совпадение префикса.
const RULES: Rule[] = [
  // ── Админка целиком ───────────────────────────────────────────────
  { prefix: '/api/admin', access: 'ADMIN' },

  // ── Склад, касса, персонал ────────────────────────────────────────
  // Раньше открыт был весь раздел: любой мог завести себе сотрудника с
  // известным PIN, провести продажу или выгрузить долги с телефонами.
  { prefix: '/api/inventory/employees', access: 'ADMIN' },
  { prefix: '/api/inventory/debts', access: 'ADMIN' },
  { prefix: '/api/inventory/suppliers', access: 'ADMIN' },
  { prefix: '/api/inventory/export', access: 'ADMIN' },
  { prefix: '/api/inventory/analytics', access: 'ADMIN' },
  { prefix: '/api/inventory/cron', access: 'ADMIN' },
  // Касса и движения — рабочие операции продавца.
  { prefix: '/api/inventory/pos', access: 'STAFF' },
  { prefix: '/api/inventory/movements', access: 'STAFF' },
  { prefix: '/api/inventory', access: 'STAFF' },

  // ── Каталог: чтение публичное, запись — владелец ───────────────────
  { prefix: '/api/products', access: 'ADMIN', methods: ['POST', 'PUT', 'PATCH', 'DELETE'] },

  // ── Заказы ────────────────────────────────────────────────────────
  // POST оставлен публичным — это оформление заказа покупателем.
  // PUT меняет status и paymentStatus: без проверки любой мог пометить
  // чужой заказ оплаченным. Список всех заказов (GET без фильтра по
  // пользователю) закрыт в самом роуте — там нужен разбор query.
  // /api/orders/status под это правило не попадает: он POST и защищён
  // собственным INGEST_SECRET.
  { prefix: '/api/orders', access: 'ADMIN', methods: ['PUT', 'PATCH', 'DELETE'] },

  // ── Загрузка файлов ───────────────────────────────────────────────
  // Вызывается только из админских компонентов (AdminMagazine, AdminProducts).
  { prefix: '/api/upload', access: 'ADMIN' },

  // ── Оповещение владельца в Telegram ───────────────────────────────
  // Было открыто: любой мог слать текст в админский чат под видом алерта.
  { prefix: '/api/notify', access: 'ADMIN' },

  // /api/telegram/notify — зеркало /api/notify для бота;
  // /api/telegram/channel — публикация в канал бренда: без проверки любой
  // мог запостить произвольный текст подписчикам от имени компании.
  // Бот ходит сюда с Bearer BOT_SECRET (ecosystem_bridge.py).
  { prefix: '/api/telegram', access: 'ADMIN' },

  // Начисление реферальных бонусов — это деньги (бонусы уменьшают сумму
  // заказа). Вызывается ботом из handlers/start.py с BOT_SECRET.
  { prefix: '/api/users/referral', access: 'ADMIN' },

  // Face ID (/api/auth/webauthn) намеренно НЕ здесь: часть его действий —
  // это сам вход, до которого сессии ещё нет. Разграничение по действию
  // делает сам роут.
];

/**
 * Публичные исключения — проверяются раньше правил.
 * Логин продавца обязан быть открытым, иначе войти нечем.
 */
const PUBLIC_EXCEPTIONS = ['/api/inventory/employees/auth'];

function findRule(pathname: string, method: string): Rule | null {
  let best: Rule | null = null;

  for (const rule of RULES) {
    if (pathname !== rule.prefix && !pathname.startsWith(`${rule.prefix}/`)) continue;
    if (rule.methods && !rule.methods.includes(method)) continue;
    if (!best || rule.prefix.length > best.prefix.length) best = rule;
  }

  return best;
}

/**
 * Server-to-server: боты и cron ходят с общим секретом.
 * Заголовок x-bot-secret (админка журнала) либо Bearer (storefront-бот).
 * Сравнение через timingSafeEqual — иначе timing attack подберёт секрет
 * за ~256×len запросов.
 */
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
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function roleSatisfies(role: SessionRole, access: Access): boolean {
  if (access === 'ADMIN') return role === 'ADMIN';
  return role === 'ADMIN' || role === 'SELLER';
}

// ════════════════════════════════════════════════════════════════════
// CSP nonce: генерируем per-request, прокидываем через x-nonce header.
// Layout читает его через headers() и ставит на инлайн-скрипт темы.
// unsafe-inline в script-src убран — nonce его заменяет.
// unsafe-eval убран — в коде нет eval(), он был добавлен «на всякий случай».
// style-src оставлен с unsafe-inline — Google Fonts и инлайн-стили.
// ════════════════════════════════════════════════════════════════════
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://telegram.org https://oauth.telegram.org https://www.googletagmanager.com https://www.google-analytics.com https://mc.yandex.ru`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "media-src 'self' blob:",
    "connect-src 'self' https://www.google-analytics.com https://mc.yandex.ru https://api.telegram.org https://oauth.telegram.org https://*.googleapis.com https://dl.polyhaven.org https://poly.pizza https://graph.instagram.com",
    "frame-src 'self' https://telegram.org https://oauth.telegram.org",
    "worker-src 'self' blob:",
  ].join('; ');
}

// ── Утилита: оборачивает ответ CSP nonce-заголовком ──────────────────
function addCspHeaders(response: NextResponse): NextResponse {
  const nonce = crypto.randomUUID();
  response.headers.set('x-nonce', nonce);
  response.headers.set('Content-Security-Policy', buildCsp(nonce));
  return response;
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
  const response = NextResponse.next({
    request: { headers: new Headers(req.headers) },
  });
  return addCspHeaders(response);
}

// Matcher: все маршруты кроме статики. _next/static, _next/image, favicon —
// это файлы, которым CSP не нужен и middleware только тратит время.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|icons/|manifest\\.json|sw\\.js|workbox-).*)'],
};
