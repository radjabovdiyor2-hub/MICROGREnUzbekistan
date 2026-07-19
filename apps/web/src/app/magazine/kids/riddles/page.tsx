'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

interface Riddle { q: string; answer: string; accept: string[]; emoji: string }

const RIDDLES: Riddle[] = [
  { q: 'Зелёный, кудрявый, кучерявый — на пицце главный. Пахнет солнцем Италии. Что это?', answer: 'Базилик', accept: ['базилик'], emoji: '🌿' },
  { q: 'Маленький росточек, а витамина С в нём больше, чем в лимоне. Растёт из красного корешка. Кто это?', answer: 'Ростки редиса', accept: ['редис', 'редиск'], emoji: '🌱' },
  { q: 'Я оранжевая, хрустящая, зайчик меня обожает. Что я?', answer: 'Морковка', accept: ['морков'], emoji: '🥕' },
  { q: 'Зелёная стрелочка с острым вкусом, украшает суп и салат. Как меня зовут?', answer: 'Зелёный лук', accept: ['лук'], emoji: '🧅' },
  { q: 'Я похож на маленькое дерево, весь в зелёных кудряшках, полон витаминов. Кто я?', answer: 'Брокколи', accept: ['брокколи', 'брокол'], emoji: '🥦' },
  { q: 'Красный, сочный, круглый — и не фрукт, и не ягода по-настоящему. В салате первый. Что это?', answer: 'Помидор', accept: ['помидор', 'томат'], emoji: '🍅' },
];

export default function RiddlesPage() {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [heard, setHeard] = useState('');
  const [result, setResult] = useState<'ok' | 'no' | null>(null);
  const [listening, setListening] = useState(false);

  const r = RIDDLES[i];
  const hasSR = useMemo(() => typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition), []);

  const speak = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(r.q);
    u.lang = 'ru-RU'; u.rate = 0.9; u.pitch = 1.1;
    window.speechSynthesis.speak(u);
  };

  const next = () => {
    window.speechSynthesis?.cancel();
    setI((v) => (v + 1) % RIDDLES.length);
    setRevealed(false); setHeard(''); setResult(null);
  };

  const check = (text: string) => {
    const t = text.toLowerCase();
    const ok = r.accept.some((a) => t.includes(a));
    setResult(ok ? 'ok' : 'no');
    if (ok) setRevealed(true);
  };

  const listen = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'ru-RU'; rec.interimResults = false; rec.maxAlternatives = 1;
    setListening(true); setHeard(''); setResult(null);
    rec.onresult = (e: any) => { const text = e.results[0][0].transcript; setHeard(text); check(text); };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)', padding: '90px 20px 80px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Link href="/magazine/kids" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 }}>← Fresh Kids</Link>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(30px, 6vw, 46px)', fontWeight: 900, color: 'var(--text-primary)', margin: '16px 0 8px' }}>🔊 Голосовые загадки</h1>
        <p style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', marginBottom: 24 }}>Загадка {i + 1} из {RIDDLES.length}. Слушай и отвечай голосом!</p>

        <div style={{ background: 'var(--bg-elevated, #fff)', padding: 28, borderRadius: 24, border: '1px solid var(--border, #eee)', textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>{revealed ? r.emoji : '❓'}</div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, lineHeight: 1.5, color: 'var(--text-primary)', marginBottom: 20 }}>{r.q}</div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={speak} style={btn}>🔊 Слушать</button>
            {hasSR && <button onClick={listen} disabled={listening} style={{ ...btn, background: listening ? '#c2410c' : '#7c3aed' }}>{listening ? '🎤 Слушаю…' : '🎤 Ответить голосом'}</button>}
            <button onClick={() => setRevealed(true)} style={{ ...btn, background: 'transparent', color: 'var(--text-primary)' }}>Показать ответ</button>
          </div>

          {heard && <div style={{ marginTop: 16, fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--text-secondary)' }}>Ты сказал: «{heard}»</div>}
          {result === 'ok' && <div style={{ marginTop: 8, color: '#3a7a32', fontWeight: 800, fontFamily: "'Inter', sans-serif" }}>✅ Правильно! Молодец!</div>}
          {result === 'no' && <div style={{ marginTop: 8, color: '#c2410c', fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>Почти! Попробуй ещё разок 🙂</div>}

          {revealed && <div style={{ marginTop: 16, fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 800, color: 'var(--brand-primary, #3a7a32)' }}>Ответ: {r.answer}</div>}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button onClick={next} style={{ ...btn, background: 'var(--brand-primary, #3a7a32)' }}>Следующая загадка →</button>
        </div>
        {!hasSR && <p style={{ textAlign: 'center', marginTop: 16, fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-muted, #999)' }}>Голосовой ответ работает в Chrome/Safari на телефоне.</p>}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: '#3a7a32', color: '#fff', border: '1px solid var(--border, transparent)',
  borderRadius: 30, padding: '10px 18px', fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, cursor: 'pointer',
};
