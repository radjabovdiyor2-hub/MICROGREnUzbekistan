'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Truck } from 'lucide-react';
import { AdminDeliveryForm } from './AdminDeliveryForm';
import { AdminDeliveryRouteCard, type DeliveryRoute } from './AdminDeliveryRoute';
import { useFeedback } from './AdminFeedback';
import { AdminNotice } from './AdminNotice';

export function AdminDeliveries() {
  const queryClient = useQueryClient();
  const notify = useFeedback();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: routes = [], isPending: loading } = useQuery<DeliveryRoute[]>({
    queryKey: ['admin-deliveries'],
    queryFn: async () => {
      const res = await fetch('/api/admin/deliveries', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Не удалось загрузить маршруты');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });
  const reload = () => queryClient.invalidateQueries({ queryKey: ['admin-deliveries'] });

  const create = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось создать маршрут');
      setShowAdd(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  /** Маршрут закрыт: машина вернулась. Раньше закрыть его было нечем. */
  const complete = async (id: string) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/deliveries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id, status: 'completed' }),
      });
      if (!res.ok) throw new Error('Не удалось завершить маршрут');
      notify.success('Маршрут завершён');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Удаление маршрута. Точки уходят вместе с ним (каскад в схеме), поэтому
   * спрашиваем: вернуть порядок объезда, собранный руками, будет нечем.
   * Сами заказы при этом остаются — удаляется рейс, а не работа.
   */
  const remove = async (route: DeliveryRoute) => {
    const day = new Date(route.date).toLocaleDateString('ru-RU');
    const ok = await notify.confirm({
      title: `Удалить маршрут на ${day}?`,
      detail: `Вместе с ним исчезнут ${route.stops.length} точек и порядок объезда. Заказы останутся — удаляется рейс, а не работа.`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/deliveries?id=${route.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Не удалось удалить маршрут');
      notify.success('Маршрут удалён');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Загрузка маршрутов...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Truck size={24} /> Логистика и Маршруты
        </h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          <Plus size={16} /> Новый маршрут
        </button>
      </div>

      {showAdd && (
        <AdminDeliveryForm saving={saving} error={error}
          onCancel={() => setShowAdd(false)} onSubmit={create} />
      )}

      {/* Отказ завершения или удаления виден и при закрытой форме: раньше
          текст ошибки существовал только внутри неё. */}
      {!showAdd && <AdminNotice>{error}</AdminNotice>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {routes.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            Нет активных маршрутов
          </div>
        ) : (
          routes.map(route => (
            <AdminDeliveryRouteCard key={route.id} route={route}
              onComplete={complete} onDelete={remove} busy={saving} />
          ))
        )}
      </div>
    </div>
  );
}
