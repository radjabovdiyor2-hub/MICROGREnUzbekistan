'use client';

// ══════════════════════════════════════════════════════════════════════
// Что вообще нарисовано на карте.
//
// ЗАЧЕМ ОТДЕЛЬНО ОТ ЛЕГЕНДЫ СОСТОЯНИЙ. Та отвечает на вопрос «какой это
// клиент» — активный, под угрозой, потерянный, — и умеет фильтровать. Но
// на карте лежат не только клиенты: есть белые пятна без заказов, точки
// сегодняшнего объезда, рейс доставки и живые сотрудники. Ни один из них
// не «состояние клиента», и в ту легенду они не помещаются по смыслу.
//
// РАЗЛИЧАЕМ ПО ДВУМ ПРИЗНАКАМ СРАЗУ: по ТИПУ (место или человек) и по
// ФУНКЦИИ (кому продаём, куда едем, кто везёт). Поэтому у каждого свой не
// только цвет, но и форма: заливка — место, кольцо — человек, линия —
// путь, номер — порядок объезда. Один и тот же кружок для всего сделал бы
// карту нечитаемой ровно там, где на неё смотрят быстро.
//
// ПОКАЗЫВАЕМ ТОЛЬКО ТО, ЧТО СЕЙЧАС ЕСТЬ. Легенда, перечисляющая
// отсутствующее, — это словарь, а не подсказка: её перестают читать.
// ══════════════════════════════════════════════════════════════════════

export interface MapKindsProps {
  lang: 'ru' | 'uz';
  /** Белые пятна — заведения без заказов. */
  hasProspects: boolean;
  /** Точки, набранные в объезд на сегодня. */
  hasRoute: boolean;
  /** Рейс доставки на карте. */
  hasDelivery: boolean;
  /** Сотрудники в поле прямо сейчас. */
  peopleCount: number;
}

const TEXT = {
  title: { ru: 'Что на карте', uz: 'Xaritada nima bor' },
  client: { ru: 'Заведение — цвет по состоянию', uz: 'Muassasa — holati boʻyicha rang' },
  prospect: { ru: 'Без заказов — белое пятно', uz: 'Buyurtmasiz — boʻsh joy' },
  route: { ru: 'В объезде на сегодня', uz: 'Bugungi yoʻnalishda' },
  delivery: { ru: 'Рейс доставки — с номерами', uz: 'Yetkazish reysi — raqamlar bilan' },
  person: { ru: 'Сотрудник сейчас — с именем', uz: 'Xodim hozir — ismi bilan' },
  personStale: { ru: 'Связи нет дольше 15 минут', uz: '15 daqiqadan koʻp aloqasiz' },
} as const;

/** Кружок-заливка: так на карте выглядит МЕСТО. */
function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

/** Кольцо: так на карте выглядит ЧЕЛОВЕК. Форма отличает его от места. */
function Ring({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: 'var(--bg-card)',
        border: `3px solid ${color}`,
        flexShrink: 0,
      }}
    />
  );
}

/** Отрезок: так выглядит ПУТЬ — объезд, рейс, трек. */
function Line({ color, dashed = false }: { color: string; dashed?: boolean }) {
  return (
    <span
      style={{
        width: 14,
        height: 0,
        borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
        flexShrink: 0,
      }}
    />
  );
}

function Row({ mark, text }: { mark: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      {mark}
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{text}</span>
    </div>
  );
}

export function MapKinds({
  lang,
  hasProspects,
  hasRoute,
  hasDelivery,
  peopleCount,
}: MapKindsProps) {
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];

  return (
    <div
      className="card"
      style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}
    >
      <div
        style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 'var(--font-bold)',
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {t('title')}
      </div>

      <Row mark={<Dot color="var(--brand-primary)" />} text={t('client')} />
      {hasProspects && <Row mark={<Dot color="var(--text-muted)" />} text={t('prospect')} />}
      {hasRoute && <Row mark={<Line color="var(--brand-primary)" />} text={t('route')} />}
      {hasDelivery && (
        <Row mark={<Line color="var(--brand-primary)" dashed />} text={t('delivery')} />
      )}
      {peopleCount > 0 && (
        <>
          <Row mark={<Ring color="var(--brand-accent)" />} text={t('person')} />
          <Row mark={<Ring color="var(--text-muted)" />} text={t('personStale')} />
        </>
      )}
    </div>
  );
}
