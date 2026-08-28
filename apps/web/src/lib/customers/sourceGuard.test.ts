import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ══════════════════════════════════════════════════════════════════════
// Сторож: карточка клиента не создаётся без источника.
//
// ЗАЧЕМ. `Customer.source` отвечает на вопрос, ЧТО приводит заведения —
// обходы, рекомендации или журнал. Ответ появляется через полгода после
// того, как поле начали заполнять, и только если его заполняли ВСЕГДА.
// Один путь, забывший источник, обесценивает весь разрез: часть клиентов
// оказывается «ниоткуда», и сравнивать каналы больше не с чем.
//
// Проверка идёт по исходникам, а не по типам: Prisma разрешает не
// указывать `source` (колонка nullable, и офис пишет свои значения), так
// что компилятор такой путь пропустит молча.
//
// СЛОВАРЬ ИСТОЧНИКОВ ЗДЕСЬ НЕ ЗАКРЫВАЕТСЯ. Офис пишет свои значения —
// manual, website, instagram, telegram, pos и другие. Закрыть список на
// стороне витрины значило бы разойтись с ним, как когда-то разошлись
// статьи расходов: владелец писал «аренда», бот писал `rent`.
// ══════════════════════════════════════════════════════════════════════

const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

describe('создание карточки клиента', () => {
  it('нигде не обходится без источника', () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const code = readFileSync(file, 'utf8');
      if (!code.includes('prisma.customer.create')) continue;

      // Источник может стоять прямо здесь или прийти сборщиком данных
      // (fieldCustomerData), который его проставляет.
      const setsSource = /source\s*:/.test(code) || code.includes('fieldCustomerData');
      if (!setsSource) offenders.push(file.replace(SRC, 'src'));
    }

    expect(offenders, `карточка создаётся без source в: ${offenders.join(', ')}`).toEqual([]);
  });
});
