'use client';

import { useEffect, useRef, useState } from 'react';

/* ─────────────────────────────────────────────
   Таймер шага рецепта: локальный отсчёт, вибро/звук по окончании.
   ───────────────────────────────────────────── */

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch { /* звук не критичен */ }
}

export function StepTimer({ seconds, accent }: { seconds: number; accent: string }) {
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(false);
  const done = left <= 0;
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    ref.current = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          if (ref.current) clearInterval(ref.current);
          setRunning(false);
          beep();
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);

  const toggle = () => {
    if (done) { setLeft(seconds); return; }
    setRunning((r) => !r);
  };

  return (
    <button
      onClick={toggle}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        marginTop: 8, padding: '8px 14px', borderRadius: 12,
        border: `1px solid ${done ? 'var(--cat-10)' : accent}`,
        background: 'transparent',
        color: done ? 'var(--cat-10)' : accent,
        fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}
    >
      ⏱ {done ? 'Готово · заново' : running ? `Пауза · ${fmt(left)}` : `Таймер ${fmt(left)}`}
    </button>
  );
}
