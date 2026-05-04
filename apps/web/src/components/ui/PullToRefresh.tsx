'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';
import * as Icons from '@/components/ui/Icons';
import { triggerHaptic } from '@/utils/haptic';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh?: () => Promise<void>;
}

export function PullToRefresh({ children, onRefresh }: PullToRefreshProps) {
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const scrollContainer = useRef<HTMLDivElement>(null);
  const PULL_THRESHOLD = 80;

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // Only allow pull-to-refresh if we are at the very top of the page
      if (window.scrollY <= 0) {
        startY.current = e.touches[0].clientY;
      } else {
        startY.current = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startY.current === null || isRefreshing) return;
      
      const y = e.touches[0].clientY;
      const dy = y - startY.current;
      
      // Only pull down
      if (dy > 0 && window.scrollY <= 0) {
        // Add resistance
        const pulled = Math.min(dy * 0.4, PULL_THRESHOLD + 20);
        setPullY(pulled);
        
        // Vibrate slightly when threshold is reached
        if (pulled >= PULL_THRESHOLD && pullY < PULL_THRESHOLD) {
          triggerHaptic('medium');
        }
      }
    };

    const handleTouchEnd = async () => {
      if (startY.current === null) return;
      
      if (pullY >= PULL_THRESHOLD && !isRefreshing) {
        setIsRefreshing(true);
        setPullY(PULL_THRESHOLD); // Hold it there
        triggerHaptic('success');
        
        if (onRefresh) {
          await onRefresh();
        } else {
          // Default refresh action
          await new Promise(r => setTimeout(r, 1000));
          window.location.reload();
        }
        
        setIsRefreshing(false);
        setPullY(0);
      } else {
        // Snap back
        setPullY(0);
      }
      startY.current = null;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullY, isRefreshing, onRefresh]);

  return (
    <div ref={scrollContainer} style={{ position: 'relative', width: '100%', minHeight: '100vh' }}>
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
             <Icons.ArrowDown size={20} style={{ transform: pullY >= PULL_THRESHOLD ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
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
