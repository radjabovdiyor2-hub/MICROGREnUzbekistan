'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/* ─────────────────────────────────────────────
   Голосовые загадки — FRESH WEEKLY
   Web Speech Recognition → проверка ответа
   3 правильных ответа = печать в паспорт агронома
   ───────────────────────────────────────────── */

interface Riddle {
  q: string;
  answer: string;
  accept: string[];
  emoji: string;
  hint: string;
}

const RIDDLES: Riddle[] = [
  { q: 'Зелёный, кудрявый, кучерявый — на пицце главный. Пахнет солнцем Италии. Что это?', answer: 'Базилик', accept: ['базилик'], emoji: '🌿', hint: 'Его кладут в пасту и пиццу «Маргарита».' },
  { q: 'Маленький росточек, а витамина С в нём больше, чем в лимоне. Растёт из красного корешка. Кто это?', answer: 'Ростки редиса', accept: ['редис', 'редиск'], emoji: '🌱', hint: 'Он острый и красный, а росточки его зелёные.' },
  { q: 'Я оранжевая, хрустящая, зайчик меня обожает. Что я?', answer: 'Морковка', accept: ['морков'], emoji: '🥕', hint: 'Из меня делают сок и кладут в плов.' },
  { q: 'Зелёная стрелочка с острым вкусом, украшает суп и салат. Как меня зовут?', answer: 'Зелёный лук', accept: ['лук'], emoji: '🧅', hint: 'Я расту из луковицы, но я зелёный.' },
  { q: 'Я похож на маленькое дерево, весь в зелёных кудряшках, полон витаминов. Кто я?', answer: 'Брокколи', accept: ['брокколи', 'брокол'], emoji: '🥦', hint: 'Меня зовут как одного из Агро Друзей — Брок!' },
  { q: 'Красный, сочный, круглый — и не фрукт, и не ягода по-настоящему. В салате первый. Что это?', answer: 'Помидор', accept: ['помидор', 'томат'], emoji: '🍅', hint: 'Из меня делают кетчуп и томатную пасту.' },
  { q: 'Маленький зелёный горошек, но из него растут самые полезные ростки. Кто я?', answer: 'Горох', accept: ['горох', 'горошек'], emoji: '🫛', hint: 'Мои ростки — самая популярная микрозелень.' },
  { q: 'Я жёлтый и длинный, обезьяны от меня в восторге. Кто я?', answer: 'Банан', accept: ['банан'], emoji: '🍌', hint: 'Меня удобно брать с собой на перекус.' },
  { q: 'У меня зелёная корона и жёлтый бок. В тропиках мой дом. Кто я?', answer: 'Ананас', accept: ['ананас'], emoji: '🍍', hint: 'Мой сок пьют на пляже.' },
];

const PASSPORT_KEY = 'fw_passport_v2';

export default function RiddlesPage() {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [heard, setHeard] = useState('');
  const [result, setResult] = useState<'ok' | 'no' | null>(null);
  const [listening, setListening] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [stampEarned, setStampEarned] = useState(false);

  const r = RIDDLES[i];
  const hasSR = useMemo(() =>
    typeof window !== 'undefined' && !!(
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    ), []);

  // Проверка: если 3 правильных — дать печать
  useEffect(() => {
    if (score >= 3 && !stampEarned) {
      try {
        const raw = localStorage.getItem(PASSPORT_KEY);
        if (raw) {
          const passport = JSON.parse(raw);
          if (!passport.achievements?.includes('riddle3')) {
            passport.achievements = [...(passport.achievements || []), 'riddle3'];
            localStorage.setItem(PASSPORT_KEY, JSON.stringify(passport));
            setStampEarned(true);
          }
        }
      } catch { /* ok */ }
    }
  }, [score, stampEarned]);

  const speak = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(r.q);
    u.lang = 'ru-RU'; u.rate = 0.9; u.pitch = 1.1;
    window.speechSynthesis.speak(u);
  };

  const next = useCallback(() => {
    window.speechSynthesis?.cancel();
    setI(v => (v + 1) % RIDDLES.length);
    setRevealed(false); setHeard(''); setResult(null); setShowHint(false);
  }, []);

  const check = useCallback((text: string) => {
    const t = text.toLowerCase();
    const ok = r.accept.some(a => t.includes(a));
    setResult(ok ? 'ok' : 'no');
    setTotal(n => n + 1);
    if (ok) {
      setRevealed(true);
      setScore(n => n + 1);
      if (navigator.vibrate) navigator.vibrate([15, 50, 15]);
    }
  }, [r]);

  const listen = useCallback(() => {
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition || w.webkitSpeechRecognition) as { new(): SpeechRecognitionInstance } | undefined;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'ru-RU'; rec.interimResults = false; rec.maxAlternatives = 1;
    setListening(true); setHeard(''); setResult(null);
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript;
      setHeard(text);
      check(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  }, [check]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)', padding: '90px 20px 80px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Link href="/magazine/kids" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 }}>← Fresh Kids</Link>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(30px, 6vw, 46px)', fontWeight: 900, color: 'var(--text-primary)', margin: '16px 0 8px' }}>🔊 Голосовые загадки</h1>

        {/* Счёт */}
        <div style={{
          display: 'flex', gap: 16, marginBottom: 20,
          fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{
            padding: '6px 14px', borderRadius: 20,
            background: 'rgba(58,122,50,0.12)', color: 'var(--brand-primary, #3a7a32)',
            fontSize: 13, fontWeight: 700,
          }}>✅ {score} правильно</div>
          <div style={{
            padding: '6px 14px', borderRadius: 20,
            background: 'var(--bg-elevated, rgba(255,255,255,0.05))',
            color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
          }}>Загадка {i + 1} из {RIDDLES.length}</div>
        </div>

        {/* Печать заработана */}
        {stampEarned && (
          <div style={{
            padding: '12px 16px', marginBottom: 16,
            background: 'rgba(124,58,237,0.1)',
            border: '1px solid rgba(124,58,237,0.3)',
            borderRadius: 16,
            fontFamily: "'Inter', sans-serif", fontSize: 14,
            color: '#7c3aed', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            ⭐ Печать «Решил 3 загадки» получена! <Link href="/magazine/kids/passport" style={{ color: '#7c3aed' }}>Открыть паспорт →</Link>
          </div>
        )}

        {/* Карточка загадки */}
        <div style={{
          background: 'var(--bg-elevated, #fff)',
          padding: 28, borderRadius: 24,
          border: '1px solid var(--border, #eee)',
          textAlign: 'center',
          boxShadow: 'var(--shadow-md, 0 4px 20px rgba(0,0,0,0.06))',
        }}>
          <div style={{
            fontSize: 64, marginBottom: 12,
            transition: 'transform 0.3s',
            transform: revealed ? 'scale(1.1)' : 'scale(1)',
          }}>{revealed ? r.emoji : '❓'}</div>

          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 22, lineHeight: 1.5,
            color: 'var(--text-primary)', marginBottom: 20,
          }}>{r.q}</div>

          {/* Подсказка */}
          {showHint && !revealed && (
            <div style={{
              padding: '10px 16px', marginBottom: 16,
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 12,
              fontFamily: "'Inter', sans-serif", fontSize: 14,
              color: '#f59e0b',
            }}>
              💡 {r.hint}
            </div>
          )}

          {/* Кнопки */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={speak} style={btn}>🔊 Слушать</button>
            {hasSR && (
              <button onClick={listen} disabled={listening} style={{
                ...btn,
                background: listening ? '#c2410c' : '#7c3aed',
                animation: listening ? 'pulse-mic 1s ease-in-out infinite' : 'none',
              }}>
                {listening ? '🎤 Слушаю…' : '🎤 Ответить'}
              </button>
            )}
            {!revealed && !showHint && (
              <button onClick={() => setShowHint(true)} style={{ ...btn, background: '#f59e0b' }}>💡 Подсказка</button>
            )}
            {!revealed && (
              <button onClick={() => { setRevealed(true); setTotal(n => n + 1); }} style={{
                ...btn, background: 'transparent', color: 'var(--text-primary)',
                border: '1px solid var(--border, #ccc)',
              }}>Показать ответ</button>
            )}
          </div>

          {/* Результат голосового ответа */}
          {heard && (
            <div style={{ marginTop: 16, fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--text-secondary)' }}>
              Ты сказал: «{heard}»
            </div>
          )}
          {result === 'ok' && (
            <div style={{
              marginTop: 12, padding: '10px 16px', borderRadius: 12,
              background: 'rgba(58,122,50,0.12)',
              color: '#3a7a32', fontWeight: 800, fontFamily: "'Inter', sans-serif", fontSize: 16,
            }}>✅ Правильно! Молодец!</div>
          )}
          {result === 'no' && (
            <div style={{
              marginTop: 12, padding: '10px 16px', borderRadius: 12,
              background: 'rgba(194,65,12,0.1)',
              color: '#c2410c', fontWeight: 700, fontFamily: "'Inter', sans-serif", fontSize: 15,
            }}>Почти! Попробуй ещё 🙂</div>
          )}

          {revealed && (
            <div style={{
              marginTop: 16, fontFamily: "'Playfair Display', serif",
              fontSize: 24, fontWeight: 800, color: 'var(--brand-primary, #3a7a32)',
            }}>
              {r.emoji} {r.answer}
            </div>
          )}
        </div>

        {/* Следующая */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button onClick={next} style={{ ...btn, background: 'var(--brand-primary, #3a7a32)', padding: '12px 28px', fontSize: 16 }}>
            Следующая загадка →
          </button>
        </div>

        {/* Прогресс до печати */}
        {!stampEarned && score < 3 && total > 0 && (
          <div style={{
            textAlign: 'center', marginTop: 12,
            fontFamily: "'Inter', sans-serif", fontSize: 12,
            color: 'var(--text-muted, #999)',
          }}>
            До печати в паспорт: {score}/3 правильных ответов
          </div>
        )}

        {!hasSR && (
          <p style={{
            textAlign: 'center', marginTop: 16,
            fontFamily: "'Inter', sans-serif", fontSize: 13,
            color: 'var(--text-muted, #999)',
          }}>Голосовой ответ работает в Chrome/Safari на телефоне.</p>
        )}
      </div>

      <style>{`
        @keyframes pulse-mic {
          0%, 100% { box-shadow: 0 0 0 0 rgba(194,65,12,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(194,65,12,0); }
        }
      `}</style>
    </div>
  );
}

// SpeechRecognition type shim (Web Speech API)
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
}

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

const btn: React.CSSProperties = {
  background: '#3a7a32', color: '#fff', border: 'none',
  borderRadius: 30, padding: '10px 18px',
  fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700,
  cursor: 'pointer', transition: 'all 0.2s',
};
