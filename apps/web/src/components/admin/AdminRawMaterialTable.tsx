'use client';

import { PackagePlus, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { KIND_LABELS, materialName, type RawMaterial } from './rawMaterialTypes';
import { focusOutline, isFocused, useScrollToFocused } from './useFocusedRow';
import { sumLabel, unitLabel } from '@/lib/units';

// Таблица остатков сырья. Вынесена из AdminRawMaterials, чтобы каждый файл
// оставался в пределах 200 строк.

interface Props {
  materials: RawMaterial[];
  fmt: (n: number) => string;
  onReceipt: (material: RawMaterial) => void;
  /** Правка позиции: имя, второе имя, тип, единица, порог, культура. */
  onEdit: (material: RawMaterial) => void;
  onDelete: (material: RawMaterial) => void;
  onRestore: (material: RawMaterial) => void;
  /** Сырьё, ради которого пришли по ссылке (`?focus=`, `receive_material`). */
  focus?: string;
  lang: 'ru' | 'uz';
}

const T = {
  empty: {
    ru: 'Сырья пока нет. Заведите семена, субстрат и упаковку — тогда приход начнёт считать их средневзвешенную себестоимость.',
    uz: "Hozircha xomashyo yo'q. Urug', substrat va qadoqni kiriting — shunda kirim ularning o'rtacha tannarxini hisoblay boshlaydi.",
  },
  name: { ru: 'НАЗВАНИЕ', uz: 'NOMI' },
  kind: { ru: 'ТИП', uz: 'TURI' },
  stock: { ru: 'ОСТАТОК', uz: 'QOLDIQ' },
  cost: { ru: 'СЕБЕСТОИМОСТЬ', uz: 'TANNARX' },
  value: { ru: 'В ЗАПАСЕ', uz: 'ZAXIRADA' },
  lastPrice: { ru: 'ПОСЛЕДНЯЯ ЦЕНА', uz: "OXIRGI NARX" },
  restore: { ru: 'Вернуть', uz: 'Qaytarish' },
  receipt: { ru: 'Приход', uz: 'Kirim' },
  hide: { ru: 'Скрыть', uz: 'Yashirish' },
  edit: { ru: 'Правка', uz: 'Tahrirlash' },
};

const cell: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 'var(--text-sm)',
  whiteSpace: 'nowrap',
};

export function AdminRawMaterialTable({
  materials, fmt, onReceipt, onEdit, onDelete, onRestore, focus = '', lang,
}: Props) {
  const t = (k: keyof typeof T) => T[k][lang];
  const scrollToFocused = useScrollToFocused<HTMLTableRowElement>();
  if (materials.length === 0) {
    return (
      <div className="card" style={{ padding: 'var(--space-4)', color: 'var(--text-muted)' }}>
        {t('empty')}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          {/* --border, а не --border-primary: второй переменной нет ни в
              токенах, ни в globals.css, и рамка брала цвет текста. */}
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
            <th style={{ ...cell, color: 'var(--text-muted)' }}>{t('name')}</th>
            <th style={{ ...cell, color: 'var(--text-muted)' }}>{t('kind')}</th>
            <th style={{ ...cell, color: 'var(--text-muted)' }}>{t('stock')}</th>
            <th style={{ ...cell, color: 'var(--text-muted)' }}>{t('cost')}</th>
            <th style={{ ...cell, color: 'var(--text-muted)' }}>{t('value')}</th>
            <th style={{ ...cell, color: 'var(--text-muted)' }}>{t('lastPrice')}</th>
            <th style={cell} />
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr key={m.id}
              ref={isFocused(focus, m.id) ? scrollToFocused : undefined}
              style={{
                borderBottom: '1px solid var(--border-secondary)',
                opacity: m.isActive === false ? 0.5 : 1,
                ...focusOutline(isFocused(focus, m.id)),
              }}>
              <td style={{ ...cell, fontWeight: 'var(--font-semibold)' }}>
                {materialName(m, lang)}
                {m.cropType && (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--font-normal)' }}>
                    {' '}· {m.cropType}
                  </span>
                )}
              </td>
              <td style={{ ...cell, color: 'var(--text-secondary)' }}>{KIND_LABELS[m.kind][lang]}</td>
              <td style={{ ...cell, color: m.isLow ? 'var(--warning)' : undefined, fontWeight: m.isLow ? 'var(--font-semibold)' : undefined }}>
                {m.stock} {unitLabel(m.unit, lang)}
                {m.isLow && ' ⚠️'}
              </td>
              {/* Средневзвешенная: закупки усредняются с остатком, поэтому
                  цена не скачет вместе с рынком при каждой поставке. */}
              <td style={cell}>{fmt(m.avgCost)} {sumLabel(lang)} / {unitLabel(m.unit, lang)}</td>
              <td style={cell}>{fmt(m.stockValue)} {sumLabel(lang)}</td>
              <td style={{ ...cell, color: 'var(--text-secondary)' }}>
                {m.lastPrice
                  ? `${fmt(m.lastPrice.price)} — ${m.lastPrice.supplier}`
                  : '—'}
              </td>
              <td style={cell}>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  {m.isActive === false ? (
                    <button className="btn btn-sm btn-ghost" onClick={() => onRestore(m)}>
                      <RotateCcw size={14} /> {t('restore')}
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-sm" onClick={() => onReceipt(m)}>
                        <PackagePlus size={14} /> {t('receipt')}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => onEdit(m)}
                        aria-label={t('edit')}>
                        <Pencil size={14} />
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => onDelete(m)}
                        style={{ color: 'var(--error)' }} aria-label={t('hide')}>
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
