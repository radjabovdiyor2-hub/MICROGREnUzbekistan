'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, type ReactNode } from 'react';

const variantMap = {
  up:    { hidden: { opacity: 0, y: 40 },  visible: { opacity: 1, y: 0 } },
  left:  { hidden: { opacity: 0, x: -60 }, visible: { opacity: 1, x: 0 } },
  right: { hidden: { opacity: 0, x: 60 },  visible: { opacity: 1, x: 0 } },
  scale: { hidden: { opacity: 0, scale: 0.85 }, visible: { opacity: 1, scale: 1 } },
} as const;

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  variant?: keyof typeof variantMap;
  delay?: number;
  /** Stagger direct children instead of animating as one block */
  stagger?: boolean;
}

const spring = { type: 'spring' as const, damping: 25, stiffness: 120 };

export function ScrollReveal({
  children,
  className = '',
  variant = 'up',
  delay = 0,
  stagger = false,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  const v = variantMap[variant];

  if (stagger) {
    return (
      <motion.div
        ref={ref}
        className={className}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.06, delayChildren: delay / 1000 } },
        }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={v}
      transition={{ ...spring, delay: delay / 1000 }}
    >
      {children}
    </motion.div>
  );
}

/** Wrap each child inside a stagger container */
export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 24 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={spring}
    >
      {children}
    </motion.div>
  );
}
