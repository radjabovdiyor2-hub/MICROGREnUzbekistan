import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findRule } from '@/middleware';

// ══════════════════════════════════════════════════════════════════════
// Каждая дверь API либо под охраной middleware, либо открыта ОСОЗНАННО.
//
// `/api/ai/behavior` жил без единой проверки: правила в RULES не было,
// auth-примитивов в самом роуте тоже, и он отдавал анониму директивы
// поведения ботов — внутренние указания, по которым бот разговаривает с
// клиентом. Дыра появилась не по злому умыслу, а по умолчанию: новый
// файл `route.ts` открыт всем, пока кто-то не вспомнит про таблицу правил.
//
// Поэтому проверяется не «хорошо ли закрыт роут», а «принято ли по нему
// решение». Новый роут обязан попасть в один из трёх списков, иначе тест
// краснеет, и автор выбирает: правило в RULES, публичность или своя
// проверка.
//
// ЧЕГО ЭТОТ ТЕСТ НЕ ДЕЛАЕТ — и это намеренно. Он не различает методы:
// у `/api/products` правило стоит только на POST/PUT/PATCH/DELETE, а GET
// открыт витрине, и это верно. Различать методы значило бы описать здесь
// вторую копию RULES, которая разойдётся с первой. Тест ловит класс
// «про роут забыли целиком» — ровно тот, что случился.
// ══════════════════════════════════════════════════════════════════════

/** Аноним пускается по замыслу: витрина, вход, публичные справочники. */
const PUBLIC_BY_DESIGN = [
  '/api/ai/chat',            // ИИ-продавец витрины; лимит 20/мин
  '/api/ai/nutrition',       // локальный справочник культур, модель не зовётся
  '/api/auth/password',      // вход владельца; лимит 10/15 мин
  '/api/auth/session',       // «кто я» — без сессии отвечает null
  '/api/auth/telegram',
  '/api/auth/telegram-admin',
  '/api/auth/telegram-staff',
  '/api/auth/telegram-webapp',
  '/api/auth/webauthn',      // вход отключён, отвечает 501
  '/api/categories',
  '/api/config',             // публичные настройки: витрина и бот
  '/api/content/grow-live',  // фаза живой партии на карточке товара; без цифр производства
  '/api/content/recipe-of-day',
  '/api/health',
  '/api/instagram',
  '/api/instagram/stories',
  '/api/leads',              // B2B-заявка с сайта; лимит
  '/api/menu/loyalty',       // карта гостя из «живого меню»
  '/api/menu/photo',         // кадр гостя; лимит 10/час
  '/api/products',           // каталог на чтение
  '/api/products/[id]',
  '/api/promo',              // проверка промокода при оформлении
  '/api/reviews',            // отзывы; лимит 10/час
  '/api/subscriptions',      // GET — тарифы «зелёной коробки»
  '/api/support',            // обращение в поддержку
];

/**
 * Правила в middleware нет, роут проверяет себя сам — и делает это тем
 * способом, который middleware не умеет: подпись провайдера, общий секрет
 * бота, подписанный initData Telegram, отдельный токен.
 */
const SELF_GUARDED = [
  '/api/ai/usage',           // requireBotAuth — расход витринного бота
  '/api/ecosystem/event',    // requireBotAuth
  '/api/events',             // SSE админки: сверяет роль сессии внутри
  '/api/metrics',            // METRICS_TOKEN или сессия ADMIN
  '/api/orders/status',      // INGEST_SECRET — обратная синхронизация из офиса
  '/api/payment/click',      // подпись провайдера
  '/api/payment/payme',      // Basic-авторизация провайдера
  '/api/products/export',    // requireBotAuth — зеркало каталога для офиса
  '/api/push',               // GET — публичный ключ VAPID; POST требует сессию покупателя
  '/api/users/data',         // подписанный Telegram initData (права субъекта ПДн)
  '/api/users/inactive',     // requireBotAuth
  '/api/whatsapp/webhook',   // verify token + x-hub-signature-256
];

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'api');

/** Пути всех роутов вида `/api/admin/customers/map`. */
function routePaths(dir: string, prefix = '/api'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'route.ts') {
      out.push(prefix);
      continue;
    }
    if (statSync(full).isDirectory()) out.push(...routePaths(full, `${prefix}/${entry}`));
  }
  return out;
}

/** Есть ли у пути правило хоть на один метод. */
function hasRule(path: string): boolean {
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].some((m) => findRule(path, m) !== null);
}

describe('доступ к API', () => {
  const paths = routePaths(API_DIR);

  it('роутов найдено достаточно, чтобы тест что-то значил', () => {
    // Сорвался обход каталога — списки сойдутся сами собой, и тест
    // молча перестанет проверять что-либо.
    expect(paths.length).toBeGreaterThan(100);
  });

  it('по каждому роуту принято решение о доступе', () => {
    const forgotten = paths.filter(
      (p) => !hasRule(p) && !PUBLIC_BY_DESIGN.includes(p) && !SELF_GUARDED.includes(p),
    );
    expect(forgotten, `Роут без решения о доступе. Добавьте правило в RULES
(apps/web/src/middleware.ts) либо, если дверь открыта осознанно, впишите путь
в PUBLIC_BY_DESIGN или SELF_GUARDED этого файла с причиной:`).toEqual([]);
  });

  it('в списках нет исчезнувших роутов', () => {
    // Иначе список становится свалкой: удалённый роут остаётся строкой,
    // а завтра тем же путём появляется новый — уже разрешённым.
    const stale = [...PUBLIC_BY_DESIGN, ...SELF_GUARDED].filter((p) => !paths.includes(p));
    expect(stale).toEqual([]);
  });

  it('директивы поведения ботов закрыты', () => {
    // Та самая дыра: роут отдавал анониму указания, по которым бот
    // разговаривает с клиентом.
    expect(findRule('/api/ai/behavior', 'GET')?.access).toBe('ADMIN');
  });
});
