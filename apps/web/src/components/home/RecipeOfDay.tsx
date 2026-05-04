'use client';

import { useState, useEffect } from 'react';
import * as Icons from '@/components/ui/Icons';
import { useLang } from '@/components/providers/LangProvider';

const CATEGORY_ICONS: Record<string, { label: string; colorFrom: string; colorTo: string }> = {
  breakfast: { label: 'B', colorFrom: '#F59E0B', colorTo: '#F97316' },
  salad: { label: 'S', colorFrom: '#10B981', colorTo: '#059669' },
  smoothie: { label: 'D', colorFrom: '#8B5CF6', colorTo: '#6366F1' },
  snack: { label: 'N', colorFrom: '#EC4899', colorTo: '#F43F5E' },
  main: { label: 'M', colorFrom: '#3B82F6', colorTo: '#2563EB' },
};

interface Recipe {
  nameUz: string; nameRu: string; microgreens: string[];
  prepTime: number; servings: number; calories: number; protein: number;
  ingredientsUz: string[]; ingredientsRu: string[];
  stepsUz: string[]; stepsRu: string[];
  tipUz: string; tipRu: string; category: string;
  nutrition: { vitC: number; vitA: number; vitK: number; iron: number; calcium: number };
}

export function RecipeOfDay() {
  const { t, lang } = useLang();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ai/nutrition?type=recipe')
      .then(r => r.json())
      .then(d => { setRecipe(d.recipe); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <section className="section"><div className="container">
      <div style={{ height: 200, borderRadius: 24, background: 'var(--bg-card)', animation: 'pulse 1.5s infinite' }} />
    </div></section>
  );
  if (!recipe) return null;

  const cat = CATEGORY_ICONS[recipe.category] || CATEGORY_ICONS.salad;
  const name = lang === 'ru' ? recipe.nameRu : recipe.nameUz;
  const ingredients = lang === 'ru' ? recipe.ingredientsRu : recipe.ingredientsUz;
  const steps = lang === 'ru' ? recipe.stepsRu : recipe.stepsUz;
  const tip = lang === 'ru' ? recipe.tipRu : recipe.tipUz;

  return (
    <section className="section" id="recipe-section">
      <div className="container">
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${cat.colorFrom}, ${cat.colorTo})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 12px ${cat.colorFrom}40`, color: 'white',
          }}><Icons.Leaf size={18} /></div>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
              {t("Bugungi retsept", "Рецепт дня")}
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {t("Har kuni yangi — mikroko'katlar bilan", "Каждый день новый — с микрозеленью")}
            </p>
          </div>
        </div>

        {/* Recipe card */}
        <div style={{
          background: 'var(--bg-card)', borderRadius: 20,
          border: '1.5px solid var(--border)', overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          transition: 'all 0.3s ease',
        }}>
          {/* Gradient header */}
          <div style={{
            background: `linear-gradient(135deg, ${cat.colorFrom}, ${cat.colorTo})`,
            padding: '20px 24px', color: 'white', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -30, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 800, fontFamily: 'var(--font-display)', marginBottom: 8, position: 'relative', zIndex: 1 }}>
              {name}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, opacity: 0.9, position: 'relative', zIndex: 1 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icons.Clock size={13} /> {recipe.prepTime} {t('min', 'мин')}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icons.Users size={13} /> {recipe.servings} {t('kishi', 'порц.')}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icons.Zap size={13} /> {recipe.calories} kcal
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {recipe.protein}g {t('oqsil', 'белок')}
              </span>
            </div>
          </div>

          {/* Micronutrient highlights */}
          <div style={{ display: 'flex', gap: 8, padding: '14px 20px', overflowX: 'auto', borderBottom: '1px solid var(--border)' }}>
            {[
              { label: 'Vit C', value: `${recipe.nutrition.vitC.toFixed(0)}mg`, color: '#F59E0B' },
              { label: 'Vit A', value: `${recipe.nutrition.vitA.toFixed(0)}µg`, color: '#10B981' },
              { label: 'Vit K', value: `${recipe.nutrition.vitK.toFixed(0)}µg`, color: '#8B5CF6' },
              { label: 'Fe', value: `${recipe.nutrition.iron.toFixed(1)}mg`, color: '#EF4444' },
              { label: 'Ca', value: `${recipe.nutrition.calcium.toFixed(0)}mg`, color: '#3B82F6' },
            ].map((n, i) => (
              <div key={i} style={{
                padding: '6px 12px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                background: `${n.color}12`, color: n.color, whiteSpace: 'nowrap',
                border: `1px solid ${n.color}20`,
              }}>
                {n.label}: {n.value}
              </div>
            ))}
          </div>

          {/* Toggle details */}
          <button onClick={() => setExpanded(!expanded)} style={{
            width: '100%', padding: '14px 24px', background: 'none', border: 'none',
            cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 700,
          }}>
            {expanded ? t('Yopish', 'Свернуть') : t("Retseptni ko'rish", 'Показать рецепт')}
            <Icons.ChevronRight size={16} style={{
              transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
              transition: 'transform 0.2s',
            }} />
          </button>

          {/* Expanded content */}
          {expanded && (
            <div style={{ padding: '0 24px 24px', animation: 'reveal-up 0.3s ease' }}>
              {/* Ingredients */}
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)' }}>
                  {t('Ingredientlar', 'Ингредиенты')}
                </h4>
                {ingredients.map((ing, i) => (
                  <div key={i} style={{
                    padding: '8px 0', borderBottom: i < ingredients.length - 1 ? '1px solid var(--border)' : 'none',
                    fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: cat.colorFrom, flexShrink: 0 }} />
                    {ing}
                  </div>
                ))}
              </div>

              {/* Steps */}
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)' }}>
                  {t('Tayyorlash', 'Приготовление')}
                </h4>
                {steps.map((step, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 12, marginBottom: 10, fontSize: 13, lineHeight: 1.5,
                  }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: `linear-gradient(135deg, ${cat.colorFrom}, ${cat.colorTo})`,
                      color: 'white', fontSize: 11, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{i + 1}</div>
                    <span style={{ paddingTop: 2 }}>{step}</span>
                  </div>
                ))}
              </div>

              {/* Pro tip */}
              <div style={{
                padding: '12px 16px', borderRadius: 12,
                background: `${cat.colorFrom}10`, border: `1px solid ${cat.colorFrom}20`,
                fontSize: 12, fontWeight: 600, color: cat.colorFrom,
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <Icons.Lightbulb size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                {tip}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
