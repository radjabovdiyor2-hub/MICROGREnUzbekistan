import { NextRequest, NextResponse } from 'next/server';
import { CATEGORY_SLUGS } from '@/lib/seo/categories';
import { SESSION_COOKIE, verifySession, type SessionRole } from '@/lib/session';

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

  // ── Загрузка файлов ───────────────────────────────────────────────
  // Вызывается только из админских компонентов (AdminMagazine, AdminProducts).
  { prefix: '/api/upload', access: 'ADMIN' },

  // ── Оповещение владельца в Telegram ───────────────────────────────
  // Было открыто: любой мог слать текст в админский чат под видом алерта.
  { prefix: '/api/notify', access: 'ADMIN' },

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
 */
function hasBotSecret(request: NextRequest): boolean {
  const secret = process.env.BOT_SECRET;
  if (!secret) return false;

  if (request.headers.get('x-bot-secret') === secret) return true;
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true;

  return false;
}

function roleSatisfies(role: SessionRole, access: Access): boolean {
  if (access === 'ADMIN') return role === 'ADMIN';
  return role === 'ADMIN' || role === 'SELLER';
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // ── SEO: /catalog?category=<slug> → /catalog/<slug> ────────────────
  // Плитки категорий меняют только состояние и query не ставят, поэтому
  // редирект не мешает фильтрации внутри приложения.
  if (pathname === '/catalog') {
    const cat = searchParams.get('category');
    if (cat && CATEGORY_SLUGS.includes(cat) && !searchParams.get('search')) {
      const url = req.nextUrl.clone();
      url.pathname = `/catalog/${cat}`;
      url.searchParams.delete('category');
      return NextResponse.redirect(url, 301);
    }
    return NextResponse.next();
  }

  // ── Авторизация API ───────────────────────────────────────────────
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  if (PUBLIC_EXCEPTIONS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const rule = findRule(pathname, req.method);
  if (!rule) return NextResponse.next();

  if (hasBotSecret(req)) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!roleSatisfies(session.role, rule.access)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/catalog', '/api/:path*'],
};
