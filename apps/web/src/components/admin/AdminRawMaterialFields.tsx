'use client';

import { BULK_KINDS, KIND_LABELS, UNIT_OPTIONS, type RawMaterial } from './rawMaterialTypes';
import type { CropNorm } from './growingData';
import { input, label } from './adminFormStyles';

// Поля формы сырья. Их два непересекающихся набора — приход по существующей
// позиции и заведение новой, — и в одном компоненте они только соседствовали:
// ни одного общего поля у них нет. Вынесены отдельно, чтобы AdminRawMaterialForm
// остался тем, чем является: выбором набора и отправкой.

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 'var(--space-3)',
};

interface Supplier {
  id: string;
  name: string;
}

export interface ReceiptFieldsProps {
  material: RawMaterial;
  suppliers: Supplier[];
  quantity: string;
  setQuantity: (v: string) => void;
  unitCost: string;
  setUnitCost: (v: string) => void;
  supplierId: string;
  setSupplierId: (v: string) => void;
  onCredit: boolean;
  setOnCredit: (v: boolean) => void;
  intakeUnit: 'g' | 'kg';
  setIntakeUnit: (v: 'g' | 'kg') => void;
  intakeUnitLabel: string;
}

/** Приход по существующей позиции: сколько, почём, от кого. */
export function RawMaterialReceiptFields({
  material, suppliers, quantity, setQuantity, unitCost, setUnitCost,
  supplierId, setSupplierId, onCredit, setOnCredit,
  intakeUnit, setIntakeUnit, intakeUnitLabel,
}: ReceiptFieldsProps) {
  return (
    <div style={gridStyle}>
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
  );
}

export interface NewMaterialFieldsProps {
  name: string;
  setName: (v: string) => void;
  kind: RawMaterial['kind'];
  setKind: (v: RawMaterial['kind']) => void;
  unit: string;
  setUnit: (v: string) => void;
  minStock: string;
  setMinStock: (v: string) => void;
  cropType: string;
  setCropType: (v: string) => void;
  norms: CropNorm[];
}

/** Заведение новой позиции: имя, тип, единица, порог, культура. */
export function NewRawMaterialFields({
  name, setName, kind, setKind, unit, setUnit,
  minStock, setMinStock, cropType, setCropType, norms,
}: NewMaterialFieldsProps) {
  return (
    <div style={gridStyle}>
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
        {/* Единица обязана совпадать с единицей нормы культуры: пересчёта
            в коде нет нигде, списание вычитает число как есть. Кокос —
            граммы, пробка агро ваты и дражированные семена салата —
            штуки. Килограммы вводятся при приходе, там они переводятся. */}
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
  );
}
