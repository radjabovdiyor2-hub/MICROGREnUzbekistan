'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, PackagePlus, Sprout } from 'lucide-react';
import { AdminRawMaterialForm } from './AdminRawMaterialForm';
import { AdminRawMaterialTable } from './AdminRawMaterialTable';
import type { RawMaterial } from './rawMaterialTypes';

// ══════════════════════════════════════════════════════════════════════
// Склад сырья: семена, субстрат, лотки, упаковка.
//
// Раздела не существовало — как и самого учёта сырья. Из-за этого посадка
// ничего не списывала, а себестоимость выращенного не бралась ниоткуда.
// ══════════════════════════════════════════════════════════════════════

export function AdminRawMaterials() {
  const queryClient = useQueryClient();
  const [receiptFor, setReceiptFor] = useState<RawMaterial | null>(null);
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-raw-materials'],
    queryFn: async () => {
      const res = await fetch('/api/admin/raw-materials', { credentials: 'same-origin' });
      const json = await res.json();
      return (json.materials ?? []) as RawMaterial[];
    },
  });

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/admin/raw-materials', {
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
      queryClient.invalidateQueries({ queryKey: ['admin-raw-materials'] });
      setReceiptFor(null);
      setShowNew(false);
    },
  });

  const materials = data ?? [];
  const low = materials.filter((m) => m.isLow);
  const totalValue = materials.reduce((sum, m) => sum + m.stockValue, 0);
  const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sprout size={20} /> Сырьё и расходники
        </h2>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          В запасе на {fmt(totalValue)} сум
        </span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowNew(true)}>
          <PackagePlus size={16} /> Завести позицию
        </button>
      </div>

      {low.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-3)', borderLeft: '3px solid var(--warning)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warning)', fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>
            <AlertTriangle size={16} /> Скоро закончится
          </div>
          <div style={{ marginTop: 6, fontSize: 'var(--text-sm)' }}>
            {low.map((m) => (
              <div key={m.id}>
                {m.name} — осталось {m.stock} {m.unit} (порог {m.minStock} {m.unit})
              </div>
            ))}
          </div>
        </div>
      )}

      {(showNew || receiptFor) && (
        // key пересоздаёт форму при смене позиции: подставленная цена
        // поставщика — начальное состояние, а не эффект.
        <AdminRawMaterialForm
          key={receiptFor?.id ?? 'new'}
          material={receiptFor}
          saving={save.isPending}
          error={save.error instanceof Error ? save.error.message : ''}
          onCancel={() => { setShowNew(false); setReceiptFor(null); }}
          onSubmit={(body) => save.mutate(body)}
        />
      )}

      {isLoading ? (
        <div className="card" style={{ padding: 'var(--space-4)' }}>Загрузка…</div>
      ) : (
        <AdminRawMaterialTable
          materials={materials}
          fmt={fmt}
          onReceipt={(m) => { setShowNew(false); setReceiptFor(m); }}
        />
      )}
    </div>
  );
}
