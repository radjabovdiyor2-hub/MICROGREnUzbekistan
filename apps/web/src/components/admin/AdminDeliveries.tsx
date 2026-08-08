'use client';

import { useState, useEffect } from 'react';
import { Plus, Truck } from 'lucide-react';
import { AdminDeliveryForm } from './AdminDeliveryForm';

interface DeliveryRoute {
  id: string;
  driverId: string;
  driver?: { name: string; phone: string };
  date: string;
  status: string;
  stops: DeliveryStop[];
}

interface DeliveryStop {
  id: string;
  address: string;
  phone: string | null;
  status: string;
  orderIndex: number;
}

export function AdminDeliveries() {
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reload = () => {
    fetch('/api/admin/deliveries')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setRoutes(data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {routes.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            Нет активных маршрутов
          </div>
        ) : (
          routes.map(route => (
            <div key={route.id} className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <div>
                  <h3 style={{ fontWeight: 'bold' }}>Курьер: {route.driver?.name || route.driverId}</h3>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Дата: {new Date(route.date).toLocaleDateString('ru-RU')}
                  </div>
                </div>
                <div>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold',
                    background: route.status === 'COMPLETED' ? 'var(--success-bg)' : 'var(--info-bg)',
                    color: route.status === 'COMPLETED' ? 'var(--success)' : 'var(--info)'
                  }}>
                    {route.status}
                  </span>
                </div>
              </div>
              
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-2)' }}>
                <h4 style={{ fontSize: '14px', marginBottom: 'var(--space-2)' }}>Точки доставки ({route.stops.length}):</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {route.stops.map((stop, i) => (
                    <div key={stop.id} style={{ display: 'flex', gap: 'var(--space-2)', fontSize: '13px', alignItems: 'flex-start' }}>
                      <div style={{ background: 'var(--bg-secondary)', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                        {i + 1}
                      </div>
                      <div>
                        <div style={{ fontWeight: '500' }}>{stop.address}</div>
                        {stop.phone && <div style={{ color: 'var(--text-muted)' }}>{stop.phone}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
