'use client';

import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom';
  className?: string;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  className = '',
}: TooltipProps) {
  const [show, setShow] = useState(false);

  const yOffset = position === 'top' ? -8 : 8;

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, y: yOffset, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: yOffset, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400, duration: 0.15 }}
            className={className}
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              ...(position === 'top'
                ? { bottom: 'calc(100% + 8px)' }
                : { top: 'calc(100% + 8px)' }),
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-md)',
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 50, // CSS-переменная в zIndex не разворачивается: React ждёт число
            }}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
