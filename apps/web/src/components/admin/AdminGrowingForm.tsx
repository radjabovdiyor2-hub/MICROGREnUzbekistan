'use client';

import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { CheckCircle, Leaf, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  CROP_DB,
  fetchCropNorms,
  plantingUnitPlural,
  type CropNorm,
  type PlantingRequirement,
  type ProductOption,
} from './growingData';
import { GrowingCycleFields, PlantingRequirements, fieldLabel } from './AdminGrowingFormBlocks';

// Форма добавления и правки партии: культура, количество, даты, цикл.
// Показывается по флагу showForm и от списка партий не зависит.
//
// Список культур берётся из СПРАВОЧНИКА НОРМ, а не из константы CROP_DB.
// Пока он читал константу, культура, заведённая владельцем в админке (тот же
// салат), в форме не появлялась вовсе: посадить её можно было только через
// API или бота. CROP_DB остаётся запасным вариантом на случай, если нормы
// ещё не загрузились.
//
// Подпись количества зависит от способа посадки: лотки у микрозелени,
// стаканчики у салата.


interface Props {
  showForm: boolean;
  setShowForm: Dispatch<SetStateAction<boolean>>;
  editingId: string | null;
  setEditingId: Dispatch<SetStateAction<string | null>>;
  products: ProductOption[];
  selectedProductId: string;
  setSelectedProductId: Dispatch<SetStateAction<string>>;
  cropType: string;
  setCropType: Dispatch<SetStateAction<string>>;
  trays: number;
  setTrays: Dispatch<SetStateAction<number>>;
  seedDate: string;
  setSeedDate: Dispatch<SetStateAction<string>>;
  harvestQty: number;
  setHarvestQty: Dispatch<SetStateAction<number>>;
  costPriceInput: number;
  setCostPriceInput: Dispatch<SetStateAction<number>>;
  note: string;
  setNote: Dispatch<SetStateAction<string>>;
  customDark: number;
  setCustomDark: Dispatch<SetStateAction<number>>;
  customLight: number;
  setCustomLight: Dispatch<SetStateAction<number>>;
  customShelf: number;
  setCustomShelf: Dispatch<SetStateAction<number>>;
  addBatch: () => void;
  requirements: PlantingRequirement[];
  estimatedCost: number;
  plantError: string;
  inputStyle: CSSProperties;
}

export function AdminGrowingForm({ showForm, setShowForm, editingId, setEditingId, products, selectedProductId, setSelectedProductId, cropType, setCropType, trays, setTrays, seedDate, setSeedDate, harvestQty, setHarvestQty, costPriceInput, setCostPriceInput, note, setNote, customDark, setCustomDark, customLight, setCustomLight, customShelf, setCustomShelf, addBatch, requirements, estimatedCost, plantError, inputStyle }: Props) {
  // Тот же ключ, что у формы сырья: справочник норм один, и запрашивать его
  // дважды при открытии двух форм подряд незачем.
  const { data: norms = [] } = useQuery<CropNorm[]>({
    queryKey: ['admin-crop-norms'],
    queryFn: fetchCropNorms,
  });

  // Пока нормы не пришли — показываем константу, чтобы форма не была пустой.
  const options = norms.length
    ? norms.map((n) => ({
        key: n.cropType,
        nameRu: n.nameRu,
        darkDays: n.darkDays,
        lightDays: n.lightDays,
        shelfDays: n.shelfDays,
      }))
    : Object.entries(CROP_DB).map(([key, val]) => ({ key, ...val }));

  const unitWord = plantingUnitPlural(
    norms.find((n) => n.cropType === cropType)?.plantingUnit ?? 'tray',
  );

  return (
    <>
{/* Add batch form */}
{showForm && (
  <div className="card" style={{ padding: 'var(--space-4)', animation: 'reveal-up 0.3s ease both' }}>
    <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Leaf size={16} color="var(--brand-primary)" /> {editingId ? 'Изменить посадку' : 'Новая посадка'}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
      <div>
        <label style={fieldLabel}>Культура</label>
        <select value={cropType} onChange={e => {
          const c = e.target.value;
          setCropType(c);
          const picked = options.find(o => o.key === c);
          if (!editingId && picked) {
            setCustomDark(picked.darkDays);
            setCustomLight(picked.lightDays);
            setCustomShelf(picked.shelfDays);
          }
        }}
          style={{ ...inputStyle, cursor: 'pointer' }}>
          {options.map((o) => (
            <option key={o.key} value={o.key}>{o.nameRu} ({o.darkDays}д + {o.lightDays}с)</option>
          ))}
        </select>
      </div>
      <div>
        <label style={fieldLabel}>
          {unitWord.charAt(0).toUpperCase() + unitWord.slice(1)}
        </label>
        <input type="number" min={1} value={trays} onChange={e => setTrays(Number(e.target.value))} style={inputStyle} />
      </div>
      <div>
        <label style={fieldLabel}>Дата посева</label>
        <input type="date" value={seedDate} onChange={e => setSeedDate(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={fieldLabel}>Заметка</label>
        <input type="text" placeholder="Поставщик, сорт..." value={note} onChange={e => setNote(e.target.value)} style={inputStyle} />
      </div>
    </div>
    {/* Product link + harvest qty + cost */}
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
      <div>
        <label style={fieldLabel}>Товар на складе (сбор → +склад)</label>
        <select value={selectedProductId} onChange={e => {
          setSelectedProductId(e.target.value);
          const p = products.find(pr => pr.id === e.target.value);
          if (p?.costPrice) setCostPriceInput(p.costPrice);
        }}
          style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">— не привязывать —</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.nameUz} (ост: {p.stock})</option>
          ))}
        </select>
      </div>
      <div>
        <label style={fieldLabel}>Получим шт (упаковок)</label>
        <input type="number" min={1} value={harvestQty} onChange={e => setHarvestQty(Number(e.target.value))} style={inputStyle} />
      </div>
      <div>
        <label style={fieldLabel}>Себест. (сум)</label>
        <input type="number" min={0} value={costPriceInput} onChange={e => setCostPriceInput(Number(e.target.value))} style={inputStyle} placeholder="8000" />
      </div>
    </div>
    <GrowingCycleFields
      customDark={customDark}
      setCustomDark={setCustomDark}
      customLight={customLight}
      setCustomLight={setCustomLight}
      customShelf={customShelf}
      setCustomShelf={setCustomShelf}
      inputStyle={inputStyle}
    />
    {!editingId && (requirements.length > 0 || plantError) && (
      <PlantingRequirements
        requirements={requirements}
        estimatedCost={estimatedCost}
        plantError={plantError}
      />
    )}
    <div style={{ display: 'flex', gap: '8px' }}>
      {editingId && (
        <button onClick={() => { setEditingId(null); setShowForm(false); }} className="btn"
          style={{ flex: 1, borderRadius: '10px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          Отмена
        </button>
      )}
      <button onClick={addBatch} className="btn btn-primary"
        disabled={!editingId && requirements.some((n) => !n.enough)}
        style={{ flex: 2, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        {editingId ? <CheckCircle size={16} /> : <Plus size={16} />} {editingId ? 'Сохранить изменения' : 'Добавить посадку'}
      </button>
    </div>
  </div>
)}
    </>
  );
}
