'use client';

import { useEffect, useState } from 'react';
import { KIND_LABELS, UNIT_OPTIONS, type RawMaterial } from './rawMaterialTypes';

// Форма выполняет две задачи: завести позицию сырья и оприходовать приход.
// `material` задан → приход по нему; `null` → заведение новой позиции.

interface Supplier {
  id: string;
  name: string;
}

interface Props {
  material: RawMaterial | null;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}

const input: React.CSSProperties = {
  width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
  color: 'var(--text-primary)', fontSize: 'var(--text-sm)',
};

const label: React.CSSProperties = {
  fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4, display: 'block',
};

export function AdminRawMaterialForm({ material, saving, error, onCancel, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<RawMaterial['kind']>('SEED');
  const [unit, setUnit] = useState('g');
  const [minStock, setMinStock] = useState('');
  const [cropType, setCropType] = useState('');

  const [quantity, setQuantity] = useState('');
  // Подставляем последнюю цену этого поставщика: чаще всего она и есть
  // актуальная, а если рынок изменился — владелец правит, и прайс обновится.
  // Начальное значение, а не setState в эффекте: форма пересоздаётся при смене
  // позиции, и лишний каскад рендеров тут не нужен.
  const [unitCost, setUnitCost] = useState(
    material?.lastPrice ? String(material.lastPrice.price) : '',
  );
  const [supplierId, setSupplierId] = useState(material?.lastPrice?.supplierId ?? '');
  const [onCredit, setOnCredit] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    fetch('/api/inventory/suppliers', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => setSuppliers(d.suppliers ?? []))
      .catch(() => {});
  }, []);

  const submitReceipt = () => {
    onSubmit({
      action: 'receipt',
      materialId: material!.id,
      quantity: Number(quantity),
      unitCost: Number(unitCost),
      supplierId: supplierId || null,
      onCredit,
    });
  };

  const submitNew = () => {
    onSubmit({ name, kind, unit, minStock: Number(minStock) || 0, cropType: cropType || null });
  };

  const priceChanged =
    material?.lastPrice != null && Number(unitCost) !== material.lastPrice.price;

  return (
    <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
      <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
        {material ? `Приход: ${material.name}` : 'Новая позиция сырья'}
      </h3>

      {material ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
          <div>
            <label style={label}>Количество ({material.unit})</label>
            <input style={input} type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1000" />
          </div>
          <div>
            <label style={label}>Цена за {material.unit}</label>
            <input style={input} type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="70" />
          </div>
          <div>
            <label style={label}>Поставщик</label>
            <select style={input} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— не указан —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)' }}>
              <input type="checkbox" checked={onCredit} onChange={(e) => setOnCredit(e.target.checked)} />
              В долг
            </label>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
          <div>
            <label style={label}>Название</label>
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Семена гороха" />
          </div>
          <div>
            <label style={label}>Тип</label>
            <select style={input} value={kind} onChange={(e) => setKind(e.target.value as RawMaterial['kind'])}>
              {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Единица</label>
            <select style={input} value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Предупреждать при остатке</label>
            <input style={input} type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="200" />
          </div>
          {kind === 'SEED' && (
            <div>
              <label style={label}>Культура (для списания при посадке)</label>
              <input style={input} value={cropType} onChange={(e) => setCropType(e.target.value)} placeholder="pea" />
            </div>
          )}
        </div>
      )}

      {material && (
        <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Сейчас на складе {material.stock} {material.unit} по {Math.round(material.avgCost)} сум.
          {quantity && unitCost && (
            <> После прихода средняя станет{' '}
              {Math.round(
                (material.stock * material.avgCost + Number(quantity) * Number(unitCost)) /
                  (material.stock + Number(quantity) || 1),
              )}{' '}
              сум — приход усредняется с остатком.
            </>
          )}
          {priceChanged && <> Цена поставщика изменилась — прайс обновится.</>}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 'var(--space-2)', color: 'var(--error)', fontSize: 'var(--text-sm)' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
        <button className="btn btn-primary" disabled={saving} onClick={material ? submitReceipt : submitNew}>
          {saving ? 'Сохраняю…' : material ? 'Оприходовать' : 'Завести'}
        </button>
        <button className="btn" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}
