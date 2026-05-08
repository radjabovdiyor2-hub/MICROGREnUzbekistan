'use client';

import { useState, useEffect } from 'react';
import * as Icons from '@/components/ui/Icons';
import { triggerHaptic } from '@/utils/haptic';

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
    
    // Can water once every 5 seconds for demo (usually once a day)
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
      boxShadow: '0 4px 20px rgba(16, 185, 129, 0.1)'
    }}>
      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
        <Icons.Sparkles size={18} style={{ display: 'inline', color: '#10B981', marginRight: '5px' }} />
        Ваш эко-питомец
      </h3>
      
      <div 
        style={{ fontSize: '60px', animation: 'bounce 2s infinite', transition: 'all 0.3s' }}
        onClick={waterPlant}
      >
        {getPlantEmoji()}
      </div>
      
      <div style={{ width: '100%', background: 'var(--bg)', borderRadius: '10px', height: '10px', overflow: 'hidden' }}>
        <div style={{
          width: `${level}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #10B981, #34D399)',
          transition: 'width 0.5s ease-out'
        }} />
      </div>
      
      {level >= 100 ? (
        <div style={{ textAlign: 'center', color: '#10B981', fontWeight: 'bold' }}>
          🎉 Выращено! Промокод: <b>ECO-WOW-26</b> (-10%)
        </div>
      ) : (
        <button 
          onClick={waterPlant}
          style={{
            background: '#10B981',
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
          <Icons.Droplet size={18} />
          Полить (уровень {level}%)
        </button>
      )}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}} />
    </div>
  );
}
