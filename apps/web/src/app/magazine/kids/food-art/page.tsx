'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';

/* ─────────────────────────────────────────────
   Фуд-арт конструктор — FRESH WEEKLY
   Ребёнок собирает мордочку зверя из еды:
   перетаскивает ингредиенты на холст.
   ───────────────────────────────────────────── */

interface FoodItem {
  id: string;
  emoji: string;
  label: string;
  category: 'face' | 'eyes' | 'nose' | 'mouth' | 'hair' | 'decor';
}

const FOOD_ITEMS: FoodItem[] = [
  // Лица (основа)
  { id: 'apple', emoji: '🍎', label: 'Яблоко', category: 'face' },
  { id: 'orange', emoji: '🍊', label: 'Апельсин', category: 'face' },
  { id: 'bread', emoji: '🍞', label: 'Хлеб', category: 'face' },
  { id: 'pancake', emoji: '🥞', label: 'Блинчик', category: 'face' },
  { id: 'rice', emoji: '🍚', label: 'Рис', category: 'face' },
  // Глаза
  { id: 'blueberry', emoji: '🫐', label: 'Черника', category: 'eyes' },
  { id: 'olive', emoji: '🫒', label: 'Оливка', category: 'eyes' },
  { id: 'grape', emoji: '🍇', label: 'Виноград', category: 'eyes' },
  { id: 'egg', emoji: '🥚', label: 'Яйцо', category: 'eyes' },
  // Нос
  { id: 'strawberry', emoji: '🍓', label: 'Клубника', category: 'nose' },
  { id: 'cherry', emoji: '🍒', label: 'Вишня', category: 'nose' },
  { id: 'carrot', emoji: '🥕', label: 'Морковь', category: 'nose' },
  // Рот
  { id: 'banana', emoji: '🍌', label: 'Банан', category: 'mouth' },
  { id: 'pepper', emoji: '🌶️', label: 'Перчик', category: 'mouth' },
  { id: 'watermelon', emoji: '🍉', label: 'Арбуз', category: 'mouth' },
  // Волосы
  { id: 'microgreen', emoji: '🌿', label: 'Микрозелень', category: 'hair' },
  { id: 'broccoli', emoji: '🥦', label: 'Брокколи', category: 'hair' },
  { id: 'lettuce', emoji: '🥬', label: 'Салат', category: 'hair' },
  { id: 'herbs', emoji: '🌱', label: 'Ростки', category: 'hair' },
  // Декор
  { id: 'star', emoji: '⭐', label: 'Звёздочка', category: 'decor' },
  { id: 'heart', emoji: '❤️', label: 'Сердце', category: 'decor' },
  { id: 'sparkle', emoji: '✨', label: 'Блеск', category: 'decor' },
  { id: 'flower', emoji: '🌸', label: 'Цветок', category: 'decor' },
];

const CATEGORY_LABELS: Record<FoodItem['category'], string> = {
  face: '🍎 Лицо',
  eyes: '👀 Глаза',
  nose: '👃 Нос',
  mouth: '👄 Рот',
  hair: '🌿 Волосы',
  decor: '✨ Декор',
};

interface PlacedItem {
  foodId: string;
  x: number; // % от ширины
  y: number; // % от высоты
  scale: number;
  rotation: number;
}

const TEMPLATES = [
  { name: '🐱 Котик', items: [
    { foodId: 'pancake', x: 50, y: 50, scale: 1.8, rotation: 0 },
    { foodId: 'blueberry', x: 38, y: 42, scale: 1, rotation: 0 },
    { foodId: 'blueberry', x: 62, y: 42, scale: 1, rotation: 0 },
    { foodId: 'cherry', x: 50, y: 55, scale: 0.8, rotation: 0 },
    { foodId: 'banana', x: 50, y: 65, scale: 0.7, rotation: 0 },
    { foodId: 'microgreen', x: 50, y: 25, scale: 1.2, rotation: 0 },
  ]},
  { name: '🐻 Мишка', items: [
    { foodId: 'bread', x: 50, y: 50, scale: 1.8, rotation: 0 },
    { foodId: 'olive', x: 38, y: 45, scale: 1, rotation: 0 },
    { foodId: 'olive', x: 62, y: 45, scale: 1, rotation: 0 },
    { foodId: 'strawberry', x: 50, y: 58, scale: 0.9, rotation: 0 },
    { foodId: 'watermelon', x: 50, y: 68, scale: 0.7, rotation: 0 },
    { foodId: 'broccoli', x: 30, y: 28, scale: 1, rotation: -20 },
    { foodId: 'broccoli', x: 70, y: 28, scale: 1, rotation: 20 },
  ]},
];

export default function FoodArtPage() {
  const [placed, setPlaced] = useState<PlacedItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<FoodItem['category']>('face');
  const [dragging, setDragging] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const addItem = useCallback((foodId: string, x = 50, y = 50) => {
    setPlaced(prev => [...prev, { foodId, x, y, scale: 1, rotation: 0 }]);
  }, []);

  const loadTemplate = (templateIdx: number) => {
    setPlaced(TEMPLATES[templateIdx].items);
  };

  const removeItem = (idx: number) => {
    setPlaced(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCanvasDrop = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.changedTouches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.changedTouches[0].clientY : e.clientY;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    addItem(dragging, Math.max(5, Math.min(95, x)), Math.max(5, Math.min(95, y)));
    setDragging(null);
  };

  const scaleItem = (idx: number, delta: number) => {
    setPlaced(prev => prev.map((item, i) =>
      i === idx ? { ...item, scale: Math.max(0.3, Math.min(3, item.scale + delta)) } : item
    ));
  };

  const rotateItem = (idx: number) => {
    setPlaced(prev => prev.map((item, i) =>
      i === idx ? { ...item, rotation: (item.rotation + 45) % 360 } : item
    ));
  };

  const categories = Object.keys(CATEGORY_LABELS) as FoodItem['category'][];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)', padding: '90px 20px 80px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <Link href="/magazine/kids" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 }}>← Fresh Kids</Link>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 6vw, 42px)', fontWeight: 900, color: 'var(--text-primary)', margin: '16px 0 8px' }}>🎨 Фуд-арт конструктор</h1>
        <p style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
          Собери мордочку зверя из еды! Нажимай на ингредиенты — они появятся на холсте. Нажми на предмет на холсте чтобы управлять им.
        </p>

        {/* Шаблоны */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-muted, #999)', alignSelf: 'center' }}>Шаблоны:</span>
          {TEMPLATES.map((t, i) => (
            <button key={t.name} onClick={() => loadTemplate(i)} style={{
              padding: '6px 14px', borderRadius: 16, border: '1px solid var(--border, #333)',
              background: 'var(--bg-elevated, rgba(255,255,255,0.05))',
              color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif",
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>{t.name}</button>
          ))}
          <button onClick={() => setPlaced([])} style={{
            padding: '6px 14px', borderRadius: 16, border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>🗑 Очистить</button>
        </div>

        {/* Холст */}
        <div
          ref={canvasRef}
          onClick={handleCanvasDrop}
          onTouchEnd={handleCanvasDrop}
          style={{
            position: 'relative', width: '100%', aspectRatio: '1',
            borderRadius: 24,
            background: 'var(--bg-elevated, #1a1a2e)',
            border: dragging ? '3px dashed var(--brand-primary, #4ade80)' : '2px solid var(--border, #333)',
            overflow: 'hidden',
            cursor: dragging ? 'crosshair' : 'default',
            transition: 'border 0.2s',
          }}
        >
          {/* Фоновая сетка */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }} />

          {placed.length === 0 && !dragging && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 8,
            }}>
              <span style={{ fontSize: 48, opacity: 0.3 }}>🎨</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--text-muted, #666)' }}>
                Выбери ингредиент ниже
              </span>
            </div>
          )}

          {placed.map((item, idx) => {
            const food = FOOD_ITEMS.find(f => f.id === item.foodId);
            if (!food) return null;
            return (
              <div
                key={`${item.foodId}-${idx}`}
                style={{
                  position: 'absolute',
                  left: `${item.x}%`, top: `${item.y}%`,
                  transform: `translate(-50%, -50%) scale(${item.scale}) rotate(${item.rotation}deg)`,
                  fontSize: 40, cursor: 'pointer',
                  transition: 'transform 0.15s',
                  userSelect: 'none',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                }}
                onClick={e => { e.stopPropagation(); }}
              >
                <span>{food.emoji}</span>
                {/* Мини-контролы */}
                <div style={{
                  position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', gap: 2, opacity: 0.7,
                }}
                onClick={e => e.stopPropagation()}
                >
                  <button onClick={() => scaleItem(idx, 0.2)} style={miniBtn}>+</button>
                  <button onClick={() => scaleItem(idx, -0.2)} style={miniBtn}>−</button>
                  <button onClick={() => rotateItem(idx)} style={miniBtn}>↻</button>
                  <button onClick={() => removeItem(idx)} style={{ ...miniBtn, color: '#ef4444' }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Категории */}
        <div style={{
          display: 'flex', gap: 6, marginTop: 16, overflowX: 'auto',
          scrollbarWidth: 'none', padding: '2px 0',
        }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} style={{
              padding: '6px 12px', borderRadius: 14, whiteSpace: 'nowrap',
              border: activeCategory === cat ? '1px solid var(--brand-primary, #4ade80)' : '1px solid var(--border, #333)',
              background: activeCategory === cat ? 'rgba(74,222,128,0.1)' : 'transparent',
              color: activeCategory === cat ? 'var(--brand-primary, #4ade80)' : 'var(--text-secondary)',
              fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>{CATEGORY_LABELS[cat]}</button>
          ))}
        </div>

        {/* Ингредиенты */}
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12,
          padding: 16, borderRadius: 16,
          background: 'var(--bg-elevated, rgba(255,255,255,0.03))',
          border: '1px solid var(--border, #333)',
        }}>
          {FOOD_ITEMS.filter(f => f.category === activeCategory).map(food => (
            <button
              key={food.id}
              onClick={() => addItem(food.id)}
              onMouseDown={() => setDragging(food.id)}
              onTouchStart={() => setDragging(food.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '10px 12px', borderRadius: 14,
                border: '1px solid var(--border, #333)',
                background: dragging === food.id ? 'rgba(74,222,128,0.15)' : 'transparent',
                cursor: 'grab', minWidth: 64,
              }}
            >
              <span style={{ fontSize: 30 }}>{food.emoji}</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: 'var(--text-muted, #999)' }}>{food.label}</span>
            </button>
          ))}
        </div>

        {/* Сохранить */}
        {placed.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Link href="/magazine/kids" style={{ ...actionBtn, textDecoration: 'none' }}>
              ← Fresh Kids
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  width: 20, height: 20, borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(0,0,0,0.6)', color: '#fff',
  fontSize: 11, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0,
};

const actionBtn: React.CSSProperties = {
  background: 'var(--brand-primary, #3a7a32)', color: '#fff',
  border: 'none', borderRadius: 30, padding: '12px 24px',
  fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700,
  cursor: 'pointer',
};
