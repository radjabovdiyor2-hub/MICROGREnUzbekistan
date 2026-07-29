'use client';

import { useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Height of the drawer content (CSS value). Default: auto */
  height?: string;
}

const spring = { type: 'spring' as const, damping: 30, stiffness: 300 };

export function Drawer({
  open,
  onClose,
  children,
  className = '',
  height = 'auto',
}: DrawerProps) {
  const dragControls = useDragControls();

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--bg-overlay)',
              zIndex: 'var(--z-drawer, 150)' as React.CSSProperties['zIndex'],
            }}
          />

          {/* Drawer panel */}
          <motion.div
            className={className}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring}
            drag="y"
            dragControls={dragControls}
            dragConstraints={{ top: 0 }}
            dragElastic={0.1}
            onDragEnd={(_e, info) => {
              // Dismiss if dragged down > 100px or with velocity
              if (info.offset.y > 100 || info.velocity.y > 500) {
                onClose();
              }
            }}
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              height,
              maxHeight: '90dvh',
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0',
              border: '1px solid var(--border)',
              borderBottom: 'none',
              boxShadow: 'var(--shadow-xl)',
              zIndex: 'var(--z-drawer, 150)' as React.CSSProperties['zIndex'],
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              touchAction: 'none',
            }}
          >
            {/* Drag handle */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '12px 0 8px',
                cursor: 'grab',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 999,
                  background: 'var(--border-strong)',
                }}
              />
            </div>

            {/* Content */}
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: '0 var(--space-4) var(--space-4)',
              }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
