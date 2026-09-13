'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Truck } from 'lucide-react';
import { AdminDeliveryForm } from './AdminDeliveryForm';
import { AdminDeliveryRouteCard, type DeliveryRoute } from './AdminDeliveryRoute';
import { useFeedback } from './AdminFeedback';
import { AdminNotice } from './AdminNotice';

const T = {
  loadFailed: { ru: 'Не удалось загрузить маршруты', uz: "Reyslarni yuklab bo'lmadi" },
  createFailed: { ru: 'Не удалось создать маршрут', uz: "Reys yaratib bo'lmadi" },
  error: { ru: 'Ошибка', uz: 'Xato' },
  finishFailed: { ru: 'Не удалось завершить маршрут', uz: "Reysni yakunlab bo'lmadi" },
  finished: { ru: 'Маршрут завершён', uz: 'Reys yakunlandi' },
  remove: { ru: 'Удалить', uz: "O'chirish" },
  removing: { ru: 'Удаляю маршрут…', uz: "Reys o'chirilmoqda…" },
  undone: { ru: 'Отменено — маршрут на месте', uz: 'Bekor qilindi — reys joyida' },
  removeFailed: { ru: 'Не удалось удалить маршрут', uz: "Reysni o'chirib bo'lmadi" },
  removed: { ru: 'Маршрут удалён', uz: "Reys o'chirildi" },
  loading: { ru: 'Загрузка маршрутов...', uz: 'Reyslar yuklanmoqda...' },
  title: { ru: 'Логистика и Маршруты', uz: 'Logistika va reyslar' },
  newRoute: { ru: 'Новый маршрут', uz: 'Yangi reys' },
  none: { ru: 'Нет активных маршрутов', uz: "Faol reyslar yo'q" },
};

const removeTitle = {
  ru: (day: string) => `Удалить маршрут на ${day}?`,
  uz: (day: string) => `${day} uchun reys o'chirilsinmi?`,
};

const removeDetail = {
  ru: (n: number) => `Вместе с ним исчезнут ${n} точек и порядок объезда. Заказы останутся — удаляется рейс, а не работа.`,
  uz: (n: number) => `U bilan birga ${n} ta nuqta va aylanma tartibi yo'qoladi. Buyurtmalar qoladi — reys o'chadi, ish emas.`,
};

export function AdminDeliveries({ lang }: { lang: 'ru' | 'uz' }) {
  const t = (k: keyof typeof T) => T[k][lang];
  const queryClient = useQueryClient();
  const notify = useFeedback();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: routes = [], isPending: loading } = useQuery<DeliveryRoute[]>({
    queryKey: ['admin-deliveries'],
    queryFn: async () => {
      const res = await fetch('/api/admin/deliveries', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(t('loadFailed'));
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
      if (!res.ok) throw new Error(data.error || t('createFailed'));
      setShowAdd(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
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
      if (!res.ok) throw new Error(t('finishFailed'));
      notify.success(t('finished'));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
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
      title: removeTitle[lang](day),
      detail: removeDetail[lang](route.stops.length),
      confirmText: t('remove'),
      danger: true,
    });
    if (!ok) return;

    notify.undoable({
      text: t('removing'),
      undoneText: t('undone'),
      run: async () => {
        setSaving(true);
        setError('');
        try {
          const res = await fetch(`/api/admin/deliveries?id=${route.id}`, {
            method: 'DELETE',
            credentials: 'same-origin',
          });
          if (!res.ok) throw new Error(t('removeFailed'));
          notify.success(t('removed'));
          reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : t('error'));
        } finally {
          setSaving(false);
        }
      },
    });
  };

  if (loading) return <div>{t('loading')}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Truck size={24} /> {t('title')}
        </h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          <Plus size={16} /> {t('newRoute')}
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
            {t('none')}
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
