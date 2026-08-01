'use client';

import { useState, useEffect } from 'react';
import { Droplet, Sparkles } from 'lucide-react';
import { triggerHaptic } from '@/utils/haptic';
import { motion, AnimatePresence } from 'framer-motion';

const spring = { type: 'spring' as const, damping: 15, stiffness: 200 };

export function Tamagotchi() {
  const [level, setLevel] = useState(0);
  const [lastWatered, setLastWatered] = useState(0);
  
  useEffect(() => {
    const savedLevel = localStorage.getItem('tamagotchi_level');
    const savedTime = localStorage.getItem('tamagotchi_time');
    if (savedLevel) setLevel(parseInt(savedLevel));
    if (savedTime) setLastWatered(parseInt(savedTime));
  }, []);

  const waterPlant = () => {
    triggerHaptic('success');
    const now = Date.now();
    
    if (now - lastWatered < 5000) {
      triggerHaptic('warning');
      return;
    }
    
    const newLevel = Math.min(level + 10, 100);
    setLevel(newLevel);
    setLastWatered(now);
    
    localStorage.setItem('tamagotchi_level', newLevel.toString());
    localStorage.setItem('tamagotchi_time', now.toString());
  };

  const getPlantEmoji = () => {
    if (level < 20) return '🌱';
    if (level < 50) return '🌿';
    if (level < 80) return '🪴';
    return '🌳';
  };

  return (
    <div style={{
      background: 'var(--card)',
      borderRadius: '20px',
      padding: '20px',
      margin: '20px 0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '15px',
      border: '1px solid var(--border)',
      boxShadow: '0 4px 20px rgba(var(--brand-primary-rgb), 0.1)'
    }}>
      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
        <Sparkles size={18} style={{ display: 'inline', color: 'var(--brand-primary)', marginRight: '5px' }} />
        Ваш эко-питомец
      </h3>
      
      {/* Framer Motion bounce replaces dangerouslySetInnerHTML keyframe */}
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ fontSize: '60px', cursor: 'pointer' }}
        whileTap={{ scale: 1.3 }}
        onClick={waterPlant}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={getPlantEmoji()}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={spring}
          >
            {getPlantEmoji()}
          </motion.span>
        </AnimatePresence>
      </motion.div>
      
      {/* Progress bar with motion width */}
      <div style={{ width: '100%', background: 'var(--bg)', borderRadius: '10px', height: '10px', overflow: 'hidden' }}>
        <motion.div
          animate={{ width: `${level}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-primary))',
            borderRadius: '10px',
          }}
        />
      </div>
      
      <AnimatePresence mode="wait">
        {level >= 100 ? (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring}
            style={{ textAlign: 'center', color: 'var(--brand-primary)', fontWeight: 'bold' }}
          >
            🎉 Выращено! Промокод: <b>ECO-WOW-26</b> (-10%)
          </motion.div>
        ) : (
          <motion.button
            key="water"
            onClick={waterPlant}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={spring}
            style={{
              background: 'var(--brand-primary)',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Droplet size={18} />
            Полить (уровень {level}%)
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
