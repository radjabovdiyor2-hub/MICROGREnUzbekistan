'use client';

import { useEffect, useRef } from 'react';
import { token } from '@/lib/canvasTokens';

// Signature "Grow" motif: a generative field of microgreens.
// - grows on load (seed -> sprout, staggered left->right)
// - or grows tied to scroll position (scrollLinked)
// - stems sway and lean toward the pointer
// - theme-aware (reads brand accent from CSS vars); honours reduced-motion
// SSR-safe: renders an empty <canvas>, all drawing happens client-side.
// variant 'microgreens' = original sprout forest
// variant 'salad'       = floating lobed lettuce leaves
// variant 'mixed'       = sprouts + salad leaves + seeds (default for hero)

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sprout { x: number; h: number; delay: number; ph: number; amp: number; hue: number; gold: boolean; leaf: number; kind: 'sprout' | 'salad' | 'seed'; }

export function MicrogreensCanvas({
  count = 90,
  scrollLinked = false,
  staticAfterGrow = false,
  variant = 'microgreens',
  seed,
  className,
  style,
}: {
  count?: number;
  scrollLinked?: boolean;
  /** grow once then freeze (no sway/pointer) — use for many small cards */
  staticAfterGrow?: boolean;
  /** 'microgreens' = sprouts only | 'salad' = leaves only | 'mixed' = all types */
  variant?: 'microgreens' | 'salad' | 'mixed';
  seed?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const swayActive = !reduce && !staticAfterGrow;
    const rnd = mulberry32(seed ?? Math.floor(Math.random() * 1e9));

    let W = 0, H = 0, dpr = 1;
    let sprouts: Sprout[] = [];
    let growTarget = scrollLinked ? 0 : 1;
    let growCur = 0;
    let pointerX = 0.5;
    let raf = 0;
    const t0 = performance.now();

    const isDark = () => {
      const dt = document.documentElement.getAttribute('data-theme');
      if (dt) return dt.includes('dark');
      return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
    };
    let leafL = 42, stemL = 30, goldC = token('accent-gold-deep');
    const palette = () => {
      const dark = isDark();
      leafL = dark ? 58 : 42;
      stemL = dark ? 46 : 30;
      goldC = getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim() || goldC;
    };

    const build = () => {
      sprouts = [];
      for (let i = 0; i < count; i++) {
        const x = ((i + 0.5) / count) * W + (rnd() * 0.7 - 0.35) * (W / count);
        // Assign kind based on variant
        let kind: 'sprout' | 'salad' | 'seed';
        if (variant === 'microgreens') {
          kind = 'sprout';
        } else if (variant === 'salad') {
          const r = rnd();
          kind = r < 0.75 ? 'salad' : 'seed';
        } else { // mixed
          const r = rnd();
          kind = r < 0.60 ? 'sprout' : r < 0.90 ? 'salad' : 'seed';
        }
        sprouts.push({
          x,
          h: H * (0.28 + rnd() * 0.68),
          delay: (x / Math.max(W, 1)) * (scrollLinked ? 0 : 0.55) + rnd() * 0.12,
          ph: rnd() * 6.28,
          amp: 2 + rnd() * 6,
          // salad leaves use a slightly yellower-green hue
          hue: kind === 'salad' ? 100 + rnd() * 28 : 128 + rnd() * 34,
          gold: kind === 'sprout' && rnd() < 0.09,
          leaf: 5 + rnd() * 9,
          kind,
        });
      }
    };

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };

    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

    const onScroll = () => {
      if (!scrollLinked) return;
      const r = canvas.getBoundingClientRect();
      growTarget = clamp01((1 - r.top / window.innerHeight) * 1.1);
    };

    const drawMicroLeaf = (x: number, y: number, dir: number, ls: number, hue: number) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(dir);
      ctx.beginPath(); ctx.ellipse(0, -ls * 0.65, ls * 0.5, ls, 0, 0, 6.283);
      ctx.fillStyle = `hsl(${hue} 58% ${leafL}%)`; ctx.fill();
      ctx.restore();
    };

    // Lobed salad leaf grown from base
    const drawSaladLeaf = (topX: number, topY: number, ls: number, hue: number) => {
      const r = ls * 1.1;
      ctx.save();
      ctx.translate(topX, topY);
      ctx.fillStyle = `hsl(${hue} 62% ${leafL + 4}%)`;
      ctx.strokeStyle = `hsl(${hue} 45% ${leafL - 6}%)`;
      ctx.lineWidth = 0.9;
      // main oval body
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r, 0, 0, 6.283); ctx.fill(); ctx.stroke();
      // lobes around perimeter
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.82, r * 0.2, 0, 6.283);
        ctx.fillStyle = `hsl(${hue + 8} 58% ${leafL + 10}%)`;
        ctx.fill();
      }
      // mid-rib
      ctx.strokeStyle = `hsl(${hue} 40% ${leafL - 8}%)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, r * 0.9); ctx.bezierCurveTo(0, r * 0.3, 0, -r * 0.3, 0, -r * 0.9); ctx.stroke();
      ctx.restore();
    };

    // Tiny seed dot
    const drawSeedDot = (topX: number, topY: number, ls: number, hue: number) => {
      ctx.beginPath();
      ctx.ellipse(topX, topY, ls * 0.32, ls * 0.55, 0.3, 0, 6.283);
      ctx.fillStyle = `hsl(${hue + 18} 48% ${leafL + 8}%)`;
      ctx.fill();
    };

    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      growCur += (growTarget - growCur) * 0.07;
      ctx.clearRect(0, 0, W, H);
      const baseY = H + 2;
      for (const s of sprouts) {
        const g = scrollLinked ? clamp01(growCur) : ease(clamp01((t - s.delay) / 1.15));
        if (g <= 0.01) continue;
        const lean = swayActive ? (pointerX - s.x / Math.max(W, 1)) * 10 : 0;
        const sway = swayActive ? Math.sin(t * 0.8 + s.ph) * s.amp : 0;
        const topX = s.x + sway + lean;
        const topY = baseY - s.h * g;
        const ls = s.leaf * g;

        if (s.kind === 'sprout') {
          ctx.beginPath();
          ctx.moveTo(s.x, baseY);
          ctx.quadraticCurveTo((s.x + topX) / 2, baseY - s.h * g * 0.5, topX, topY);
          ctx.lineWidth = 1.5; ctx.strokeStyle = `hsl(${s.hue} 46% ${stemL}%)`; ctx.stroke();
          drawMicroLeaf(topX, topY, -0.55, ls, s.hue);
          drawMicroLeaf(topX, topY, 0.55, ls, s.hue);
          if (s.gold) { ctx.beginPath(); ctx.arc(topX, topY - ls * 0.7, 2.1 * g, 0, 6.283); ctx.fillStyle = goldC; ctx.fill(); }
        } else if (s.kind === 'salad') {
          // thin stem for salad
          ctx.beginPath();
          ctx.moveTo(s.x, baseY);
          ctx.quadraticCurveTo((s.x + topX) / 2, baseY - s.h * g * 0.5, topX, topY);
          ctx.lineWidth = 1.1; ctx.strokeStyle = `hsl(${s.hue} 40% ${stemL + 4}%)`; ctx.stroke();
          drawSaladLeaf(topX, topY, ls, s.hue);
        } else {
          // seed: just a short curved stem + dot
          ctx.beginPath();
          ctx.moveTo(s.x, baseY);
          ctx.quadraticCurveTo((s.x + topX) / 2, baseY - s.h * g * 0.5, topX, topY);
          ctx.lineWidth = 1.0; ctx.strokeStyle = `hsl(${s.hue} 38% ${stemL + 6}%)`; ctx.stroke();
          drawSeedDot(topX, topY, ls, s.hue);
        }
      }
      // once grown and not interactive, stop to save CPU (many cards on a page)
      const settled = scrollLinked ? Math.abs(growTarget - growCur) < 0.001 : t > 1.8;
      if (!swayActive && settled) return;
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => { pointerX = e.clientX / window.innerWidth; };

    palette();
    resize();
    onScroll();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    if (scrollLinked) window.addEventListener('scroll', onScroll, { passive: true });
    const themeObs = new MutationObserver(palette);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      themeObs.disconnect();
    };
  }, [count, scrollLinked, staticAfterGrow, seed]);

  return <canvas ref={ref} aria-hidden="true" className={className} style={style} />;
}

// Stable per-string seed (e.g. product id) so a card's greens don't reshuffle.
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
