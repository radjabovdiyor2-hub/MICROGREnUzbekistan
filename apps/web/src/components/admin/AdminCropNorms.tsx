'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Sprout } from 'lucide-react';
import { AdminCropNormForm } from './AdminCropNormForm';
import type { CropNorm } from './growingData';

// ══════════════════════════════════════════════════════════════════════
// Нормы культур: сколько сырья уходит на лоток и сколько с него снимают.
//
// Экрана не было, хотя сидер прямо советует владельцу править нормы
// «в админке: Посадки → Нормы культур», а GET/POST /api/admin/crop-norms
// давно готовы. Без него список культур нечем пополнить: посадка знает
// только те культуры, что засеяны скриптом.
//
// Отсюда же берётся выпадающий список в форме сырья — то самое поле, где
// «Амарант» по-русски проходило и ломало списание.
// ══════════════════════════════════════════════════════════════════════

export function AdminCropNorms() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CropNorm | null>(null);
  const [showNew, setShowNew] = useState(false);

  const { data: norms = [], isLoading } = useQuery({
    queryKey: ['admin-crop-norms'],
    queryFn: async () => {
      const res = await fetch('/api/admin/crop-norms', { credentials: 'same-origin' });
      const json = await res.json();
      return (json.norms ?? []) as CropNorm[];
    },
  });

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/admin/crop-norms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Не удалось сохранить');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-crop-norms'] });
      setEditing(null);
      setShowNew(false);
    },
  });

  const remove = useMutation({
    mutationFn: async (norm: CropNorm) => {
      const res = await fetch(`/api/admin/crop-norms?cropType=${encodeURIComponent(norm.cropType)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Не удалось скрыть');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-crop-norms'] }),
  });

  const cell: React.CSSProperties = {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    whiteSpace: 'nowrap',
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sprout size={20} /> Нормы культур
        </h2>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          По ним посадка списывает сырьё и считает себестоимость
        </span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }}
          onClick={() => { setEditing(null); setShowNew(true); }}>
          <Plus size={16} /> Добавить культуру
        </button>
      </div>

      {(showNew || editing) && (
        <AdminCropNormForm
          key={editing?.cropType ?? 'new'}
          norm={editing}
          saving={save.isPending}
          error={save.error instanceof Error ? save.error.message : ''}
          onCancel={() => { setShowNew(false); setEditing(null); }}
          onSubmit={(body) => save.mutate(body)}
        />
      )}

      {isLoading ? (
        <div className="card" style={{ padding: 'var(--space-4)' }}>Загрузка…</div>
      ) : norms.length === 0 ? (
        <div className="card" style={{ padding: 'var(--space-4)', color: 'var(--text-muted)' }}>
          Справочник пуст. Пока в нём нет культур, посадка не сможет ни списать
          семена, ни посчитать себестоимость партии.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-primary)', textAlign: 'left' }}>
                <th style={{ ...cell, color: 'var(--text-muted)' }}>КУЛЬТУРА</th>
                <th style={{ ...cell, color: 'var(--text-muted)' }}>СЕМЯН НА ЛОТОК</th>
                <th style={{ ...cell, color: 'var(--text-muted)' }}>ВЫХОД С ЛОТКА</th>
                <th style={{ ...cell, color: 'var(--text-muted)' }}>ФАЗЫ (Т/С/Х)</th>
                <th style={cell} />
              </tr>
            </thead>
            <tbody>
              {norms.map((n) => (
                <tr key={n.cropType} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                  <td style={{ ...cell, fontWeight: 'var(--font-semibold)' }}>
                    {n.nameRu}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--font-normal)' }}>
                      {' '}· {n.cropType}
                    </span>
                  </td>
                  <td style={cell}>{n.seedGramsPerTray} г</td>
                  <td style={cell}>{n.yieldPerTray ? `${n.yieldPerTray} г` : '—'}</td>
                  <td style={{ ...cell, color: 'var(--text-secondary)' }}>
                    {n.darkDays} / {n.lightDays} / {n.shelfDays} дн
                  </td>
                  <td style={cell}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => { setShowNew(false); setEditing(n); }}>
                        Правка
                      </button>
                      <button className="btn btn-sm btn-ghost" style={{ color: 'var(--error)' }}
                        onClick={() => {
                          if (confirm(`Скрыть культуру «${n.nameRu}»? Посадки, где она уже использована, не изменятся.`)) {
                            remove.mutate(n);
                          }
                        }}>
                        Скрыть
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
