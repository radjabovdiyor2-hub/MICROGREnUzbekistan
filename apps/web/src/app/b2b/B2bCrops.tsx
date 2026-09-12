import { prisma } from '@repo/database';

import { Bi } from '@/components/ui/Bi';
import { unitLabel } from '@/lib/units';

// ══════════════════════════════════════════════════════════════════════
// Что мы поставляем и в какой фасовке.
//
// Первый вопрос закупщика, на который страница до сих пор не отвечала
// вовсе: культур не называлось ни одной, слово «лоток» не встречалось.
//
// СПИСОК ИЗ БАЗЫ, А НЕ РУКАМИ. Прайс переимпортируется на каждой выкатке
// (`import-catalog.ts`), и вписанный сюда перечень разошёлся бы с
// каталогом первым же новым сортом. Фасовку берём из `Product.unit` —
// это то же поле, по которому считается корзина, значит соврать оно не
// может.
// ══════════════════════════════════════════════════════════════════════

interface Group {
  categoryRu: string;
  categoryUz: string;
  unit: string;
  namesRu: string[];
  namesUz: string[];
}

/** Группируем по категории и фасовке: закупщику важна пара, а не товар.
 *
 *  ОБА НАЗВАНИЯ, А НЕ ОДНО. Раньше отсюда уходил только русский список — и
 *  узбекский закупщик читал ассортимент на чужом языке под узбекским
 *  заголовком. Названия лежат в базе парой, брать надо обе. */
export async function loadCrops(): Promise<Group[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      nameRu: true, nameUz: true, unit: true,
      category: { select: { nameRu: true, nameUz: true } },
    },
    orderBy: { nameRu: 'asc' },
  });

  const groups = new Map<string, Group>();
  for (const p of products) {
    const categoryRu = p.category?.nameRu?.trim() || 'Прочее';
    const categoryUz = p.category?.nameUz?.trim() || categoryRu;
    const key = `${categoryRu}|${p.unit}`;
    const group = groups.get(key)
      ?? { categoryRu, categoryUz, unit: p.unit, namesRu: [], namesUz: [] };
    const ru = (p.nameRu || p.nameUz || '').trim();
    const uz = (p.nameUz || p.nameRu || '').trim();
    if (ru) { group.namesRu.push(ru); group.namesUz.push(uz); }
    groups.set(key, group);
  }

  return [...groups.values()].filter((g) => g.namesRu.length > 0);
}

export function B2bCrops({ groups }: { groups: Group[] }) {
  if (groups.length === 0) return null;

  return (
    <section style={{ marginTop: 'var(--space-8)' }}>
      <h2 style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xl)' }}>
        Ассортимент и фасовка
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
        Assortiment va qadoqlash
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 'var(--space-4)',
          marginTop: 'var(--space-4)',
        }}
      >
        {groups.map((g) => (
          <div key={`${g.categoryRu}-${g.unit}`} className="card" style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 'var(--font-semibold)' }}>
                <Bi ru={g.categoryRu} uz={g.categoryUz} />
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--brand-primary)',
                  fontWeight: 600,
                }}
              >
                <Bi ru={unitLabel(g.unit, 'ru')} uz={unitLabel(g.unit, 'uz')} />
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                · {g.namesRu.length} <Bi ru="позиций" uz="pozitsiya" />
              </span>
            </div>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                marginTop: 'var(--space-2)',
                lineHeight: 1.5,
              }}
            >
              <Bi ru={g.namesRu.join(', ')} uz={g.namesUz.join(', ')} />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
