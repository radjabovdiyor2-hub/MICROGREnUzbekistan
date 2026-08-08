'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';

// Форма создания маршрута доставки.
//
// Раздел был только для чтения: API умеет создавать маршруты со списком
// точек, а в компоненте не было ни одного POST. Экран показывал пустой
// список — и выглядело это как отсутствующая функция при готовом бэкенде.

interface Employee { id: string; name: string }
interface Stop { address: string; phone: string; note: string }

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
  const [drivers, setDrivers] = useState<Employee[]>([]);

  useEffect(() => {
    // Курьер выбирается из сотрудников, а не вводится текстом.
    fetch('/api/inventory/employees')
      .then((r) => r.json())
      .then((d) => setDrivers(d.employees ?? []))
      .catch(() => {});
  }, []);

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

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>
        Точки маршрута — в порядке объезда
      </div>

      {stops.map((stop, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
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
