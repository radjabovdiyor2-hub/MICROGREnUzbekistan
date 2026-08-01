'use client';

import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { triggerHaptic } from '@/utils/haptic';

// Плавающая кнопка вызова ИИ-чата. Вынесено из AiChatWidget.

const spring = { type: 'spring' as const, damping: 25, stiffness: 300 };

export function AiChatFab({ onOpen }: { onOpen: () => void }) {
  return (
  <motion.button
    className="ai-chat-fab"
    onClick={() => { onOpen(); triggerHaptic('light'); }}
    aria-label="Open AI chat"
    id="ai-chat-fab"
    whileHover={{ scale: 1.1, boxShadow: '0 8px 24px color-mix(in srgb, var(--cat-1) 50%, transparent)' }}
    whileTap={{ scale: 0.9 }}
    transition={spring}
    style={{ position: 'fixed', bottom: 'calc(var(--bottom-nav-height) + var(--space-4))', right: 'var(--space-4)' }}
  >
    <Sparkles size={24} />
  </motion.button>
  );
}
