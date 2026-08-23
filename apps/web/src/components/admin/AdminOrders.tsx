'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Clock, Folder } from 'lucide-react';
import { STATUS_CONFIG, STATUS_TABS } from './adminOrdersConfig';
import { AdminNotice } from './AdminNotice';
import { useAdminBack } from './useAdminBack';
import { AdminOrderDetail } from './AdminOrderDetail';
import type { Order } from './adminOrderTypes';
import { AdminPager } from './AdminPager';

import { AdminOrderRow } from './AdminOrderRow';
import { AdminOrdersBulk } from './AdminOrdersBulk';
import { useSelection } from './useSelection';

interface OrdersPage {
  orders: Order[];
  total: number;
}

/** Заказов на странице. По умолчанию API отдаёт 20 — этого мало даже на день.
 *  Листаем страницами, а не «показать ещё»: limit на сервере ограничен сотней,
 *  и накопительная кнопка молча перестала бы догружать. */
const PAGE_SIZE = 50;

export function AdminOrders({ focus = '' }: { focus?: string }) {
  const pick = useSelection<string>();
  const [activeTab, setActiveTab] = useState('ALL');
  const [selected, setSelected] = useState<Order | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [page, setPage] = useState(1);
  /** Заказ из ссылки открыт до первого «назад», дальше работает список. */
  const [dismissedFocus, setDismissedFocus] = useState('');
  const [statusError, setStatusError] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  // Раньше запрос шёл без параметров, а API по умолчанию отдаёт 20 записей:
  // экран показывал последние двадцать заказов и молчал об остальных. Найти
  // заказы конкретного клиента было нечем — фильтр по телефону API умел
  // всегда, но его никто не передавал.
  const { data, isLoading: loading, refetch: fetchOrders } = useQuery<OrdersPage>({
    queryKey: ['admin-orders', activeTab, phone, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
      if (activeTab !== 'ALL') params.set('status', activeTab);
      if (phone) params.set('phone', phone);
      const res = await fetch(`/api/orders?${params}`);
      const body = await res.json();
      return { orders: body.orders || [], total: body.total ?? 0 };
    }
  });

  const orders = data?.orders ?? [];
  const visibleIds = orders.map((o: Order) => o.id);

  // Ключ состава, а не сам массив: список пересоздаётся каждым обновлением
  // запроса, и зависимость от ссылки дала бы вызов на каждый тик опроса.
  const visibleKey = visibleIds.join(',');
  const { keepOnly } = pick;

  // Смена вкладки или страницы не должна оставлять в выборе то, чего уже
  // не видно: иначе массовое действие уходит на заказы, которых нет на
  // экране.
  useEffect(() => {
    keepOnly(visibleKey ? visibleKey.split(',') : []);
  }, [visibleKey, keepOnly]);

  // Пришли по ссылке из Telegram (`?focus=`) — сразу раскрываем этот заказ.
  // Выводим из данных, а не эффектом: заказ появляется вместе со страницей
  // списка, и лишний прогон рендера ради setState тут не нужен. Сверяем и по
  // id, и по номеру — ИИ-офис оперирует номером «MG-000001», витрина cuid'ом.
  const focused =
    focus && focus !== dismissedFocus
      ? orders.find((o) => o.id === focus || o.orderNumber === focus) ?? null
      : null;
  const current = selected ?? focused;

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
  const fmtDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  /** Закрыть карточку — и ту, что открыла ссылка из Telegram, тоже. */
  const closeDetail = useCallback(() => {
    setSelected(null);
    if (focused) setDismissedFocus(focus);
  }, [focused, focus]);

  // «Назад» в Telegram возвращает к списку заказов, а не выходит из
  // приложения: переход в карточку живёт в состоянии, а не в истории.
  useAdminBack(closeDetail, Boolean(current));

  /**
   * Смена статуса заказа.
   *
   * Ответ сервера раньше не читался вовсе: отказ падал в `console.error`,
   * список перезагружался прежним, и владелец считал, что заказ уехал в
   * доставку. Статус при этом тянет за собой уведомление клиенту, возврат
   * товара на склад и зеркало в CRM — молчать о том, что он не сменился,
   * нельзя.
   */
  const updateStatus = async (orderId: string, newStatus: string) => {
    if (savingStatus) return;
    setSavingStatus(true);
    setStatusError('');
    try {
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: newStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setStatusError(body?.error || `Статус не сменился: сервер ответил ${res.status}`);
        return;
      }
      fetchOrders();
      if (current?.id === orderId) closeDetail();
    } catch {
      setStatusError('Статус не сменился: нет связи с сервером');
    } finally {
      setSavingStatus(false);
    }
  };

  if (current) {
    return (
      <>
        <AdminNotice>{statusError}</AdminNotice>
        <AdminOrderDetail
          order={current}
          onBack={closeDetail}
          onStatus={(status) => updateStatus(current.id, status)}
          fmt={fmt}
          fmtDate={fmtDate}
        />
      </>
    );
  }

  return (
    <div>
      <AdminNotice>{statusError}</AdminNotice>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', overflowX: 'auto', paddingBottom: 4 }}>
        {STATUS_TABS.map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setPage(1); }} className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-ghost'}`}
            style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {tab === 'ALL' ? <><ClipboardList size={14} /> Barchasi</> : <>{STATUS_CONFIG[tab]?.icon} {STATUS_CONFIG[tab]?.label}</>}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setPage(1); setPhone(phoneInput.trim()); }}
        style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}
      >
        <input
          type="text"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          placeholder="Поиск по телефону клиента"
          style={{
            flex: '1 1 220px', minWidth: 0,
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
          }}
        />
        <button type="submit" className="btn btn-sm btn-primary">Найти</button>
        {phone && (
          <button type="button" className="btn btn-sm btn-ghost"
            onClick={() => { setPhoneInput(''); setPhone(''); setPage(1); }}>
            Сбросить
          </button>
        )}
      </form>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <Clock size={32} style={{ animation: 'pulse 1.5s infinite', marginBottom: 'var(--space-2)' }} />
          <p>Yuklanmoqda...</p>
        </div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <Folder size={48} style={{ marginBottom: 'var(--space-2)' }} />
          <p>Buyurtmalar topilmadi</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <AdminOrdersBulk
            pick={pick}
            visibleIds={visibleIds}
            total={orders.length}
            onDone={fetchOrders}
          />

          {orders.map((order: Order) => (
            <AdminOrderRow
              key={order.id}
              order={order}
              picked={pick.has(order.id)}
              onPick={() => pick.toggle(order.id)}
              onOpen={() => setSelected(order)}
              fmt={fmt}
              fmtDate={fmtDate}
            />
          ))}
        </div>
      )}

      {!loading && (data?.total ?? 0) > 0 && (
        <AdminPager
          page={page}
          total={data?.total ?? 0}
          pageSize={PAGE_SIZE}
          onPage={setPage}
        />
      )}
    </div>
  );
}
