'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  variant?: 'up' | 'left' | 'scale';
  delay?: number;
  stagger?: boolean;
}

export function ScrollReveal({ 
  children, 
  className = '', 
  variant = 'up', 
  delay = 0,
  stagger = false 
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            el.classList.add('visible');
          }, delay);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  const baseClass = stagger 
    ? 'stagger-children' 
    : variant === 'left' 
      ? 'reveal-left' 
      : variant === 'scale' 
        ? 'reveal-scale' 
        : 'reveal';

  return (
    <div ref={ref} className={`${baseClass} ${className}`}>
      {children}
    </div>
  );
}
