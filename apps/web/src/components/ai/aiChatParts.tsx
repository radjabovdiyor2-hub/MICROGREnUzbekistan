'use client';

import { Sparkles } from 'lucide-react';

// Подсказки быстрых вопросов и индикатор набора. Вынесено из AiChatWidget —
// статика и презентационный кусок без состояния.

export const SUGGESTIONS = [
  { icon: '', text: "Qanday qilib rukkola o'stiriladi?" },
  { icon: '', text: "pH darajasini qanday o'lchash kerak?" },
  { icon: '', text: "Fitolampa qancha vaqt yonishi kerak?" },
  { icon: '', text: "Gidroponikada suv almashtirish" },
  { icon: '', text: "Rasmdan o'simlik kasalligini aniqlash" },
  { icon: '', text: "Biznes uchun hosildorlikni hisoblash" },
];

// Simple markdown: **bold**, `code`, \n
export function renderMarkdown(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`'))
        return <code key={j} style={{ background: 'rgba(var(--overlay-dark-rgb), 0.08)', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em' }}>{part.slice(1, -1)}</code>;
      return part;
    });
    return <span key={i}>{parts}{i < lines.length - 1 && <br />}</span>;
  });
}

// Typing indicator with 3 animated dots
export function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'flex-start', maxWidth: '85%' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, var(--cat-1), var(--cat-2))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px color-mix(in srgb, var(--cat-1) 25%, transparent)',
      }}>
        <Sparkles size={14} color="white" />
      </div>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: '16px 16px 16px 4px',
        padding: '14px 18px', display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--text-muted)', display: 'block',
            animation: `dotBounce 1.4s ${i * 0.16}s ease-in-out infinite`,
          }} />
        ))}
        <style>{`@keyframes dotBounce {
          0%,60%,100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }`}</style>
      </div>
    </div>
  );
}
