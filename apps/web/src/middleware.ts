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
  | 'CUSTOMER';

interface Rule {
  prefix: string;
  access: Access;
  methods?: string[];
}

const RULES: Rule[] = [
  { prefix: '/api/admin', access: 'ADMIN' },
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

function findRule(pathname: string, method: string): Rule | null {
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

function roleSatisfies(role: SessionRole, access: Access): boolean {
  if (access === 'ADMIN') return role === 'ADMIN';
  // Кабинет открыт и сотруднику: он тоже покупатель, и отдельного запрета нет.
  // Обратное неверно — CUSTOMER не проходит ни в ADMIN, ни в STAFF.
  if (access === 'CUSTOMER') return true;
  return role === 'ADMIN' || role === 'SELLER';
}

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
