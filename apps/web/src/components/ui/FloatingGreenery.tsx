'use client';

import { useEffect, useRef } from 'react';

/**
 * FloatingGreenery — ambient canvas of floating microgreen sprouts and
 * salad leaves drifting across the background. Pure CSS-var-aware.
 * Designed to sit behind content as a fixed/absolute background layer.
 */

interface Particle {
  x: number; y: number; vx: number; vy: number;
  rot: number; vrot: number; scale: number; opacity: number;
  type: 'sprout' | 'leaf' | 'round' | 'seed';
  hue: number; phase: number; wobble: number;
}

export function FloatingGreenery({
  count = 18, className, style,
}: { count?: number; className?: string; style?: React.CSSProperties; }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    let W = 0, H = 0, dpr = 1, raf = 0;
    const particles: Particle[] = [];
    const t0 = performance.now();

    const isDark = () => {
      const dt = document.documentElement.getAttribute('data-theme');
      if (dt) return dt.includes('dark');
      return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
    };

    const spawn = (x?: number, y?: number): Particle => ({
      x: x ?? Math.random() * W, y: y ?? Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: -0.15 - Math.random() * 0.25,
      rot: Math.random() * Math.PI * 2, vrot: (Math.random() - 0.5) * 0.012,
      scale: 0.55 + Math.random() * 0.8, opacity: 0.07 + Math.random() * 0.09,
      type: (['sprout','leaf','round','seed'] as const)[Math.floor(Math.random() * 4)],
      hue: 118 + Math.floor(Math.random() * 42), phase: Math.random() * Math.PI * 2,
      wobble: 0.3 + Math.random() * 0.7,
    });

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles.length = 0;
      for (let i = 0; i < count; i++) particles.push(spawn());
    };

    const drawSprout = (dark: boolean, hue: number, a: number, s: number) => {
      const sh = 18 * s, lw = 7 * s, lh = 10 * s, L = dark ? 58 : 38;
      ctx.strokeStyle = `hsla(${hue},55%,${L}%,${a})`; ctx.lineWidth = 1.5 * s;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -sh); ctx.stroke();
      ctx.fillStyle = `hsla(${hue},60%,${L + 6}%,${a})`;
      ctx.beginPath(); ctx.ellipse(-lw * 0.8, -sh * 0.65, lw * 0.5, lh * 0.55, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse( lw * 0.8, -sh * 0.65, lw * 0.5, lh * 0.55,  0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `hsla(${hue + 20},70%,${L + 10}%,${a})`;
      ctx.beginPath(); ctx.arc(0, -sh, 2 * s, 0, Math.PI * 2); ctx.fill();
    };

    const drawLeaf = (dark: boolean, hue: number, a: number, s: number) => {
      const r = 14 * s, L = dark ? 52 : 40;
      ctx.fillStyle = `hsla(${hue},65%,${L}%,${a * 0.9})`;
      ctx.strokeStyle = `hsla(${hue},55%,${L - 8}%,${a * 0.6})`; ctx.lineWidth = 0.8 * s;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.65, r, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(Math.cos(ang) * r * 0.58, Math.sin(ang) * r * 0.78, r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue + 10},60%,${L + 8}%,${a * 0.7})`; ctx.fill();
      }
      ctx.strokeStyle = `hsla(${hue},40%,${L - 4}%,${a * 0.5})`; ctx.lineWidth = 0.7 * s;
      ctx.beginPath(); ctx.moveTo(0, r * 0.9); ctx.bezierCurveTo(0, r * 0.4, 0, -r * 0.4, 0, -r * 0.9); ctx.stroke();
    };

    const drawRound = (dark: boolean, hue: number, a: number, s: number) => {
      const r = 11 * s, L = dark ? 55 : 42;
      ctx.fillStyle = `hsla(${hue - 8},58%,${L}%,${a})`;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `hsla(${hue},50%,${L - 10}%,${a * 0.5})`; ctx.lineWidth = 0.6 * s;
      ctx.beginPath(); ctx.moveTo(0, r * 0.8); ctx.bezierCurveTo(r * 0.25, 0, -r * 0.25, -r * 0.5, 0, -r * 0.9); ctx.stroke();
    };

    const drawSeed = (dark: boolean, hue: number, a: number, s: number) => {
      const L = dark ? 60 : 45;
      ctx.fillStyle = `hsla(${hue + 15},50%,${L}%,${a})`;
      ctx.beginPath(); ctx.ellipse(0, 0, 5 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
    };

    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      const dark = isDark();
      for (const p of particles) {
        p.x += p.vx + Math.sin(t * p.wobble + p.phase) * 0.18;
        p.y += p.vy; p.rot += p.vrot;
        if (p.y < -60) { Object.assign(p, spawn(Math.random() * W, H + 50)); continue; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        if (p.type === 'sprout') drawSprout(dark, p.hue, p.opacity, p.scale);
        else if (p.type === 'leaf') drawLeaf(dark, p.hue, p.opacity, p.scale);
        else if (p.type === 'round') drawRound(dark, p.hue, p.opacity, p.scale);
        else drawSeed(dark, p.hue, p.opacity, p.scale);
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [count]);

  return <canvas ref={ref} aria-hidden="true" className={className} style={{ pointerEvents: 'none', ...style }} />;
}
