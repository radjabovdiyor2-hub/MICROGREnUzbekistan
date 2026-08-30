'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, PackageCheck } from 'lucide-react';

import { adminFetch } from '@/lib/adminClient';
import type { RoutePoint } from '@/lib/customers/dayRoute';

// ══════════════════════════════════════════════════════════════════════
// Назначенный объезд — там, где продавец его увидит.
//
// ЧТО БЫЛО СЛОМАНО НАПОЛОВИНУ. Владелец назначает объезд на дату, план
// уходит на сервер — и на этом всё: «Объезд дня» на карте читает только
// localStorage телефона. То есть назначить было можно, а доехать до
// продавца назначенное не могло: он открывал карту и видел свой вчерашний
// список. Половина функции без второй половины хуже, чем её отсутствие:
// владелец уверен, что задание выдано.
//
// ПРИНИМАЕТСЯ КНОПКОЙ, А НЕ ПОДСТАВЛЯЕТСЯ МОЛЧА. Тот же принцип, что у
// всего объезда: план — предложение. Продавец мог уже собрать свой список
// и выехать; затирать его за спиной значит отправить человека не туда,
// куда он ехал.
//
// СПИСОК ТОВАРОВ ПОКАЗЫВАЕТСЯ СРАЗУ: его читают утром, у машины, и ради
// него открывать отдельный экран никто не станет.
// ══════════════════════════════════════════════════════════════════════

interface PlanStop { customerId: number; name: string; latitude: number | null; longitude: number | null }
interface PlanItem { productId: string; name: string; qty: number; unit: string | null }
interface Plan { id: number; assignee: string; source: string; stops: PlanStop[]; items?: PlanItem[] }

const label = {
  title: { ru: 'Вам назначен объезд', uz: 'Sizga yoʻnalish tayinlandi' },
  take: { ru: 'Взять с собой', uz: 'Olib ketish' },
  accept: { ru: 'Взять в работу', uz: 'Ishga olish' },
  already: { ru: 'Уже в объезде', uz: 'Yoʻnalishda' },
};

/** Сегодня как `YYYY-MM-DD` по местному времени, а не по UTC. */
function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function AssignedPlanBanner({ lang, stops, onAccept }: {
  lang: 'ru' | 'uz';
  /** Что уже лежит в объезде — чтобы не предлагать принять принятое. */
  stops: RoutePoint[];
  onAccept: (points: RoutePoint[]) => void;
}) {
  const { data } = useQuery<Plan[]>({
    queryKey: ['assigned-plan', today()],
    queryFn: async () => {
      const res = await adminFetch(`/api/admin/visit-plans?date=${today()}`);
      if (!res.ok) throw new Error('Не удалось загрузить назначенный объезд');
      const body = await res.json();
      return Array.isArray(body?.plans) ? body.plans : [];
    },
  });

  // Показываем только НАЗНАЧЕННОЕ сверху: план, который человек собрал
  // себе сам, он и так видит — это и есть его текущий объезд.
  const plan = (data ?? []).find((p) => p.source === 'owner' && p.stops.length > 0);
  if (!plan) return null;

  // Координаты обязательны: точка без пина в маршрут не встаёт, и молча
  // терять её нельзя — она останется в плане у владельца.
  const points: RoutePoint[] = plan.stops
    .filter((s): s is PlanStop & { latitude: number; longitude: number } =>
      s.latitude !== null && s.longitude !== null)
    .map((s) => ({ id: s.customerId, name: s.name, latitude: s.latitude, longitude: s.longitude }));

  const taken = points.length > 0 && points.every((p) => stops.some((s) => s.id === p.id));

  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-3)',
        display: 'grid',
        gap: 'var(--space-2)',
        borderColor: 'var(--brand-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'var(--font-semibold)' }}>
        <ClipboardCheck size={16} style={{ color: 'var(--brand-primary)' }} />
        {label.title[lang]}: {plan.stops.length}
      </div>

      {plan.items && plan.items.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <PackageCheck size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {label.take[lang]}:
          </span>
          {plan.items.map((item) => (
            <span
              key={item.productId}
              style={{
                fontSize: 'var(--text-xs)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-secondary)',
              }}
            >
              {item.name} · {item.qty}{item.unit ? ` ${item.unit}` : ''}
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={taken || points.length === 0}
        onClick={() => onAccept(points)}
        style={{ justifySelf: 'start', minHeight: 44 }}
      >
        {taken ? label.already[lang] : `${label.accept[lang]} · ${points.length}`}
      </button>
    </div>
  );
}
