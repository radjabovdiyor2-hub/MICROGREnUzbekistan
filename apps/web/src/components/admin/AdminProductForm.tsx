'use client';

import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type { ProductForm, Category } from './productTypes';
import { PRODUCT_UNITS } from './productTypes';
import { ArrowLeft, CheckCircle, Clock, Plus, XCircle } from 'lucide-react';

// Форма создания и правки товара. Вынесена из AdminProducts: она рендерится
// ВМЕСТО списка (`if (showForm) return ...`), то есть это отдельный экран,
// а не часть списка.

interface Props {
  form: ProductForm;
  setForm: Dispatch<SetStateAction<ProductForm>>;
  editingId: string | null;
  formError: string;
  saving: boolean;
  uploading: boolean;
  images: string[];
  allCategories: Category[];
  lang: 'ru' | 'uz';
  t: (ru: string, uz: string) => string;
  inputStyle: CSSProperties;
  handleNameChange: (v: string) => void;
  handleSubmit: () => void;
  uploadImage: (file: File) => void;
  removeImage: (index: number) => void;
  setShowForm: (v: boolean) => void;
  /** Форма открылась с сохранённым черновиком. */
  draftRestored: boolean;
  /** Выбросить черновик и очистить форму. */
  discardDraft: () => void;
}

export function AdminProductForm({
  form, setForm, editingId, formError, saving, uploading, images,
  allCategories, lang, t, inputStyle,
  handleNameChange, handleSubmit, uploadImage, removeImage, setShowForm,
  draftRestored, discardDraft,
}: Props) {
  return (
    <div>
      <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <ArrowLeft size={16} /> {t('Назад', 'Orqaga')}
      </button>
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} /> {editingId ? t('Редактирование', 'Tahrirlash') : t('Добавить товар', "Yangi tovar qo'shish")}
        </h3>

        {/* Черновик подставлен — молчать об этом нельзя: человек открыл
            «добавить товар», видит заполненные поля и не понимает, откуда
            они. Поэтому строка видна и её можно выбросить одним нажатием. */}
        {draftRestored && (
          <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span>{t('Восстановлен незаконченный черновик', 'Tugallanmagan qoralama tiklandi')}</span>
            <button type="button" className="btn btn-sm" onClick={discardDraft}>
              {t('Начать заново', 'Boshidan')}
            </button>
          </div>
        )}

        {formError && <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--error-bg)', color: 'var(--error)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>{formError}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>{t('Название (UZ) *', 'Nomi (UZ) *')}</label>
            <input style={inputStyle} value={form.nameUz} onChange={e => handleNameChange(e.target.value)} placeholder="Rukkola mikroko'kati" />
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>{t('Название (RU)', 'Nomi (RU)')}</label>
            <input style={inputStyle} value={form.nameRu} onChange={e => setForm(f => ({ ...f, nameRu: e.target.value }))} placeholder="Микрозелень Руккола" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>{t('Цена продажи (сум) *', "Sotuv narxi (so'm) *")}</label>
            <input style={inputStyle} type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="15000" />
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', display: 'block', marginBottom: 2, fontWeight: 600 }}>{t('Себестоимость', 'Tan narxi')}</label>
            <input style={{ ...inputStyle, borderColor: form.costPrice ? 'var(--success)' : 'var(--border)' }} type="number" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="10000" />
            {form.price && form.costPrice && (
              <div style={{ fontSize: '10px', marginTop: 3, color: parseInt(form.price) > parseInt(form.costPrice) ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                Прибыль: {(parseInt(form.price) - parseInt(form.costPrice)).toLocaleString()} сум ({((parseInt(form.price) - parseInt(form.costPrice)) / parseInt(form.price) * 100).toFixed(0)}% маржа)
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Старая цена</label>
            <input style={inputStyle} type="number" value={form.oldPrice} onChange={e => setForm(f => ({ ...f, oldPrice: e.target.value }))} placeholder="20000" />
          </div>
          <div>
            {/* Единица стоит рядом с остатком не случайно: «100» на складе
                значит разное для лотков и килограммов, а на кассе от неё
                зависит шаг набора количества. */}
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>{t('Единица (цена за) *', 'Birlik (narx uchun) *')}</label>
            <select style={inputStyle} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {PRODUCT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>На складе *</label>
            <input style={inputStyle} type="number" step="0.1" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} placeholder="100" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Категория *</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
              <option value="">Выберите...</option>
              {allCategories.map(c => (
                <option key={c.id} value={c.id}>{lang === 'ru' ? (c.nameRu || c.nameUz) : c.nameUz}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Бренд</label>
            <input style={inputStyle} value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="Microgreen UZ" />
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Описание</label>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.descriptionUz}
            onChange={e => setForm(f => ({ ...f, descriptionUz: e.target.value }))} placeholder="Краткое описание..." />
        </div>

        {/* Image upload */}
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Фото</label>

          {/* Preview grid */}
          {images.length > 0 && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
              {images.map((url, idx) => (
                <div key={idx} style={{
                  position: 'relative', width: 72, height: 72, borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0,
                }}>
                  <img src={url} alt={`Rasm ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => removeImage(idx)} type="button"
                    style={{
                      position: 'absolute', top: 2, right: 2, width: 20, height: 20,
                      borderRadius: 'var(--radius-full)', background: 'var(--error)', color: 'white',
                      border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '12px', lineHeight: 1, padding: 0,
                    }}>
                    <XCircle size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: 'var(--space-3)', border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)',
            cursor: uploading ? 'wait' : 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-sm)',
            transition: 'all var(--transition-fast)', background: 'var(--bg-secondary)',
          }}>
            {uploading ? (
              <><Clock size={18} style={{ animation: 'pulse 1s infinite' }} /> Загрузка...</>
            ) : (
              <><Plus size={18} /> Добавить фото</>
            )}
            <input type="file" accept="image/*"
              style={{ display: 'none' }}
              disabled={uploading}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                  uploadImage(file);
                  e.target.value = '';
                }
              }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isFeatured} onChange={e => setForm(f => ({ ...f, isFeatured: e.target.checked }))} />
            Рекомендуемый
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isOnSale} onChange={e => setForm(f => ({ ...f, isOnSale: e.target.checked }))} />
            Скидка
          </label>
        </div>

        <button onClick={handleSubmit} disabled={saving} className="btn btn-primary btn-lg btn-block"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
          {saving ? <><Clock size={18} /> {t('Сохранение...', 'Saqlanmoqda...')}</> : <><CheckCircle size={18} /> {editingId ? t('СОХРАНИТЬ', 'SAQLASH') : t('ДОБАВИТЬ', "QO'SHISH")}</>}
        </button>
      </div>
    </div>
  );
}
