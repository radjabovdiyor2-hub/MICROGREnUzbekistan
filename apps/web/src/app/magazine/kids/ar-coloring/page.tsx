'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';

/* ─────────────────────────────────────────────
   AR-раскраска — FRESH WEEKLY
   Ребёнок раскрашивает персонажа на Canvas,
   затем может отсканировать раскраску камерой
   и увидеть её «ожившей» в AR.
   ───────────────────────────────────────────── */

const COLORING_TEMPLATES = [
  {
    id: 'tomi',
    name: 'Томи',
    emoji: '🍅',
    outlineColor: '#333',
    paths: [
      // Круглое тело
      { type: 'circle' as const, cx: 200, cy: 220, r: 120, fill: 'transparent' },
      // Глаза
      { type: 'circle' as const, cx: 170, cy: 195, r: 18, fill: 'transparent' },
      { type: 'circle' as const, cx: 230, cy: 195, r: 18, fill: 'transparent' },
      // Зрачки
      { type: 'circle' as const, cx: 170, cy: 195, r: 8, fill: '#222' },
      { type: 'circle' as const, cx: 230, cy: 195, r: 8, fill: '#222' },
      // Рот
      { type: 'arc' as const, cx: 200, cy: 250, r: 30, startAngle: 0, endAngle: Math.PI, fill: 'transparent' },
      // Листик сверху
      { type: 'leaf' as const, cx: 200, cy: 95, size: 40, fill: 'transparent' },
      // Щёчки
      { type: 'circle' as const, cx: 145, cy: 235, r: 15, fill: 'rgba(255,180,180,0.3)' },
      { type: 'circle' as const, cx: 255, cy: 235, r: 15, fill: 'rgba(255,180,180,0.3)' },
    ],
  },
  {
    id: 'brok',
    name: 'Брок',
    emoji: '🥦',
    outlineColor: '#333',
    paths: [
      // Тело-стебель
      { type: 'rect' as const, x: 175, y: 250, w: 50, h: 100, fill: 'transparent' },
      // Крона (3 круга)
      { type: 'circle' as const, cx: 200, cy: 180, r: 60, fill: 'transparent' },
      { type: 'circle' as const, cx: 160, cy: 210, r: 45, fill: 'transparent' },
      { type: 'circle' as const, cx: 240, cy: 210, r: 45, fill: 'transparent' },
      // Глаза
      { type: 'circle' as const, cx: 180, cy: 185, r: 12, fill: 'transparent' },
      { type: 'circle' as const, cx: 220, cy: 185, r: 12, fill: 'transparent' },
      { type: 'circle' as const, cx: 180, cy: 185, r: 5, fill: '#222' },
      { type: 'circle' as const, cx: 220, cy: 185, r: 5, fill: '#222' },
      // Рот
      { type: 'arc' as const, cx: 200, cy: 210, r: 15, startAngle: 0, endAngle: Math.PI, fill: 'transparent' },
    ],
  },
  {
    id: 'yagodka',
    name: 'Ягодка',
    emoji: '🍓',
    outlineColor: '#333',
    paths: [
      // Тело-капля
      { type: 'circle' as const, cx: 200, cy: 230, r: 100, fill: 'transparent' },
      // Листья сверху
      { type: 'leaf' as const, cx: 170, cy: 130, size: 30, fill: 'transparent' },
      { type: 'leaf' as const, cx: 200, cy: 120, size: 35, fill: 'transparent' },
      { type: 'leaf' as const, cx: 230, cy: 130, size: 30, fill: 'transparent' },
      // Семечки (точки)
      { type: 'circle' as const, cx: 175, cy: 220, r: 5, fill: 'transparent' },
      { type: 'circle' as const, cx: 200, cy: 200, r: 5, fill: 'transparent' },
      { type: 'circle' as const, cx: 225, cy: 220, r: 5, fill: 'transparent' },
      { type: 'circle' as const, cx: 185, cy: 260, r: 5, fill: 'transparent' },
      { type: 'circle' as const, cx: 215, cy: 260, r: 5, fill: 'transparent' },
      // Глаза
      { type: 'circle' as const, cx: 180, cy: 210, r: 14, fill: 'transparent' },
      { type: 'circle' as const, cx: 220, cy: 210, r: 14, fill: 'transparent' },
      { type: 'circle' as const, cx: 180, cy: 210, r: 6, fill: '#222' },
      { type: 'circle' as const, cx: 220, cy: 210, r: 6, fill: '#222' },
      // Рот
      { type: 'arc' as const, cx: 200, cy: 245, r: 18, startAngle: 0, endAngle: Math.PI, fill: 'transparent' },
    ],
  },
];

const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e', '#78716c', '#ffffff',
  '#fbbf24', '#a3e635', '#2dd4bf', '#818cf8',
];

const BRUSH_SIZES = [4, 8, 14, 22, 32];

export default function ARColoringPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [color, setColor] = useState('#ef4444');
  const [brushSize, setBrushSize] = useState(14);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEraser, setIsEraser] = useState(false);

  const template = COLORING_TEMPLATES[selectedTemplate];

  // Перерисовать контур
  const drawOutline = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    template.paths.forEach(path => {
      ctx.strokeStyle = template.outlineColor;
      ctx.lineWidth = 2.5;

      if (path.type === 'circle') {
        ctx.beginPath();
        ctx.arc(path.cx, path.cy, path.r, 0, Math.PI * 2);
        if (path.fill !== 'transparent') {
          ctx.fillStyle = path.fill;
          ctx.fill();
        }
        ctx.stroke();
      } else if (path.type === 'rect') {
        ctx.strokeRect(path.x!, path.y!, path.w!, path.h!);
      } else if (path.type === 'arc') {
        ctx.beginPath();
        ctx.arc(path.cx, path.cy, path.r, path.startAngle!, path.endAngle!, false);
        ctx.stroke();
      } else if (path.type === 'leaf') {
        const { cx, cy, size } = path;
        ctx.beginPath();
        ctx.moveTo(cx, cy - size);
        ctx.quadraticCurveTo(cx + size, cy, cx, cy + size * 0.5);
        ctx.quadraticCurveTo(cx - size, cy, cx, cy - size);
        ctx.stroke();
      }
    });
  }, [template]);

  // Инициализация холста при смене шаблона
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 400, 400);
    drawOutline();
  }, [drawOutline]);

  // При смене шаблона — перерисовка
  useState(() => {
    setTimeout(initCanvas, 100);
  });

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = 400 / rect.width;
    const scaleY = 400 / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const { x, y } = getCoords(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoords(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.strokeStyle = isEraser ? '#ffffff' : color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = isEraser ? 'source-over' : 'source-over';
    ctx.stroke();
  };

  const endDraw = () => {
    setIsDrawing(false);
    // Перерисовать контур поверх
    drawOutline();
  };

  const clearCanvas = () => {
    initCanvas();
  };

  const saveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `fresh-weekly-${template.id}-coloring.png`;
    link.href = canvas.toDataURL();
    link.click();
    // Печать в паспорт
    try {
      const passport = JSON.parse(localStorage.getItem('fw_passport_v2') || '{}');
      if (!passport.achievements?.includes('ar_coloring')) {
        passport.achievements = [...(passport.achievements || []), 'ar_coloring'];
        localStorage.setItem('fw_passport_v2', JSON.stringify(passport));
      }
    } catch { /* ok */ }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)', padding: '90px 20px 80px' }}>
      <div style={{ maxWidth: 500, margin: '0 auto' }}>
        <Link href="/magazine/kids" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 }}>← Fresh Kids</Link>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 6vw, 42px)', fontWeight: 900, color: 'var(--text-primary)', margin: '16px 0 8px' }}>🎨 AR-раскраска</h1>
        <p style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
          Раскрась Агро Друга! Рисуй пальцем прямо на экране. Сохрани рисунок и сканируй его в AR — персонаж оживёт!
        </p>

        {/* Выбор персонажа */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {COLORING_TEMPLATES.map((t, idx) => (
            <button key={t.id} onClick={() => { setSelectedTemplate(idx); setTimeout(initCanvas, 50); }} style={{
              flex: 1, padding: '10px', borderRadius: 14, textAlign: 'center',
              border: selectedTemplate === idx ? '2px solid var(--brand-primary, #4ade80)' : '1px solid var(--border, #333)',
              background: selectedTemplate === idx ? 'rgba(74,222,128,0.1)' : 'transparent',
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: 28 }}>{t.emoji}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{t.name}</div>
            </button>
          ))}
        </div>

        {/* Холст */}
        <div style={{
          borderRadius: 20, overflow: 'hidden',
          border: '2px solid var(--border, #333)',
          boxShadow: 'var(--shadow-md, 0 4px 20px rgba(0,0,0,0.2))',
          touchAction: 'none',
        }}>
          <canvas
            ref={canvasRef}
            width={400}
            height={400}
            style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>

        {/* Размер кисти */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 14,
          padding: '8px 12px', borderRadius: 14,
          background: 'var(--bg-elevated, rgba(255,255,255,0.03))',
          border: '1px solid var(--border, #333)',
        }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--text-muted, #999)', whiteSpace: 'nowrap' }}>Кисть:</span>
          {BRUSH_SIZES.map(size => (
            <button key={size} onClick={() => { setBrushSize(size); setIsEraser(false); }} style={{
              width: 32, height: 32, borderRadius: '50%',
              border: brushSize === size && !isEraser ? '2px solid var(--brand-primary, #4ade80)' : '1px solid var(--border, #333)',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: Math.min(size, 20), height: Math.min(size, 20), borderRadius: '50%',
                background: color,
              }} />
            </button>
          ))}
          <button onClick={() => setIsEraser(!isEraser)} style={{
            padding: '6px 12px', borderRadius: 10,
            border: isEraser ? '2px solid #f59e0b' : '1px solid var(--border, #333)',
            background: isEraser ? 'rgba(245,158,11,0.1)' : 'transparent',
            color: isEraser ? '#f59e0b' : 'var(--text-secondary)',
            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>🧽</button>
        </div>

        {/* Палитра */}
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10,
          padding: '10px 12px', borderRadius: 14,
          background: 'var(--bg-elevated, rgba(255,255,255,0.03))',
          border: '1px solid var(--border, #333)',
        }}>
          {COLORS.map(c => (
            <button key={c} onClick={() => { setColor(c); setIsEraser(false); }} style={{
              width: 30, height: 30, borderRadius: '50%',
              background: c,
              border: color === c && !isEraser ? '3px solid var(--text-primary, #fff)' : '2px solid rgba(255,255,255,0.1)',
              cursor: 'pointer', boxShadow: color === c ? '0 0 8px rgba(255,255,255,0.3)' : 'none',
              transition: 'all 0.15s',
            }} />
          ))}
        </div>

        {/* Кнопки */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button onClick={saveImage} style={actionBtn}>💾 Сохранить</button>
          <button onClick={clearCanvas} style={{
            ...actionBtn, background: 'transparent',
            border: '1px solid var(--border, #ccc)', color: 'var(--text-primary)',
          }}>🔄 Очистить</button>
          <Link href="/magazine/ar" style={{
            ...actionBtn, background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
          }}>📸 Открыть в AR</Link>
        </div>

        {/* Инструкция */}
        <div style={{
          marginTop: 20, padding: '14px 18px', borderRadius: 16,
          background: 'rgba(124,58,237,0.06)',
          border: '1px solid rgba(124,58,237,0.15)',
        }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: '#a78bfa' }}>Как оживить раскраску:</strong><br />
            1. Раскрась персонажа 🎨<br />
            2. Сохрани рисунок 💾<br />
            3. Распечатай на бумаге 🖨<br />
            4. Открой AR-сканер и наведи камеру на рисунок 📸
          </div>
        </div>
      </div>
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  padding: '12px 22px', borderRadius: 30, border: 'none',
  background: 'var(--brand-primary, #3a7a32)', color: '#fff',
  fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700,
  cursor: 'pointer',
};
