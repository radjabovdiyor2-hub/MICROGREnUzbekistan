'use client';

import { Calculator, Sparkles, Trash, X } from 'lucide-react';

// Шапка панели ИИ-чата. Вынесено из AiChatWidget: файл перерос 200 строк.

export function AiChatHeader({ mode, setMode, isLoading, onClear, onClose }: {
  mode: 'chat' | 'tools';
  setMode: (m: 'chat' | 'tools') => void;
  isLoading: boolean;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
  <div style={{
    padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'linear-gradient(135deg, var(--cat-1) 0%, var(--cat-9) 50%, var(--cat-9) 100%)',
    backgroundSize: '200% 200%', animation: 'ai-gradient 8s ease infinite',
    color: 'white', flexShrink: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%', background: 'rgba(var(--overlay-light-rgb), 0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(8px)',
      }}>
        <Sparkles size={18} />
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.2px' }}>Microgreen Agro</div>
        <div style={{ fontSize: 10, opacity: 0.75, fontWeight: 500 }}>
          {isLoading ? 'Yozyapti...' : 'AI Maslahatchi • Online'}
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 4 }}>
      <button onClick={() => setMode(mode === 'tools' ? 'chat' : 'tools')} title="Asboblar"
        style={{ background: mode === 'tools' ? 'rgba(var(--overlay-light-rgb), 0.3)' : 'rgba(var(--overlay-light-rgb), 0.12)', border: 'none', borderRadius: 10, width: 32, height: 32, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
        <Calculator size={15} />
      </button>
      <button onClick={onClear} title="Tozalash"
        style={{ background: 'rgba(var(--overlay-light-rgb), 0.12)', border: 'none', borderRadius: 10, width: 32, height: 32, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
        <Trash size={14} />
      </button>
      <button onClick={onClose} id="ai-chat-close" title="Yopish"
        style={{ background: 'rgba(var(--overlay-light-rgb), 0.12)', border: 'none', borderRadius: 10, width: 32, height: 32, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
        <X size={16} />
      </button>
    </div>
  </div>
  );
}
