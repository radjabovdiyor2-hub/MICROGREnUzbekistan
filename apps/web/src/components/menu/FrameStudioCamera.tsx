'use client';

import React from 'react';
import Link from 'next/link';
import type { FrameBrand, FrameContent } from '@/lib/magazine/frame';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  content: FrameContent;
  brand: FrameBrand;
  slug: string;
  dishCode: number;
  error: string | null;
  accent: string;
  capture: () => void;
}

export function FrameStudioCamera({
  videoRef, content, brand, slug, dishCode, error, accent, capture,
}: Props) {
  return (
    <>
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, padding: '16px 20px 32px',
        background: 'linear-gradient(180deg, rgba(var(--overlay-dark-rgb), 0.7), transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ color: 'var(--text-inverse)' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{content.dishName}</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>{brand.name}</div>
        </div>
        <Link
          href={`/m/${slug}/d/${dishCode}`}
          style={{
            padding: '8px 16px', borderRadius: 20, color: 'var(--text-inverse)', fontSize: 13, fontWeight: 600,
            background: 'rgba(var(--overlay-light-rgb), 0.15)', textDecoration: 'none',
          }}
        >Закрыть</Link>
      </div>

      {error ? (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center',
          color: 'var(--text-inverse)', gap: 16,
        }}>
          <div style={{ fontSize: 40 }}>📷</div>
          <p style={{ fontSize: 15, lineHeight: 1.6, opacity: 0.8 }}>{error}</p>
          <Link href={`/m/${slug}`} style={{ color: accent, fontWeight: 700, textDecoration: 'none' }}>
            ← Вернуться в меню
          </Link>
        </div>
      ) : (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, padding: '24px 20px 40px',
          background: 'linear-gradient(0deg, rgba(var(--overlay-dark-rgb), 0.75), transparent)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        }}>
          <p style={{ color: 'rgba(var(--overlay-light-rgb), 0.65)', fontSize: 13, textAlign: 'center' }}>
            Наведите на блюдо и нажмите — рамка добавится сама
          </p>
          <button
            onClick={capture}
            aria-label="Снять кадр"
            style={{
              width: 78, height: 78, borderRadius: '50%',
              border: `4px solid ${accent}`, background: 'rgb(var(--overlay-light-rgb))', cursor: 'pointer',
            }}
          />
        </div>
      )}
    </>
  );
}
