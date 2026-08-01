'use client';

import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { CheckCircle, Leaf, Plus } from 'lucide-react';
import { CROP_DB, type ProductOption } from './growingData';

// Форма добавления и правки партии: культура, лоток, даты, цикл.
// Показывается по флагу showForm и от списка партий не зависит.


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
  inputStyle: CSSProperties;
}

export function AdminGrowingForm({ showForm, setShowForm, editingId, setEditingId, products, selectedProductId, setSelectedProductId, cropType, setCropType, trays, setTrays, seedDate, setSeedDate, harvestQty, setHarvestQty, costPriceInput, setCostPriceInput, note, setNote, customDark, setCustomDark, customLight, setCustomLight, customShelf, setCustomShelf, addBatch, inputStyle }: Props) {
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
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Культура</label>
        <select value={cropType} onChange={e => {
          const c = e.target.value;
          setCropType(c);
          if (!editingId && CROP_DB[c]) {
            setCustomDark(CROP_DB[c].darkDays);
            setCustomLight(CROP_DB[c].lightDays);
            setCustomShelf(CROP_DB[c].shelfDays);
          }
        }}
          style={{ ...inputStyle, cursor: 'pointer' }}>
          {Object.entries(CROP_DB).map(([key, val]) => (
            <option key={key} value={key}>{val.nameRu} ({val.darkDays}д + {val.lightDays}с)</option>
          ))}
        </select>
      </div>
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Лотков</label>
        <input type="number" min={1} value={trays} onChange={e => setTrays(Number(e.target.value))} style={inputStyle} />
      </div>
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Дата посева</label>
        <input type="date" value={seedDate} onChange={e => setSeedDate(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Заметка</label>
        <input type="text" placeholder="Поставщик, сорт..." value={note} onChange={e => setNote(e.target.value)} style={inputStyle} />
      </div>
    </div>
    {/* Product link + harvest qty + cost */}
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Товар на складе (сбор → +склад)</label>
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
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Получим шт (упаковок)</label>
        <input type="number" min={1} value={harvestQty} onChange={e => setHarvestQty(Number(e.target.value))} style={inputStyle} />
      </div>
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }}>Себест. (сум)</label>
        <input type="number" min={0} value={costPriceInput} onChange={e => setCostPriceInput(Number(e.target.value))} style={inputStyle} placeholder="8000" />
      </div>
    </div>
    {/* Preview timeline */}
    {/* Preview timeline & Editable Cycle */}
    <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-secondary)' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>Цикл выращивания (Дни)</span>
        <span>Всего: {customDark + customLight + customShelf} дней</span>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
        <div>
          <label style={{ fontSize: '10px', color: 'var(--cat-1)', fontWeight: 600, marginBottom: 2, display: 'block' }}>🌑 Темнота (груз)</label>
          <input type="number" min={0} value={customDark} onChange={e => setCustomDark(Number(e.target.value))} style={{...inputStyle, padding: '6px 8px'}} />
        </div>
        <div>
          <label style={{ fontSize: '10px', color: 'var(--warning)', fontWeight: 600, marginBottom: 2, display: 'block' }}>☀️ На свету</label>
          <input type="number" min={0} value={customLight} onChange={e => setCustomLight(Number(e.target.value))} style={{...inputStyle, padding: '6px 8px'}} />
        </div>
        <div>
          <label style={{ fontSize: '10px', color: 'var(--success)', fontWeight: 600, marginBottom: 2, display: 'block' }}>📦 Хранение</label>
          <input type="number" min={0} value={customShelf} onChange={e => setCustomShelf(Number(e.target.value))} style={{...inputStyle, padding: '6px 8px'}} />
        </div>
      </div>

      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
        <div style={{ flex: customDark, background: 'var(--cat-1)', borderRadius: '4px 0 0 4px' }} title={`Темно: ${customDark} дн`} />
        <div style={{ flex: customLight, background: 'var(--warning)' }} title={`Свет: ${customLight} дн`} />
        <div style={{ flex: customShelf, background: 'var(--success)', borderRadius: '0 4px 4px 0' }} title={`Хранение: ${customShelf} дн`} />
      </div>
    </div>
    <div style={{ display: 'flex', gap: '8px' }}>
      {editingId && (
        <button onClick={() => { setEditingId(null); setShowForm(false); }} className="btn"
          style={{ flex: 1, borderRadius: '10px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          Отмена
        </button>
      )}
      <button onClick={addBatch} className="btn btn-primary"
        style={{ flex: 2, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        {editingId ? <CheckCircle size={16} /> : <Plus size={16} />} {editingId ? 'Сохранить изменения' : 'Добавить посадку'}
      </button>
    </div>
  </div>
)}
    </>
  );
}
