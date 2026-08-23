import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// `not:` по колонке, которая может быть NULL, — молчаливый дефект.
//
// ЧТО СЛУЧИЛОСЬ 23.08.2026
//
// `seed-customer-geo.ts` расставляет клиентов по карте на стенде. Он искал
// тех, кому координата не проставлена, и берёгся не затирать ручные пины:
//
//     where: { latitude: null, geoSource: { not: 'manual' } }
//
// Prisma превращает это в SQL `geo_source <> 'manual'`. Для NULL такое
// сравнение даёт не «истину», а NULL — строка не проходит. А на свежей базе
// `geo_source` пуст РОВНО У ВСЕХ: сидер заведений его не ставит.
//
// Замер на живой базе: без координат 211, под фильтр сидера попадает 0.
//
// Скрипт находил ноль строк, печатал «Клиентов без координат нет — ставить
// нечего» и выходил с кодом 0. Сообщение успокаивающее и ложное: карта на
// стенде оставалась пустой, и виноватой выглядела база. Из-за этого карту с
// настоящими данными не видел ни один человек — при том, что данные лежали
// в репозитории, 211 заведений с именами и адресами.
//
// Офисный геокодер тот же инвариант держит верно: `shared/geo.py` пишет
// `geo_source IS DISTINCT FROM 'manual'`. Разошлись ровно эти два места, и
// разошлись беззвучно — обе стороны компилируются и обе «работают».
//
// ПОЧЕМУ ПРОВЕРКА, А НЕ ПРОСТО ПРАВКА
//
// Правка чинит один вызов. Приём остаётся заманчивым: `{ not: 'manual' }`
// читается как «всё, кроме ручного», и человек, который так подумал, прав —
// неправ SQL. Такое возвращается. Здесь схема выступает источником истины:
// nullable ли колонка, решает `schema.prisma`, а не память автора.
//
// ЧТОБЫ НЕ КРАСНЕТЬ ЗРЯ
//
// Имя поля не говорит, из какой оно модели: `status` объявлен в десятке
// моделей. Поэтому ругаемся только на те имена, которые nullable ВЕЗДЕ, где
// объявлены. `status`/`paymentStatus` в схеме NOT NULL — их `not:` законен и
// проверку проходит. `geoSource` nullable во всех трёх объявлениях — его
// `not:` небезопасен при любой модели.
// ══════════════════════════════════════════════════════════════════════

const REPO = path.resolve(__dirname, '../../../..');
const SCHEMA = path.join(REPO, 'packages/database/prisma/schema.prisma');

/** Поля схемы: имя → было ли хоть одно объявление НЕ nullable. */
function fieldNullability(): Map<string, { nullable: number; notNull: number }> {
  const src = readFileSync(SCHEMA, 'utf8');
  const map = new Map<string, { nullable: number; notNull: number }>();

  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    // `name  Type?  @map("…")` — поля модели. Отсекаем директивы блока
    // (@@index, @@map), связи-массивы и комментарии.
    const m = /^([a-z][A-Za-z0-9_]*)\s+([A-Za-z][A-Za-z0-9_]*)(\?)?(\s|\[|$)/.exec(line);
    if (!m || line.startsWith('//') || line.startsWith('@@')) continue;

    const [, name, , optional] = m;
    const entry = map.get(name) ?? { nullable: 0, notNull: 0 };
    if (optional) entry.nullable += 1;
    else entry.notNull += 1;
    map.set(name, entry);
  }

  return map;
}

/** Все .ts/.tsx, где может стоять запрос Prisma. Тесты не считаются. */
function sourceFiles(): string[] {
  const roots = [path.join(REPO, 'apps/web/src'), path.join(REPO, 'packages/database/prisma')];
  const out: string[] = [];

  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'migrations') continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
  };

  for (const root of roots) walk(root);
  return out;
}

describe('фильтр not: не должен молча терять строки с NULL', () => {
  const nullability = fieldNullability();

  it('схема прочитана — иначе проверка ничего не проверяет', () => {
    // Без этого пустая карта полей дала бы вечнозелёный тест: искать
    // «nullable везде» среди нуля полей всегда успешно.
    expect(nullability.size).toBeGreaterThan(100);
    expect(nullability.get('geoSource')).toEqual({ nullable: 3, notNull: 0 });
    expect(nullability.get('status')?.notNull).toBeGreaterThan(0);
  });

  it('ни один not: не стоит на колонке, которая бывает пустой', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8');
      const lines = src.split(/\r?\n/);

      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

        // `поле: { not: <значение>` — форма, которая компилируется в `<>` и
        // теряет NULL. `{ not: null }` — НАОБОРОТ, законный способ сказать
        // `IS NOT NULL`, и таких мест в проекте четырнадцать: их трогать
        // нельзя, иначе проверка станет шумом, который отключат целиком.
        // Значение ищем положительно — литерал строки или числа. Отрицание
        // здесь не годится: `\s*` перед ним отступает на пробел, и
        // `(?!null)` смотрит на пробел вместо `null`, пропуская всё подряд.
        const m = /([a-zA-Z][A-Za-z0-9_]*)\s*:\s*\{\s*not\s*:\s*['"`\d]/.exec(line);
        if (!m) return;

        const field = m[1];
        const info = nullability.get(field);
        if (!info || info.notNull > 0) return;

        // Явная оговорка про NULL рядом — `OR: [{ f: null }, { f: { not: … } }]`.
        // Автор про пустое значение подумал, придираться не к чему.
        if (new RegExp(`${field}\\s*:\\s*null`).test(line)) return;

        offenders.push(`${path.relative(REPO, file)}:${i + 1} — ${field}`);
      });
    }

    // Список в сообщении, а не просто «найдено N»: чинить будет человек,
    // и ему нужен адрес, а не счётчик.
    expect(offenders, `NULL-небезопасный not:\n${offenders.join('\n')}`).toEqual([]);
  });
});
