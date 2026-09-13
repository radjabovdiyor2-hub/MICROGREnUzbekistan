'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Phone, Truck, X } from 'lucide-react';
import { useState } from 'react';

import { FieldTrackButton } from './map/FieldTrackButton';
import { NextStopPanel } from './map/NextStopPanel';
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

// Экран водителя был русским целиком, хотя `lang` в него приходил с самого
// начала. У продавца-узбека это ЕДИНСТВЕННЫЙ экран, на котором он работает
// весь день, и «Не застал» ему приходится узнавать по месту кнопки.
const STOP_LABEL: Record<string, { ru: string; uz: string; color: string }> = {
  delivered: { ru: 'Доставлено', uz: 'Yetkazildi', color: 'var(--success)' },
  failed: { ru: 'Не застал', uz: 'Topa olmadim', color: 'var(--error)' },
};

const T = {
  loading: { ru: 'Загрузка маршрута…', uz: 'Reys yuklanmoqda…' },
  none: { ru: 'На вас сегодня маршрут не назначен.', uz: 'Bugun sizga reys tayinlanmagan.' },
  title: { ru: 'Мой рейс', uz: 'Mening reysim' },
  left: { ru: 'осталось', uz: 'qoldi' },
  of: { ru: 'из', uz: 'dan' },
  delivered: { ru: 'Доставлено', uz: 'Yetkazildi' },
  failed: { ru: 'Не застал', uz: 'Topa olmadim' },
  loadFailed: { ru: 'Не удалось загрузить маршрут', uz: "Reysni yuklab bo'lmadi" },
  markFailed: { ru: 'Отметка не сохранилась', uz: 'Belgi saqlanmadi' },
  routeClosed: { ru: 'Рейс закрыт — все точки объехали', uz: 'Reys yopildi — barcha nuqtalar aylanib chiqildi' },
  marked: { ru: 'Отметил', uz: 'Belgilandi' },
  retry: { ru: 'Повторить', uz: 'Qayta urinish' },
};

export function AdminMyRoute({
  lang = 'ru',
  isOwner = false,
}: {
  lang?: 'ru' | 'uz';
  /**
   * Владельцу кнопку смены не показываем.
   *
   * Смена привязана к карточке сотрудника, а владелец входит по паролю —
   * имени сотрудника в его сессии нет вовсе, и дверь ответила бы отказом.
   * Кнопка, которая гарантированно не работает, хуже её отсутствия: она
   * показала бы «сессия истекла» при совершенно исправной сессии.
   */
  isOwner?: boolean;
}) {
  const queryClient = useQueryClient();
  const notify = useFeedback();
  const t = <K extends keyof typeof T>(key: K) => T[key][lang];
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const { data: routes = [], isPending, isError } = useQuery<DeliveryRoute[]>({
    queryKey: ['admin-my-route'],
    queryFn: async () => {
      const res = await fetch('/api/admin/deliveries', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(T.loadFailed[lang]);
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
      if (!res.ok) throw new Error(data?.error || t('markFailed'));
      notify.success(data?.routeCompleted ? t('routeClosed') : t('marked'));
      queryClient.invalidateQueries({ queryKey: ['admin-my-route'] });
      queryClient.invalidateQueries({ queryKey: ['admin-deliveries'] });
    } catch (err) {
      // Молчание здесь дороже всего: курьер уедет, считая точку закрытой.
      setError(err instanceof Error ? err.message : t('markFailed'));
    } finally {
      setBusy('');
    }
  };

  if (isPending) return <div>{t('loading')}</div>;

  // ОТКАЗ ДВЕРИ — НЕ «РЕЙСА НЕТ». Ошибка запроса гасилась молча, и водитель
  // с истёкшей сессией читал «на вас сегодня маршрут не назначен» — то есть
  // получал разрешение ехать домой. Разводим два разных ответа: пусто и
  // «мы не смогли спросить».
  if (isError) {
    return (
      <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--error)' }}>
        {t('loadFailed')}
        <div style={{ marginTop: 'var(--space-3)' }}>
          <button className="btn btn-sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-my-route'] })}>
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!route) {
    return (
      <div>
        {/* Рейса нет — подсказка нужнее всего: человек в поле, а везти
            некуда. Показать одну строку «маршрут не назначен» и замолчать
            значит отправить его думать самому там, где мы умеем помочь. */}
        {!isOwner && <NextStopPanel lang={lang} />}
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
          {t('none')}
        </div>
      </div>
    );
  }

  const left = route.stops.filter((s) => (s.status || 'pending') === 'pending').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={24} /> {t('title')}
        </h2>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          {new Date(route.date).toLocaleDateString('ru-RU')} · {t('left')} {left} {t('of')} {route.stops.length}
        </span>
      </div>

      {/* Смена и здесь, а не только на карте клиентов: водитель в неё не
          заходит вовсе — ему назначили рейс, он открыл рейс. Без этой
          кнопки у него был бы трек только через Telegram, а без Telegram —
          никакого. Владельцу не показываем: см. `isOwner` выше. */}
      {!isOwner && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <FieldTrackButton lang={lang} />
        </div>
      )}

      {/* «Куда дальше» — НАД списком, но список не трогает: порядок рейса
          собрал владелец, и подсказка печатает его номер («ближайшая из
          ваших — №5»), а не переставляет адреса. Водитель видит, что ему
          предлагают перескочить, и волен не соглашаться. */}
      {!isOwner && <NextStopPanel lang={lang} />}

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
                      {done[lang]}
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
                      <Check size={14} /> {t('delivered')}
                    </button>
                    <button className="btn btn-sm" disabled={busy === stop.id}
                      onClick={() => mark(stop, 'failed')}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--error)', color: 'var(--error)' }}>
                      <X size={14} /> {t('failed')}
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
