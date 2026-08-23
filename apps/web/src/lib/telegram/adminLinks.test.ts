import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminUrl, isOwnerDirectChat, openButton, openKeyboard } from './adminLinks';

// ══════════════════════════════════════════════════════════════════════
// Ссылки в админку из сообщений витрины.
//
// Здесь два разных предмета проверки. Первый — правило Mini App: Bot API
// разрешает `web_app` только в личной переписке, и клавиатура, собранная
// для владельца и отправленная в группу, отклоняет ВСЁ сообщение. То есть
// ошибка стоит не кнопки, а самого уведомления о заказе.
//
// Второй — совпадение с реестром экранов. Имена вкладок здесь и в
// `adminTabs.tsx` — две копии одного знания; ровно так однажды разошлись
// юзернеймы ботов, и половина ссылок вела в никуда. Опечатку в имени
// глазами не поймать: ссылка откроется, просто не на том экране.
// ══════════════════════════════════════════════════════════════════════

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Идентификаторы вкладок из единственного реестра экранов. */
function knownTabs(): Set<string> {
  const source = readFileSync(
    join(process.cwd(), 'src', 'app', 'admin', 'adminTabs.tsx'),
    'utf8',
  );
  return new Set([...source.matchAll(/\{\s*id:\s*'([a-z_]+)'/g)].map((m) => m[1]));
}

/** Вкладки, на которые ссылаются отправители сообщений витрины. */
function referencedTabs(): { tab: string; where: string }[] {
  const roots = ['lib', 'app'];
  const found: { tab: string; where: string }[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
      if (entry.name.endsWith('.test.ts')) continue;

      const src = readFileSync(path, 'utf8');
      if (!src.includes('openKeyboard(') && !src.includes('openButton(')) continue;
      // Второй аргумент вызова — имя вкладки.
      for (const m of src.matchAll(/open(?:Keyboard|Button)\(\s*[^,]+,\s*'([a-z_]+)'/g)) {
        found.push({ tab: m[1], where: entry.name });
      }
    }
  };

  for (const root of roots) walk(join(process.cwd(), 'src', root));
  return found;
}

describe('адрес экрана', () => {
  it('собирается с вкладкой и записью', () => {
    vi.stubEnv('PUBLIC_WEB_URL', 'https://example.uz/');
    expect(adminUrl('orders', 'M-20260822-AAAA')).toBe(
      'https://example.uz/admin?tab=orders&focus=M-20260822-AAAA',
    );
  });

  it('без записи хвоста не добавляет', () => {
    vi.stubEnv('PUBLIC_WEB_URL', 'https://example.uz');
    expect(adminUrl('inventory')).toBe('https://example.uz/admin?tab=inventory');
    expect(adminUrl('inventory', '')).toBe('https://example.uz/admin?tab=inventory');
  });
});

describe('Mini App только в личке владельца', () => {
  it('владельцу — Mini App', () => {
    vi.stubEnv('OWNER_TELEGRAM_IDS', '777,888');
    expect(openButton('777', 'orders').web_app).toBeDefined();
    expect(openButton('777', 'orders').url).toBeUndefined();
  });

  it('в группе — обычная ссылка, иначе Telegram отклонит сообщение', () => {
    vi.stubEnv('OWNER_TELEGRAM_IDS', '777');
    const group = openButton('-1001234567890', 'orders');
    expect(group.web_app).toBeUndefined();
    expect(group.url).toContain('/admin?tab=orders');
  });

  it('постороннему в личке — тоже обычная ссылка', () => {
    vi.stubEnv('OWNER_TELEGRAM_IDS', '777');
    expect(openButton('12345', 'orders').web_app).toBeUndefined();
  });

  it('без списка владельцев дверь без пароля не предлагается', () => {
    vi.stubEnv('OWNER_TELEGRAM_IDS', '');
    expect(isOwnerDirectChat('777')).toBe(false);
    expect(openButton('777', 'orders').web_app).toBeUndefined();
  });

  it('клавиатура — одна кнопка в одном ряду', () => {
    const kb = openKeyboard('-100', 'stats');
    expect(kb.inline_keyboard).toHaveLength(1);
    expect(kb.inline_keyboard[0]).toHaveLength(1);
  });
});

describe('вкладки не разошлись с реестром', () => {
  it('сторож видит подставную вкладку', () => {
    expect(knownTabs().has('orders')).toBe(true);
    expect(knownTabs().has('nesushestvuyushaya')).toBe(false);
  });

  it('каждая вкладка из сообщений существует в adminTabs.tsx', () => {
    const known = knownTabs();
    const used = referencedTabs();

    expect(used.length, 'ни один отправитель не строит ссылку — сторож проверяет пустоту').toBeGreaterThan(3);

    const broken = used.filter((u) => !known.has(u.tab));
    expect(
      broken.map((b) => `${b.where} → ${b.tab}`),
      'ссылка откроет админку не на том экране',
    ).toEqual([]);
  });
});
