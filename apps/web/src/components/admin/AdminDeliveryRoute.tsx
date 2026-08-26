'use client';

import { CheckCircle, Trash2 } from 'lucide-react';

// Карточка одного маршрута: кто везёт, куда и что с этим можно сделать.
//
// Вынесена из AdminDeliveries, где раздел умел ровно одно — показывать.
// `PUT` и `DELETE` у роута были реализованы и не вызывались ниоткуда:
// маршрут нельзя было ни закрыть, ни убрать, и список копил вчерашние
// объезды навсегда. Статус при этом печатался сырым значением из базы
// (`pending`, `completed`) — латиницей посреди русского экрана.

export interface DeliveryStop {
  id: string;
  address: string;
  phone: string | null;
  status: string;
  orderIndex: number;
  order?: { orderNumber: string } | null;
  // Координаты точки выгрузки — по ним курьер строит маршрут в навигаторе.
  latitude?: number | null;
  longitude?: number | null;
}

export interface DeliveryRoute {
  id: string;
  driverId: string | null;
  driver?: { name: string; phone: string } | null;
  date: string;
  status: string;
  stops: DeliveryStop[];
}

/** Значения в базе — свободная строка, поэтому сверяем по нижнему регистру. */
const ROUTE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'В работе', color: 'var(--info)', bg: 'var(--info-bg)' },
  completed: { label: 'Завершён', color: 'var(--success)', bg: 'var(--success-bg)' },
  cancelled: { label: 'Отменён', color: 'var(--error)', bg: 'var(--error-bg)' },
};

export function AdminDeliveryRouteCard({ route, onComplete, onDelete, busy }: {
  route: DeliveryRoute;
  onComplete: (id: string) => void;
  onDelete: (route: DeliveryRoute) => void;
  busy: boolean;
}) {
  const key = (route.status || 'pending').toLowerCase();
  const st = ROUTE_STATUS[key] ?? {
    label: route.status, color: 'var(--text-muted)', bg: 'var(--bg-secondary)',
  };
  const done = key === 'completed' || key === 'cancelled';

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
        <div>
          <h3 style={{ fontWeight: 'bold' }}>
            Курьер: {route.driver?.name || (route.driverId ? route.driverId : 'не назначен')}
          </h3>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Дата: {new Date(route.date).toLocaleDateString('ru-RU')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{
            padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold',
            background: st.bg, color: st.color,
          }}>{st.label}</span>
          {!done && (
            <button className="btn btn-sm" disabled={busy} onClick={() => onComplete(route.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--success)', color: 'var(--success)' }}>
              <CheckCircle size={14} /> Завершить
            </button>
          )}
          <button className="btn btn-ghost btn-sm" disabled={busy} aria-label="Удалить маршрут"
            onClick={() => onDelete(route)} style={{ color: 'var(--error)' }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-2)' }}>
        <h4 style={{ fontSize: '14px', marginBottom: 'var(--space-2)' }}>
          Точки доставки ({route.stops.length}):
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {route.stops.map((stop, i) => (
            <div key={stop.id} style={{ display: 'flex', gap: 'var(--space-2)', fontSize: '13px', alignItems: 'flex-start' }}>
              <div style={{ background: 'var(--bg-secondary)', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', flexShrink: 0 }}>
                {i + 1}
              </div>
              <div>
                <div style={{ fontWeight: '500' }}>
                  {stop.address}
                  {/* Номер заказа — единственный способ ответить, что именно
                      уехало на этой машине. Раньше связи не оставалось. */}
                  {stop.order?.orderNumber && (
                    <span style={{ marginLeft: 6, color: 'var(--info)', fontWeight: 'var(--font-semibold)' }}>
                      #{stop.order.orderNumber}
                    </span>
                  )}
                </div>
                {stop.phone && <div style={{ color: 'var(--text-muted)' }}>{stop.phone}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
