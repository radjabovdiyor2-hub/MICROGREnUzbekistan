'use client';

import { NutritionistCalculator } from './NutritionistCalculator';

import { useState, useEffect, useCallback } from 'react';
import { Heart } from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { triggerHaptic } from '@/utils/haptic';

interface CropInfo { key: string; nameUz: string; nameRu: string; }
import { type NutrientDetail, type NutrientResult, inputStyle, DvBar } from './nutritionistTypes';
export type { NutrientDetail, NutrientResult };
export { inputStyle, DvBar };

export function NutritionistPanel() {
  const { t, lang } = useLang();
  const [crops, setCrops] = useState<CropInfo[]>([]);
  const [items, setItems] = useState<{ crop: string; grams: number }[]>([{ crop: 'rukkola', grams: 30 }]);
  const [result, setResult] = useState<NutrientResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/ai/nutrition?type=crops')
      .then(r => r.json())
      .then(d => setCrops(d.crops?.map((c: CropInfo) => ({ key: c.key, nameUz: c.nameUz, nameRu: c.nameRu })) || []))
      .catch(() => {});
  }, []);

  const addItem = () => {
    triggerHaptic('light');
    setItems(prev => [...prev, { crop: 'brokkoli', grams: 20 }]);
  };

  const removeItem = (idx: number) => {
    triggerHaptic('light');
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: 'crop' | 'grams', value: string) => {
    setItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, [field]: field === 'grams' ? parseInt(value) || 0 : value } : it
    ));
  };

  const calculate = useCallback(async () => {
    if (items.length === 0 || items.some(i => !i.grams)) return;
    triggerHaptic('success');
    setLoading(true);
    try {
      const res = await fetch('/api/ai/nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      setResult(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [items]);

  return (
    <section className="section" id="nutritionist-section">
      <div className="container">
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-hover))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-inverse)', boxShadow: '0 4px 12px rgba(var(--brand-primary-rgb), 0.3)',
          }}>
            <Heart size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
              {t("AI Nutritsiolog", "AI Нутрициолог")}
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {t("Aniq vitaminlar va minerallar hisobi", "Точный расчёт витаминов и минералов")}
            </p>
          </div>
        </div>

      <NutritionistCalculator
        crops={crops}
        items={items}
        addItem={addItem}
        updateItem={updateItem}
        removeItem={removeItem}
        calculate={calculate}
        loading={loading}
        result={result}
        lang={lang}
        t={t}
      />
      </div>
    </section>
  );
}
