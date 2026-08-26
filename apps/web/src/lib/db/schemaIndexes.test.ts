import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// У каждого внешнего ключа есть индекс.
//
// Postgres НЕ создаёт его сам, и это удивляет: сама связь проверяется по
// первичному ключу РОДИТЕЛЯ, а обратная выборка — «все позиции этого
// заказа», «все визиты этого клиента» — идёт полным перебором таблицы.
// Двадцать таких ключей жили без индексов, среди них самый горячий:
// состав каждого CRM-заказа (`crm_order_items.order_id`).
//
// Заметить это по работе нельзя: на сотне строк перебор быстрее индекса.
// Проявляется оно позже и сразу везде — включая каскадное удаление, где
// перебор идёт по каждой дочерней таблице.
//
// Проверяем текстом схемы, а не живой базой: тесты идут без Postgres, а
// правило нужно соблюдать в момент правки `schema.prisma`, а не после
// выката.
// ══════════════════════════════════════════════════════════════════════

const SCHEMA = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..', '..',
  'packages', 'database', 'prisma', 'schema.prisma',
);

interface Model {
  name: string;
  body: string;
}

function models(source: string): Model[] {
  const out: Model[] = [];
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push({ name: m[1], body: m[2] });
  return out;
}

/** Поля, по которым выборка уже дешёвая: первое в индексе, @unique, @id. */
function indexed(body: string): Set<string> {
  const covered = new Set<string>();
  for (const m of body.matchAll(/@@(?:index|unique)\(\[([^\]]+)\]/g)) {
    covered.add(m[1].split(',')[0].trim());
  }
  for (const m of body.matchAll(/^\s*(\w+)\s+\S+.*@(?:unique|id)\b/gm)) {
    covered.add(m[1]);
  }
  return covered;
}

describe('индексы схемы', () => {
  const source = readFileSync(SCHEMA, 'utf8');
  const all = models(source);

  it('схема прочитана целиком', () => {
    // Сбился путь или регулярка — списки сойдутся сами собой, и тест
    // перестанет проверять что-либо, оставаясь зелёным.
    expect(all.length).toBeGreaterThan(70);
  });

  it('каждый внешний ключ проиндексирован', () => {
    const missing: string[] = [];
    for (const model of all) {
      const covered = indexed(model.body);
      for (const m of model.body.matchAll(/fields:\s*\[([^\]]+)\]/g)) {
        const fk = m[1].split(',')[0].trim();
        if (!covered.has(fk)) missing.push(`${model.name}.${fk}`);
      }
    }
    expect(missing, `Внешний ключ без индекса. Postgres не создаёт его сам, и
обратная выборка пойдёт перебором всей таблицы. Добавьте @@index([поле]) в
packages/database/prisma/schema.prisma:`).toEqual([]);
  });
});
