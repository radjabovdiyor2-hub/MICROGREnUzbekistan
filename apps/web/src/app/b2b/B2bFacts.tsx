import { factsWorthShowing, type B2bFacts } from '@/lib/b2b/facts';

import { Bi } from '@/components/ui/Bi';

// ══════════════════════════════════════════════════════════════════════
// Чем подтверждаем слова — числами, а не цитатами.
//
// Отзыв шефа с названием заведения убедительнее любой цифры, но
// подтверждённых у нас нет, а сочинить их нельзя: закупщик, который
// позвонит в названный ресторан, узнает об этом первым. Владелец выбрал
// факты без имён — и это честная замена, а не полумера.
//
// Числа считает `lib/b2b/facts.ts`, и там же лежит главная ловушка: в
// базе больше двух тысяч заведений, собранных ботами из справочника как
// лиды. Считать их клиентами — прямая ложь.
//
// БЛОК ГАСНЕТ, ПОКА ЧИСЛО НЕ ГОВОРИТ САМО ЗА СЕБЯ. «Нас выбрали 2
// заведения» — честно и работает против нас; округлять при этом нельзя.
// Значит, молчим.
// ══════════════════════════════════════════════════════════════════════

export function B2bFacts({ facts }: { facts: B2bFacts }) {
  if (!factsWorthShowing(facts)) return null;

  const cells = [
    {
      value: { ru: String(facts.venues), uz: String(facts.venues) },
      label: { ru: 'заведений закупаются у нас', uz: 'muassasa bizdan xarid qiladi' },
    },
    facts.since
      ? {
        // Год стоит В ЗНАЧЕНИИ, а не в подписи: по-узбекски послелог идёт
        // после числа, и «с 2023» с подписью «года возим» там не собирается.
        value: { ru: `с ${facts.since}`, uz: `${facts.since} yildan` },
        label: { ru: 'года возим ресторанам', uz: 'restoranlarga yetkazamiz' },
      }
      : null,
    facts.weeklyDeliveries > 0
      ? {
        value: { ru: String(facts.weeklyDeliveries), uz: String(facts.weeklyDeliveries) },
        label: {
          ru: 'поставок в неделю по графику',
          uz: "haftasiga jadval bo'yicha yetkazish",
        },
      }
      : null,
  ].filter(Boolean) as { value: { ru: string; uz: string }; label: { ru: string; uz: string } }[];

  return (
    <section
      className="card"
      style={{
        marginTop: 'var(--space-8)',
        padding: 'var(--space-6)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 'var(--space-5)',
      }}
    >
      {cells.map((c) => (
        <div key={c.label.ru} style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--font-extrabold)',
              fontSize: 'clamp(1.8rem, 5vw, 2.6rem)',
              color: 'var(--brand-primary)',
              lineHeight: 1.1,
            }}
          >
            <Bi ru={c.value.ru} uz={c.value.uz} />
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>
            <Bi ru={c.label.ru} uz={c.label.uz} />
          </div>
        </div>
      ))}
    </section>
  );
}
