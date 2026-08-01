'use client';

import { motion, AnimatePresence, type Variants } from 'framer-motion';
import type { ReactNode, ComponentPropsWithoutRef } from 'react';

// ---------------------------------------------------------------------------
// Spring presets — consistent feel across the app
// ---------------------------------------------------------------------------
export const springs = {
  snappy:  { type: 'spring' as const, damping: 20, stiffness: 300 },
  gentle:  { type: 'spring' as const, damping: 25, stiffness: 120 },
  bouncy:  { type: 'spring' as const, damping: 15, stiffness: 200 },
} as const;

// ---------------------------------------------------------------------------
// MotionCard — interactive card with spring hover lift + tap feedback
// ---------------------------------------------------------------------------
export function MotionCard({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof motion.div>) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -6, boxShadow: '0 18px 44px -14px rgba(var(--overlay-dark-rgb), 0.2)' }}
      whileTap={{ scale: 0.97 }}
      transition={springs.snappy}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// MotionButton — spring hover + tap with scale
// ---------------------------------------------------------------------------
export function MotionButton({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof motion.button>) {
  return (
    <motion.button
      className={className}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.95 }}
      transition={springs.snappy}
      {...props}
    >
      {children}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// FadeIn — simple opacity + optional translate
// ---------------------------------------------------------------------------
const fadeVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={fadeVariants}
      transition={{ ...springs.gentle, delay }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// PageTransition — wrap page content for route transitions
// ---------------------------------------------------------------------------
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.gentle, duration: 0.4 }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// AnimatedCounter — number that animates on change
// ---------------------------------------------------------------------------
export function AnimatedCounter({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={value}
        className={className}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={springs.snappy}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// ScalePop — pop-in animation for badges, notifications
// ---------------------------------------------------------------------------
export function ScalePop({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence>
      <motion.div
        className={className}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={springs.bouncy}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// Re-export motion and AnimatePresence for convenience
export { motion, AnimatePresence };
