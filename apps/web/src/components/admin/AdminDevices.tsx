'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Smartphone } from 'lucide-react';

import { timeoutSignal } from '@/lib/net/connection';

// ══════════════════════════════════════════════════════════════════════
// Телефоны, которые пишут трек сами.
//
// ЗАЧЕМ ЭТОТ ЭКРАН. Приложение на Android получает ключ устройства и шлёт
// маршрут, когда телефон в кармане и экран погашен. Ключ не истекает —
// иначе фоновая служба замолкала бы каждую неделю. Значит нужен способ
// его ПОГАСИТЬ: человек уволился, потерял телефон, сменил аппарат.
//
// Без этого экрана ключ отзывался бы только через базу, то есть никогда.
//
// ОТОЗВАННЫЕ НЕ ПРЯЧЕМ. Строка «писал до 5 сентября» объясняет дыру в
// отчёте лучше, чем её отсутствие.
// ══════════════════════════════════════════════════════════════════════

interface Device {
  id: string;
  label: string;
  platform: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  employee: { id: string; name: string };
}

/** «11.09, 14:05» — дату читают глазами, год в этом списке лишний. */
function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${date}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function AdminDevices({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState('');

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ['admin-devices'],
    queryFn: async () => {
      const res = await fetch('/api/auth/device', { signal: timeoutSignal() });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Не удалось загрузить устройства');
      return body.devices || [];
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/auth/device?id=${id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Не удалось отозвать');
    },
    onSuccess: () => {
      setFailed('');
      queryClient.invalidateQueries({ queryKey: ['admin-devices'] });
    },
    // Молчаливый отказ выглядит как «кнопка не работает»: ключ при этом
    // остаётся живым, а владелец уверен, что погасил его.
    onError: (error: Error) => setFailed(error.message),
  });

  // Ни одного приложения — блока нет вовсе. Пустой список на экране
  // владельца это ещё одна строка, которую надо прочитать и понять.
  if (devices.length === 0) return null;

  return (
    <div style={{ marginTop: 'var(--space-6)' }}>
      <h3
        style={{
          fontSize: 'var(--text-lg)',
          fontWeight: 'var(--font-semibold)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 'var(--space-3)',
        }}
      >
        <Smartphone size={18} /> {t('Телефоны с приложением', 'Ilovali telefonlar')}
      </h3>

      {failed && (
        <p style={{ color: 'var(--error)', fontSize: 'var(--text-sm)' }}>{failed}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {devices.map((device) => (
          <div
            key={device.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
              padding: 'var(--space-3)',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              opacity: device.revokedAt ? 0.55 : 1,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 'var(--font-semibold)' }}>
                {device.employee.name} — {device.label}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {t('выдан', 'berilgan')} {when(device.createdAt)}
                {' · '}
                {device.revokedAt
                  ? `${t('отозван', 'bekor qilingan')} ${when(device.revokedAt)}`
                  : `${t('на связи', 'aloqada')} ${when(device.lastSeenAt)}`}
              </div>
            </div>

            {!device.revokedAt && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(device.id)}
              >
                {t('Отозвать', 'Bekor qilish')}
              </button>
            )}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
        {t(
          'Отзыв гасит запись маршрута с этого телефона сразу. Человек сможет войти заново и получить новый ключ.',
          'Bekor qilish shu telefondan marshrut yozuvini darhol to‘xtatadi. Xodim qayta kirib, yangi kalit oladi.',
        )}
      </p>
    </div>
  );
}
