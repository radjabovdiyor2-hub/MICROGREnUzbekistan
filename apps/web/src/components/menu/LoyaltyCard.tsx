'use client';

import { useEffect, useState } from 'react';
import { getSessionId } from '@/lib/magazine/track';
import Link from 'next/link';

/* ─────────────────────────────────────────────
   Карта лояльности на витрине ресторана.
   Прогресс читается по sessionId; штампы начисляются на сервере при
   отправке кадра, поэтому здесь только отображение.
   ───────────────────────────────────────────── */

interface CardState {
  stamps: number;
  goal: number;
  rewardPercent: number;
  rewardCode: string | null;
}

export function LoyaltyCard({ slug, accent }: { slug: string; accent: string }) {
  const [card, setCard] = useState<CardState | null>(null);

  useEffect(() => {
    const sid = getSessionId();
    fetch(`/api/menu/loyalty?slug=${encodeURIComponent(slug)}&sessionId=${encodeURIComponent(sid)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCard(d))
      .catch(() => { /* карта не критична */ });
  }, [slug]);

  if (!card) return null;

  const done = Boolean(card.rewardCode);

  return (
    <section style={{
      marginTop: 28, padding: 20, borderRadius: 20,
      background: 'var(--bg-elevated, rgba(var(--overlay-light-rgb), 0.03))',
      border: `1px solid ${accent}33`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
          Карта гостя
        </h2>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)' }}>
          {Math.min(card.stamps, card.goal)}/{card.goal}
        </span>
      </div>

      {/* Штампы */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Array.from({ length: card.goal }, (_, i) => {
          const filled = i < card.stamps;
          return (
            <div key={i} style={{
              width: 36, height: 36, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
              background: filled ? accent : 'transparent',
              border: `2px solid ${filled ? accent : 'rgba(var(--overlay-light-rgb), 0.15)'}`,
              color: filled ? 'rgb(var(--overlay-light-rgb))' : 'var(--text-muted, var(--text-muted))',
            }}>
              {filled ? '📸' : i + 1}
            </div>
          );
        })}
      </div>

      {done ? (
        <div style={{
          marginTop: 16, padding: 14, borderRadius: 14,
          background: `${accent}18`, border: `1px dashed ${accent}`,
        }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            🎉 Карта заполнена! Промокод −{card.rewardPercent}% на микрозелень:
          </div>
          <div style={{
            fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 800,
            letterSpacing: 1, color: accent, userSelect: 'all',
          }}>{card.rewardCode}</div>
          <Link
            href="/catalog/microgreens"
            style={{
              display: 'inline-block', marginTop: 10, padding: '10px 18px', borderRadius: 12,
              background: accent, color: 'var(--text-inverse)', fontFamily: "'Inter', sans-serif",
              fontSize: 14, fontWeight: 700, textDecoration: 'none',
            }}
          >В магазин микрозелени →</Link>
        </div>
      ) : (
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-muted, var(--text-muted))', marginTop: 12, lineHeight: 1.5 }}>
          Снимайте кадр блюда в каждый визит — один штамп в день.
          Соберите {card.goal} и получите −{card.rewardPercent}% на домашнюю микрозелень.
        </p>
      )}
    </section>
  );
}
