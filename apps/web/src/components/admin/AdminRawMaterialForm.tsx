'use client';

import { useEffect, useState } from 'react';
import { BULK_KINDS, KIND_LABELS, UNIT_OPTIONS, type RawMaterial } from './rawMaterialTypes';
import { fetchCropNorms, type CropNorm } from './growingData';

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
  // Единица ВВОДА прихода. Хранение всегда в граммах; килограммы переводим.
  const [intakeUnit, setIntakeUnit] = useState<'g' | 'kg'>('kg');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [norms, setNorms] = useState<CropNorm[]>([]);

  useEffect(() => {
    fetch('/api/inventory/suppliers', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => setSuppliers(d.suppliers ?? []))
      .catch(() => {});
    // Культуры — из справочника норм, а не из головы. Поле было свободным,
    // и «Амарант» по-русски прошло валидацию, но посадка ищет `amaranth`
    // точным совпадением и семян не находила.
    fetchCropNorms().then(setNorms).catch(() => {});
  }, []);

  // Килограммы → граммы: и количество, и цена. Цена за килограмм делится
  // на 1000, иначе средневзвешенная себестоимость вырастет в тысячу раз.
  const factor = material?.unit === 'g' && intakeUnit === 'kg' ? 1000 : 1;
  const intakeUnitLabel = factor === 1000 ? 'кг' : (material?.unit ?? '');
  const storedQuantity = Number(quantity) * factor;
  const storedUnitCost = Number(unitCost) / factor;

  const submitReceipt = () => {
    onSubmit({
      action: 'receipt',
      materialId: material!.id,
      quantity: storedQuantity,
      unitCost: storedUnitCost,
      supplierId: supplierId || null,
      onCredit,
    });
  };

  const submitNew = () => {
    onSubmit({ name, kind, unit: BULK_KINDS.includes(kind) ? 'g' : unit, minStock: Number(minStock) || 0, cropType: cropType || null });
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
            <label style={label} htmlFor="raw-qty">Количество</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input id="raw-qty" style={input} type="number" value={quantity}
                onChange={(e) => setQuantity(e.target.value)} placeholder="1" />
              {/* Мешок покупают килограммами, а норма расхода — в граммах.
                  Переводим здесь и показываем результат: раньше килограммы
                  можно было выбрать единицей хранения, и списание уходило
                  в тысячу раз мимо. */}
              {material.unit === 'g' ? (
                <select style={{ ...input, width: 110 }} value={intakeUnit}
                  onChange={(e) => setIntakeUnit(e.target.value as 'g' | 'kg')}>
                  <option value="kg">кг</option>
                  <option value="g">г</option>
                </select>
              ) : (
                <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                  {material.unit}
                </span>
              )}
            </div>
          </div>
          <div>
            <label style={label} htmlFor="raw-cost">Цена за {intakeUnitLabel}</label>
            <input id="raw-cost" style={input} type="number" value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)} placeholder="70000" />
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
            <select style={input} value={kind} onChange={(e) => {
              const next = e.target.value as RawMaterial['kind'];
              setKind(next);
              if (BULK_KINDS.includes(next)) setUnit('g');
            }}>
              {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Единица</label>
            {/* У семян и субстрата единица не выбирается: нормы расхода
                заданы в граммах, и любая другая единица увела бы списание
                мимо. Килограммы вводятся при приходе — там они переводятся. */}
            {BULK_KINDS.includes(kind) ? (
              <div style={{ ...input, color: 'var(--text-muted)' }}>
                граммы (нормы расхода в граммах)
              </div>
            ) : (
              <select style={input} value={unit} onChange={(e) => setUnit(e.target.value)}>
                {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            )}
          </div>
          <div>
            <label style={label}>Предупреждать при остатке</label>
            <input style={input} type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="200" />
          </div>
          {kind === 'SEED' && (
            <div>
              <label style={label} htmlFor="raw-crop">Культура (для списания при посадке)</label>
              <select id="raw-crop" style={input} value={cropType}
                onChange={(e) => setCropType(e.target.value)}>
                <option value="">— не указана —</option>
                {norms.map((n) => (
                  <option key={n.cropType} value={n.cropType}>
                    {n.nameRu} ({n.cropType})
                  </option>
                ))}
              </select>
              {norms.length === 0 && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', marginTop: 4 }}>
                  Справочник культур пуст — заполните его в разделе «Нормы культур»,
                  иначе посадка не сможет списать эти семена.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {material && (
        <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Сейчас на складе {material.stock} {material.unit} по {Math.round(material.avgCost)} сум.
          {factor === 1000 && quantity && (
            <> Придёт {storedQuantity.toLocaleString('ru-RU')} г по {storedUnitCost.toFixed(2)} сум/г.</>
          )}
          {quantity && unitCost && (
            <> После прихода средняя станет{' '}
              {Math.round(
                (material.stock * material.avgCost + storedQuantity * storedUnitCost) /
                  (material.stock + storedQuantity || 1),
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
