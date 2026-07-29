'use client';

import { useEffect, useRef, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

const backdrop = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const panel = {
  hidden: { opacity: 0, scale: 0.95, y: 16 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

const spring = { type: 'spring' as const, damping: 25, stiffness: 300 };

export function Modal({ open, onClose, children, className = '' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const handleCancel = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      onClose();
    },
    [onClose],
  );

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
        <dialog
          ref={dialogRef}
          onCancel={handleCancel}
          onClick={(e) => {
            if (e.target === dialogRef.current) onClose();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100%',
            background: 'transparent',
            border: 'none',
            padding: 0,
            zIndex: 'var(--z-modal, 200)' as React.CSSProperties['zIndex'],
          }}
        >
          <motion.div
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={backdrop}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--bg-overlay)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-4)',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <motion.div
              variants={panel}
              transition={spring}
              className={className}
              style={{
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-2xl)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-xl)',
                maxWidth: '480px',
                width: '100%',
                maxHeight: '85dvh',
                overflow: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </motion.div>
          </motion.div>
        </dialog>
      )}
    </AnimatePresence>
  );
}
