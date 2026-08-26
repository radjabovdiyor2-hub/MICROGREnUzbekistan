'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Phone, Truck, X } from 'lucide-react';
import { useState } from 'react';

import { NavigateButton } from './map/NavigateButton';
import { AdminNotice } from './AdminNotice';
import { useFeedback } from './AdminFeedback';
import type { DeliveryRoute, DeliveryStop } from './AdminDeliveryRoute';

// ══════════════════════════════════════════════════════════════════════
// «Мой рейс» — маршрут дня глазами того, кто его едет.
//
// ЧЕГО НЕ БЫЛО. Логистика существовала только для владельца: он собирал
// рейс, а курьер получал адреса голосом или скриншотом. Отметить доставку
// по конкретной точке было нечем — DeliveryStop.status лежал в схеме и не
// менялся ниоткуда, поэтому рейс из восьми адресов выглядел одним событием
// «доставлено» в конце дня, и вопрос «где заказ прямо сейчас» ответа не имел.
//
// Экран намеренно бедный: на улице, одной рукой, с телефона. Позвонить,
// поехать, отметить — три действия, каждое одним касанием. Всё остальное
// решено заранее и здесь только читается.
// ══════════════════════════════════════════════════════════════════════

const STOP_LABEL: Record<string, { text: string; color: string }> = {
  delivered: { text: 'Доставлено', color: 'var(--success)' },
  failed: { text: 'Не застал', color: 'var(--error)' },
};

export function AdminMyRoute({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const queryClient = useQueryClient();
  const notify = useFeedback();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const { data: routes = [], isPending } = useQuery<DeliveryRoute[]>({
    queryKey: ['admin-my-route'],
    queryFn: async () => {
      const res = await fetch('/api/admin/deliveries', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Не удалось загрузить маршрут');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  // Рейсы приходят от свежих к старым; курьеру нужен ближайший незакрытый.
  const route = routes.find((r) => (r.status || 'pending').toLowerCase() === 'pending') ?? routes[0];

  const mark = async (stop: DeliveryStop, status: 'delivered' | 'failed') => {
    setBusy(stop.id);
    setError('');
    try {
      const res = await fetch('/api/admin/deliveries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ stopId: stop.id, status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Отметка не сохранилась');
      notify.success(data?.routeCompleted ? 'Рейс закрыт — все точки объехали' : 'Отметил');
      queryClient.invalidateQueries({ queryKey: ['admin-my-route'] });
      queryClient.invalidateQueries({ queryKey: ['admin-deliveries'] });
    } catch (err) {
      // Молчание здесь дороже всего: курьер уедет, считая точку закрытой.
      setError(err instanceof Error ? err.message : 'Отметка не сохранилась');
    } finally {
      setBusy('');
    }
  };

  if (isPending) return <div>Загрузка маршрута…</div>;

  if (!route) {
    return (
      <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
        На вас сегодня маршрут не назначен.
      </div>
    );
  }

  const left = route.stops.filter((s) => (s.status || 'pending') === 'pending').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={24} /> Мой рейс
        </h2>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          {new Date(route.date).toLocaleDateString('ru-RU')} · осталось {left} из {route.stops.length}
        </span>
      </div>

      <AdminNotice>{error}</AdminNotice>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {route.stops.map((stop, i) => {
          const status = (stop.status || 'pending').toLowerCase();
          const closed = status !== 'pending';
          const done = STOP_LABEL[status];
          return (
            <div key={stop.id} className="card"
              style={{ padding: 'var(--space-4)', opacity: closed ? 0.55 : 1 }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                <div style={{ background: 'var(--bg-secondary)', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'var(--font-semibold)' }}>
                    {stop.address}
                    {stop.order?.orderNumber && (
                      <span style={{ marginLeft: 6, color: 'var(--info)' }}>№{stop.order.orderNumber}</span>
                    )}
                  </div>
                  {done && (
                    <div style={{ color: done.color, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
                      {done.text}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
                {stop.phone && (
                  <a className="btn btn-sm" href={"tel:" + stop.phone}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Phone size={14} /> {stop.phone}
                  </a>
                )}
                {stop.latitude != null && stop.longitude != null && (
                  <NavigateButton latitude={stop.latitude} longitude={stop.longitude} lang={lang} />
                )}
                {!closed && (
                  <>
                    <button className="btn btn-primary btn-sm" disabled={busy === stop.id}
                      onClick={() => mark(stop, 'delivered')}
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={14} /> Доставлено
                    </button>
                    <button className="btn btn-sm" disabled={busy === stop.id}
                      onClick={() => mark(stop, 'failed')}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--error)', color: 'var(--error)' }}>
                      <X size={14} /> Не застал
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
