'use client';

import { CheckCircle, Leaf, Lightbulb, Plus, X, Zap } from 'lucide-react';
import {
  DvBar, inputStyle, type NutrientDetail, type NutrientResult,
} from './nutritionistTypes';

// Калькулятор порции: выбор культур, граммовка и разбор по нутриентам.
// Вынесен из NutritionistPanel — это вся содержательная часть блока,
// сам компонент остался обёрткой с заголовком.

interface CropItem {
  crop: string;
  grams: number;
}

interface Props {
  crops: { key: string; nameRu: string; nameUz: string }[];
  items: CropItem[];
  addItem: () => void;
  updateItem: (idx: number, field: 'crop' | 'grams', value: string) => void;
  removeItem: (index: number) => void;
  calculate: () => void;
  loading: boolean;
  result: NutrientResult | null;
  lang: 'ru' | 'uz';
  t: (ru: string, uz: string) => string;
}

export function NutritionistCalculator({
  crops, items, addItem, updateItem, removeItem, calculate, loading, result, lang, t,
}: Props) {
  return (
    <>
  {/* Calculator card */}
  <div style={{
    background: 'var(--bg-card)', borderRadius: 20,
    border: '1.5px solid var(--border)', overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(var(--overlay-dark-rgb), 0.06)',
  }}>
    {/* Input section */}
    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, fontWeight: 600 }}>
        {t("Qaysi mikroko'katlarni iste'mol qilasiz?", "Какую микрозелень вы едите?")}
      </p>

      {items.map((item, idx) => (
        <div key={idx} style={{
          display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center',
          animation: 'reveal-up 0.2s ease',
        }}>
          <select value={item.crop} onChange={e => updateItem(idx, 'crop', e.target.value)}
            style={{ ...inputStyle, flex: 2 }}>
            {crops.map(c => (
              <option key={c.key} value={c.key}>{lang === 'ru' ? c.nameRu : c.nameUz}</option>
            ))}
          </select>
          <div style={{ position: 'relative', flex: 1 }}>
            <input type="number" min="1" max="500" value={item.grams}
              onChange={e => updateItem(idx, 'grams', e.target.value)}
              style={{ ...inputStyle, paddingRight: 26 }} />
            <span style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
            }}>g</span>
          </div>
          {items.length > 1 && (
            <button onClick={() => removeItem(idx)} style={{
              background: 'none', border: 'none', color: 'var(--error)',
              cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0,
            }}>
              <X size={18} />
            </button>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={addItem} style={{
          flex: 1, padding: 10, borderRadius: 12, fontSize: 12, fontWeight: 700,
          background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
          border: '1.5px dashed var(--border)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          transition: 'all 0.2s',
        }}>
          <Plus size={14} /> {t("Qo'shish", "Добавить")}
        </button>
        <button onClick={calculate} disabled={loading} style={{
          flex: 2, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: 700,
          background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-hover))', color: 'white',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 6, opacity: loading ? 0.6 : 1,
          boxShadow: '0 4px 12px rgba(var(--brand-primary-rgb), 0.3)', transition: 'all 0.2s',
        }}>
          <Zap size={14} /> {loading ? '...' : t('Hisoblash', 'Рассчитать')}
        </button>
      </div>
    </div>

    {/* Results */}
    {result && (
      <div style={{ padding: '20px 24px', animation: 'reveal-up 0.3s ease' }}>
        {/* Macro summary */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          marginBottom: 20,
        }}>
          {[
            { label: t('Kaloriya', 'Калории'), value: `${result.total.calories.toFixed(0)}`, unit: 'kcal', color: 'var(--warning)' },
            { label: t('Oqsil', 'Белок'), value: `${result.total.protein.toFixed(1)}`, unit: 'g', color: 'var(--info)' },
            { label: t("Yog'", 'Жиры'), value: `${result.total.fat.toFixed(1)}`, unit: 'g', color: 'var(--cat-3)' },
            { label: t("Uglevod", 'Углеводы'), value: `${result.total.carbs.toFixed(1)}`, unit: 'g', color: 'var(--cat-2)' },
          ].map((m, i) => (
            <div key={i} style={{
              textAlign: 'center', padding: '14px 8px', borderRadius: 14,
              background: `${m.color}08`, border: `1.5px solid ${m.color}18`,
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: m.color, fontFamily: 'var(--font-display)' }}>
                {m.value}
              </div>
              <div style={{ fontSize: 9, color: m.color, fontWeight: 700, opacity: 0.7 }}>{m.unit}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* Daily Value bars */}
        <div style={{ marginBottom: 18 }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10 }}>
            {t("Kunlik me'yor % (RDI)", "% дневной нормы (RDI)")}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <DvBar label="Vit C" percent={result.dailyValuePercent.vitC} color="var(--warning)" />
            <DvBar label="Vit A" percent={result.dailyValuePercent.vitA} color="var(--brand-primary)" />
            <DvBar label="Vit K" percent={result.dailyValuePercent.vitK} color="var(--cat-2)" />
            <DvBar label="Fe" percent={result.dailyValuePercent.iron} color="var(--error)" />
            <DvBar label="Ca" percent={result.dailyValuePercent.calcium} color="var(--info)" />
            <DvBar label="K" percent={result.dailyValuePercent.potassium} color="var(--brand-primary-hover)" />
          </div>
        </div>

        {/* Benefits from each crop */}
        {result.details.map((d: NutrientDetail, i: number) => (
          <div key={i} style={{
            padding: '10px 14px', borderRadius: 12, marginBottom: 8,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Leaf size={13} color="var(--brand-primary)" />
              {lang === 'ru' ? d.nameRu : d.nameUz} ({d.grams}g)
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--brand-primary)', fontWeight: 800, background: 'var(--brand-primary-light)', padding: '2px 8px', borderRadius: 6 }}>
                ×{d.antioxidantMultiplier} {t("antioksidant", "антиоксид.")}
              </span>
            </div>
            {d.benefits?.map((b: { uz: string; ru: string }, j: number) => (
              <div key={j} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <CheckCircle size={11} color="var(--success)" /> {lang === 'ru' ? b.ru : b.uz}
              </div>
            ))}
          </div>
        ))}

        {/* Fiber bonus */}
        <div style={{
          padding: '10px 14px', borderRadius: 12, marginTop: 12,
          background: 'var(--brand-primary)10', border: '1px solid var(--brand-primary)20',
          fontSize: 12, color: 'var(--brand-primary-hover)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Lightbulb size={15} style={{ flexShrink: 0 }} />
          {t(
            `Jami ${result.total.fiber.toFixed(1)}g tolalar — kunlik me'yorning ${((result.total.fiber / 25) * 100).toFixed(0)}%`,
            `Всего ${result.total.fiber.toFixed(1)}г клетчатки — ${((result.total.fiber / 25) * 100).toFixed(0)}% дневной нормы`
          )}
        </div>
      </div>
    )}
  </div>
    </>
  );
}
