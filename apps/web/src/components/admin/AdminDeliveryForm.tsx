'use client';

import { useState } from 'react';
import { useEmployees, usePendingOrders } from './useAdminReferences';
import { Plus, X } from 'lucide-react';

// Форма создания маршрута доставки.
//
// Раздел был только для чтения: API умеет создавать маршруты со списком
// точек, а в компоненте не было ни одного POST. Экран показывал пустой
// список — и выглядело это как отсутствующая функция при готовом бэкенде.
//
// Второй разрыв, который здесь закрыт: точка маршрута не знала о заказе.
// `POST /api/admin/deliveries` принимает `orderId` с первого дня, а форма
// его не отправляла НИКОГДА — менеджер перепечатывал адрес и телефон из
// карточки заказа руками. Отсюда две беды сразу: опечатка в адресе, которую
// не с чем сверить, и невозможность потом ответить, какой заказ уехал на
// этой машине. Теперь точка добавляется выбором заказа; ручной ввод остался
// для того, что заказом не является, — забрать тару, заехать на склад.

interface Stop {
  address: string;
  phone: string;
  note: string;
  /** Заказ, ради которого едем. Именно его принимает API — и принимал всегда. */
  orderId?: string;
  orderNumber?: string;
}

interface Props {
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}

const field: React.CSSProperties = {
  width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
  color: 'var(--text-primary)', fontSize: 'var(--text-sm)',
};

const label: React.CSSProperties = {
  fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4, display: 'block',
};

const EMPTY_STOP: Stop = { address: '', phone: '', note: '' };

export function AdminDeliveryForm({ saving, error, onCancel, onSubmit }: Props) {
  const [driverId, setDriverId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [stops, setStops] = useState<Stop[]>([{ ...EMPTY_STOP }]);
  // Курьер выбирается из сотрудников, а не вводится текстом.
  const drivers = useEmployees();
  const orders = usePendingOrders();

  const takenOrderIds = new Set(stops.map((s) => s.orderId).filter(Boolean));
  const available = orders.filter((o) => !takenOrderIds.has(o.id));

  /** Заказ → точка маршрута: адрес и телефон берём из него, не из памяти. */
  const addFromOrder = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const stop: Stop = {
      address: order.address || '',
      phone: order.phone || '',
      note: '',
      orderId: order.id,
      orderNumber: order.orderNumber,
    };
    // Первая строка пустая — занимаем её, иначе в маршруте останется дыра.
    setStops((prev) => {
      const empty = prev.findIndex((p) => !p.address.trim() && !p.orderId);
      if (empty === -1) return [...prev, stop];
      return prev.map((p, i) => (i === empty ? stop : p));
    });
  };

  const setStop = (index: number, patch: Partial<Stop>) =>
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const filled = stops.filter((s) => s.address.trim());

  return (
    <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
      <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
        Новый маршрут
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div>
          <label style={label} htmlFor="route-driver">Курьер</label>
          <select id="route-driver" style={field} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">— не назначен —</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="route-date">Дата</label>
          <input id="route-date" type="date" style={field} value={date}
            onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <label style={label} htmlFor="route-order">Добавить точку из заказа</label>
        <select id="route-order" style={field} value=""
          disabled={available.length === 0}
          onChange={(e) => { addFromOrder(e.target.value); e.currentTarget.value = ''; }}>
          <option value="">
            {available.length === 0 ? '— неотвезённых заказов нет —' : '— выберите заказ —'}
          </option>
          {available.map((o) => (
            <option key={o.id} value={o.id}>
              #{o.orderNumber} · {o.address || 'без адреса'} · {o.phone}
            </option>
          ))}
        </select>
      </div>

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>
        Точки маршрута — в порядке объезда
      </div>

      {stops.map((stop, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {stop.orderNumber && (
            <span style={{
              padding: '2px 8px', borderRadius: 'var(--radius-full)',
              background: 'var(--info-bg)', color: 'var(--info)',
              fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', whiteSpace: 'nowrap',
            }}>#{stop.orderNumber}</span>
          )}
          <input style={{ ...field, flex: '2 1 200px' }} placeholder={`Адрес ${i + 1}`}
            value={stop.address} onChange={(e) => setStop(i, { address: e.target.value })} />
          <input style={{ ...field, flex: '1 1 120px' }} placeholder="Телефон"
            value={stop.phone} onChange={(e) => setStop(i, { phone: e.target.value })} />
          <input style={{ ...field, flex: '1 1 120px' }} placeholder="Заметка"
            value={stop.note} onChange={(e) => setStop(i, { note: e.target.value })} />
          {stops.length > 1 && (
            <button className="btn btn-ghost btn-sm" aria-label="Убрать точку"
              onClick={() => setStops((prev) => prev.filter((_, j) => j !== i))}>
              <X size={14} />
            </button>
          )}
        </div>
      ))}

      <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }}
        onClick={() => setStops((prev) => [...prev, { ...EMPTY_STOP }])}>
        <Plus size={14} /> Ещё точка
      </button>

      {error && (
        <div style={{ marginTop: 'var(--space-2)', color: 'var(--error)', fontSize: 'var(--text-sm)' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={saving || filled.length === 0}
          onClick={() =>
            onSubmit({
              driverId: driverId || null,
              date,
              stops: filled.map((s, index) => ({
                address: s.address.trim(),
                phone: s.phone.trim() || undefined,
                note: s.note.trim() || undefined,
                // Связь с заказом — то, ради чего всё и затевалось.
                orderId: s.orderId,
                orderIndex: index,
              })),
            })
          }>
          {saving ? 'Сохраняю…' : `Создать (${filled.length} точек)`}
        </button>
        <button className="btn" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}
