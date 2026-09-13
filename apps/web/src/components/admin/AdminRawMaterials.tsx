'use client';

import { useState } from 'react';

import { sumLabel, unitLabel } from '@/lib/units';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, PackagePlus, Sprout } from 'lucide-react';
import { AdminRawMaterialForm } from './AdminRawMaterialForm';
import { useFeedback } from './AdminFeedback';
import { AdminRawMaterialTable } from './AdminRawMaterialTable';
import { materialName, type RawMaterial } from './rawMaterialTypes';

// ══════════════════════════════════════════════════════════════════════
// Склад сырья: семена, субстрат, лотки, упаковка.
//
// Раздела не существовало — как и самого учёта сырья: закупки семян и
// субстрата нигде не числились, а деньги на них уходили.
// ══════════════════════════════════════════════════════════════════════

const T = {
  title: { ru: 'Сырьё и расходники', uz: 'Xomashyo va sarf materiallari' },
  inStock: { ru: 'В запасе на', uz: 'Zaxirada' },
  showHidden: { ru: 'Показать скрытые', uz: "Yashirilganlarni ko'rsatish" },
  add: { ru: 'Завести позицию', uz: "Pozitsiya qo'shish" },
  lowSoon: { ru: 'Скоро закончится', uz: 'Tez orada tugaydi' },
  leftWord: { ru: 'осталось', uz: 'qoldi' },
  threshold: { ru: 'порог', uz: 'chegara' },
  loading: { ru: 'Загрузка…', uz: 'Yuklanmoqda…' },
  hide: { ru: 'Скрыть', uz: 'Yashirish' },
  stillInStock: { ru: 'На складе ещё', uz: 'Omborda yana' },
  keepHistory: {
    ru: 'Приходы и себестоимость сохранятся.',
    uz: 'Kirimlar va tannarx saqlanib qoladi.',
  },
  removeFailed: { ru: 'Не удалось удалить', uz: "O'chirib bo'lmadi" },
  restoreFailed: { ru: 'Не удалось вернуть позицию', uz: "Pozitsiyani qaytarib bo'lmadi" },
  saveFailed: { ru: 'Не удалось сохранить', uz: "Saqlab bo'lmadi" },
};

// Вопрос собирается ЦЕЛИКОМ на каждом языке и живёт ОТДЕЛЬНО от словаря
// простых строк: по-узбекски имя стоит перед сказуемым, и склейка
// «слово + имя» дала бы «Yashirilsinmi «Семена»?». Порядок слов здесь
// такой же смысловой, как послелог в `perUnit`.
const hideTitle = {
  ru: (name: string) => `Скрыть «${name}»?`,
  uz: (name: string) => `«${name}» yashirilsinmi?`,
};

export function AdminRawMaterials({ focus = '', lang }: { focus?: string; lang: 'ru' | 'uz' }) {
  const t = (k: keyof typeof T) => T[k][lang];
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const [receiptFor, setReceiptFor] = useState<RawMaterial | null>(null);
  const [editFor, setEditFor] = useState<RawMaterial | null>(null);
  const [showNew, setShowNew] = useState(false);

  const [showHidden, setShowHidden] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-raw-materials', showHidden],
    queryFn: async () => {
      const url = showHidden
        ? '/api/admin/raw-materials?includeInactive=1'
        : '/api/admin/raw-materials';
      const res = await fetch(url, { credentials: 'same-origin' });
      const json = await res.json();
      return (json.materials ?? []) as RawMaterial[];
    },
  });

  // Скрытие, а не удаление: у позиции могут быть приходы с реально
  // потраченными деньгами. Сервер сам решает — если движений не было ни
  // одного, строка удаляется физически.
  const remove = useMutation({
    mutationFn: async (m: RawMaterial) => {
      const res = await fetch(`/api/admin/raw-materials?id=${m.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('removeFailed'));
      return json as { removed: boolean; movements?: number };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-raw-materials'] }),
  });

  const restore = useMutation({
    mutationFn: async (m: RawMaterial) => {
      const res = await fetch('/api/admin/raw-materials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: m.id, isActive: true }),
      });
      if (!res.ok) throw new Error(t('restoreFailed'));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-raw-materials'] }),
  });

  const handleDelete = async (m: RawMaterial) => {
    const agreed = await notify.confirm({
      title: hideTitle[lang](materialName(m, lang)),
      detail: m.stock > 0
        ? `${t('stillInStock')} ${m.stock} ${unitLabel(m.unit, lang)}. ${t('keepHistory')}`
        : t('keepHistory'),
      confirmText: t('hide'),
    });
    if (agreed) remove.mutate(m);
  };

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      // Правка и заведение идут ОДНОЙ кнопкой формы, но разными дверями:
      // POST создаёт, PATCH меняет. Форма помечает своё намерение `action`,
      // а не парой похожих обработчиков, которые однажды разойдутся.
      const isUpdate = body.action === 'update';
      const res = await fetch('/api/admin/raw-materials', {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('saveFailed'));
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-raw-materials'] });
      setReceiptFor(null);
      setShowNew(false);
      setEditFor(null);
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
          <Sprout size={20} /> {t('title')}
        </h2>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {t('inStock')} {fmt(totalValue)} {sumLabel(lang)}
        </span>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          {t('showHidden')}
        </label>
        <button className="btn btn-primary" onClick={() => { setEditFor(null); setReceiptFor(null); setShowNew(true); }}>
          <PackagePlus size={16} /> {t('add')}
        </button>
      </div>

      {low.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-3)', borderLeft: '3px solid var(--warning)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warning)', fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>
            <AlertTriangle size={16} /> {t('lowSoon')}
          </div>
          <div style={{ marginTop: 6, fontSize: 'var(--text-sm)' }}>
            {low.map((m) => (
              <div key={m.id}>
                {materialName(m, lang)} — {t('leftWord')} {m.stock} {unitLabel(m.unit, lang)} ({t('threshold')} {m.minStock} {unitLabel(m.unit, lang)})
              </div>
            ))}
          </div>
        </div>
      )}

      {(showNew || receiptFor || editFor) && (
        // key пересоздаёт форму при смене позиции: подставленная цена
        // поставщика — начальное состояние, а не эффект.
        <AdminRawMaterialForm
          key={editFor?.id ?? receiptFor?.id ?? 'new'}
          material={receiptFor}
          editing={editFor}
          saving={save.isPending}
          error={save.error instanceof Error ? save.error.message : ''}
          lang={lang}
          onCancel={() => { setShowNew(false); setReceiptFor(null); setEditFor(null); }}
          onSubmit={(body) => save.mutate(body)}
        />
      )}

      {isLoading ? (
        <div className="card" style={{ padding: 'var(--space-4)' }}>{t('loading')}</div>
      ) : (
        <AdminRawMaterialTable
          lang={lang}
          focus={focus}
          materials={materials}
          fmt={fmt}
          onReceipt={(m) => { setShowNew(false); setEditFor(null); setReceiptFor(m); }}
          onEdit={(m) => { setShowNew(false); setReceiptFor(null); setEditFor(m); }}
          onDelete={handleDelete}
          onRestore={(m) => restore.mutate(m)}
        />
      )}
    </div>
  );
}
