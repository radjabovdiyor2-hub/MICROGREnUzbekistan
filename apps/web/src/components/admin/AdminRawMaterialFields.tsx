'use client';

import { BULK_KINDS, KIND_LABELS, UNIT_OPTIONS, type RawMaterial } from './rawMaterialTypes';
import { input, label } from './adminFormStyles';
import { unitLabel } from '@/lib/units';

// Поля формы сырья. Их два непересекающихся набора — приход по существующей
// позиции и заведение новой, — и в одном компоненте они только соседствовали:
// ни одного общего поля у них нет. Вынесены отдельно, чтобы AdminRawMaterialForm
// остался тем, чем является: выбором набора и отправкой.

const T = {
  quantity: { ru: 'Количество', uz: 'Miqdor' },
  pricePer: { ru: 'Цена за', uz: 'Narxi' },
  supplier: { ru: 'Поставщик', uz: 'Yetkazib beruvchi' },
  notSet: { ru: '— не указан —', uz: "— ko'rsatilmagan —" },
  onCredit: { ru: 'В долг', uz: 'Qarzga' },
  name: { ru: 'Название', uz: 'Nomi' },
  namePlaceholder: { ru: 'Семена гороха', uz: "No'xat urug'i" },
  kind: { ru: 'Тип', uz: 'Turi' },
  unit: { ru: 'Единица', uz: 'Birlik' },
  gramsOnly: {
    ru: 'граммы (нормы расхода в граммах)',
    uz: "gramm (sarf me'yorlari grammda)",
  },
  warnAt: { ru: 'Предупреждать при остатке', uz: 'Qoldiq shu darajada ogohlantirish' },
  crop: { ru: 'Культура', uz: 'Ekin' },
};

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
  lang: 'ru' | 'uz';
}

/** Приход по существующей позиции: сколько, почём, от кого. */
export function RawMaterialReceiptFields({
  material, suppliers, quantity, setQuantity, unitCost, setUnitCost,
  supplierId, setSupplierId, onCredit, setOnCredit,
  intakeUnit, setIntakeUnit, intakeUnitLabel, lang,
}: ReceiptFieldsProps) {
  const t = (k: keyof typeof T) => T[k][lang];
  return (
    <div style={gridStyle}>
      <div>
        <label style={label} htmlFor="raw-qty">{t('quantity')}</label>
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
              <option value="kg">{unitLabel('кг', lang)}</option>
              <option value="g">{unitLabel('г', lang)}</option>
            </select>
          ) : (
            <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              {unitLabel(material.unit, lang)}
            </span>
          )}
        </div>
      </div>
      <div>
        <label style={label} htmlFor="raw-cost">{t('pricePer')} {intakeUnitLabel}</label>
        <input id="raw-cost" style={input} type="number" value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)} placeholder="70000" />
      </div>
      <div>
        <label style={label}>{t('supplier')}</label>
        <select style={input} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">{t('notSet')}</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)' }}>
          <input type="checkbox" checked={onCredit} onChange={(e) => setOnCredit(e.target.checked)} />
          {t('onCredit')}
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
  lang: 'ru' | 'uz';
}

/** Заведение новой позиции: имя, тип, единица, порог, культура. */
export function NewRawMaterialFields({
  name, setName, kind, setKind, unit, setUnit,
  minStock, setMinStock, cropType, setCropType, lang,
}: NewMaterialFieldsProps) {
  const t = (k: keyof typeof T) => T[k][lang];
  return (
    <div style={gridStyle}>
      <div>
        <label style={label}>{t('name')}</label>
        <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} />
      </div>
      <div>
        <label style={label}>{t('kind')}</label>
        <select style={input} value={kind} onChange={(e) => {
          const next = e.target.value as RawMaterial['kind'];
          setKind(next);
          if (BULK_KINDS.includes(next)) setUnit('g');
        }}>
          {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v[lang]}</option>)}
        </select>
      </div>
      <div>
        <label style={label}>{t('unit')}</label>
        {/* Единица обязана совпадать с единицей нормы культуры: пересчёта
            в коде нет нигде, списание вычитает число как есть. Кокос —
            граммы, пробка агро ваты и дражированные семена салата —
            штуки. Килограммы вводятся при приходе, там они переводятся. */}
        {BULK_KINDS.includes(kind) ? (
          <div style={{ ...input, color: 'var(--text-muted)' }}>
            {t('gramsOnly')}
          </div>
        ) : (
          <select style={input} value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label[lang]}</option>)}
          </select>
        )}
      </div>
      <div>
        <label style={label}>{t('warnAt')}</label>
        <input style={input} type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="200" />
      </div>
      {kind === 'SEED' && (
        <div>
          {/* Метка культуры: по ней семена группируются в списке. Значение
              свободное — справочника норм, который его проверял, больше нет. */}
          <label style={label} htmlFor="raw-crop">{t('crop')}</label>
          <input id="raw-crop" style={input} value={cropType}
            onChange={(e) => setCropType(e.target.value)} placeholder="rukkola" />
        </div>
      )}
    </div>
  );
}
