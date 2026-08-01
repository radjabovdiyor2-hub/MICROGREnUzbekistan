'use client';

import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import { triggerHaptic } from '@/utils/haptic';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh?: () => Promise<void>;
}

const PULL_THRESHOLD = 80;

export function PullToRefresh({ children, onRefresh }: PullToRefreshProps) {
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullYRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  // Зеркала состояния для обработчиков касаний: они регистрируются один раз,
  // и без этого читали бы значения того рендера, в котором были созданы.
  // Синхронизация идёт после коммита, а не в теле рендера: запись в ref во
  // время рендера ломает конкурентный рендеринг React.
  useEffect(() => {
    pullYRef.current = pullY;
    isRefreshingRef.current = isRefreshing;
    onRefreshRef.current = onRefresh;
  });

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY <= 0) {
      startY.current = e.touches[0].clientY;
    } else {
      startY.current = null;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (startY.current === null || isRefreshingRef.current) return;

    const y = e.touches[0].clientY;
    const dy = y - startY.current;

    if (dy > 0 && window.scrollY <= 0) {
      const pulled = Math.min(dy * 0.4, PULL_THRESHOLD + 20);
      setPullY(pulled);

      if (pulled >= PULL_THRESHOLD && pullYRef.current < PULL_THRESHOLD) {
        triggerHaptic('medium');
      }
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (startY.current === null) return;

    if (pullYRef.current >= PULL_THRESHOLD && !isRefreshingRef.current) {
      setIsRefreshing(true);
      setPullY(PULL_THRESHOLD);
      triggerHaptic('success');

      if (onRefreshRef.current) {
        await onRefreshRef.current();
      } else {
        await new Promise(r => setTimeout(r, 1000));
        window.location.reload();
      }

      setIsRefreshing(false);
      setPullY(0);
    } else {
      setPullY(0);
    }
    startY.current = null;
  }, []);

  // Register event listeners only ONCE (stable callbacks via refs)
  useEffect(() => {
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh' }}>
      {/* Pull indicator */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: PULL_THRESHOLD,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `translateY(${pullY > 0 ? (pullY - PULL_THRESHOLD) : -PULL_THRESHOLD}px)`,
        transition: isRefreshing || pullY === 0 ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        zIndex: 10,
        opacity: pullY / PULL_THRESHOLD,
        pointerEvents: 'none',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'var(--bg-card)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--brand-primary)',
          transform: `rotate(${pullY * 2}deg)`,
          transition: isRefreshing ? 'all 0.3s' : 'none',
        }}>
          {isRefreshing ? (
             <div style={{
               width: 20, height: 20, border: '2px solid var(--brand-primary)',
               borderTopColor: 'transparent', borderRadius: '50%',
               animation: 'spin 1s linear infinite'
             }} />
          ) : (
             <ArrowDown size={20} style={{ transform: pullY >= PULL_THRESHOLD ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          )}
        </div>
      </div>
      
      {/* Content wrapper */}
      <div style={{
        transform: `translateY(${pullY}px)`,
        transition: isRefreshing || pullY === 0 ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        width: '100%',
        minHeight: '100vh',
      }}>
        {children}
      </div>
    </div>
  );
}
