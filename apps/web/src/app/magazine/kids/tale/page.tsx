'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function NeuroTalePage() {
  const [childName, setChildName] = useState('');
  const [age, setAge] = useState('');
  const [favorite, setFavorite] = useState('');
  const [loading, setLoading] = useState(false);
  const [tale, setTale] = useState<{ title: string; story: string } | null>(null);
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);

  const generate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!childName.trim()) { setError('Впиши имя ребёнка 🙂'); return; }
    setLoading(true); setError(''); setTale(null); stopSpeak();
    try {
      const res = await fetch('/api/magazine/kids/tale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childName, age, favorite }),
      });
      const data = await res.json();
      if (res.ok && data.story) setTale({ title: data.title, story: data.story });
      else setError(data.error || 'Что-то пошло не так');
    } catch { setError('Нет связи со сказочником'); }
    finally { setLoading(false); }
  };

  const speak = () => {
    if (!tale || typeof window === 'undefined' || !window.speechSynthesis) return;
    stopSpeak();
    const u = new SpeechSynthesisUtterance(`${tale.title}. ${tale.story}`);
    u.lang = 'ru-RU'; u.rate = 0.95; u.pitch = 1.1;
    u.onend = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };
  const stopSpeak = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)', padding: '90px 20px 80px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <Link href="/magazine/kids" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 }}>← Fresh Kids</Link>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(30px, 6vw, 46px)', fontWeight: 900, color: 'var(--text-primary)', margin: '16px 0 8px' }}>📖 Нейро-сказка</h1>
        <p style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', marginBottom: 24 }}>Росточек придумает историю специально для твоего ребёнка.</p>

        <form onSubmit={generate} style={{ display: 'grid', gap: 12, background: 'var(--bg-elevated, #fff)', padding: 20, borderRadius: 20, border: '1px solid var(--border, #eee)' }}>
          <input value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="Имя ребёнка *" style={inp} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="Возраст" inputMode="numeric" style={inp} />
            <input value={favorite} onChange={(e) => setFavorite(e.target.value)} placeholder="Что любит (динозавры, футбол…)" style={inp} />
          </div>
          <button type="submit" disabled={loading} style={{ background: 'var(--brand-primary, #3a7a32)', color: '#fff', border: 'none', borderRadius: 30, padding: '14px', fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? '✨ Сочиняю…' : '✨ Сочинить сказку'}
          </button>
          {error && <div style={{ color: 'var(--error, #e11)', fontFamily: "'Inter', sans-serif", fontSize: 14 }}>{error}</div>}
        </form>

        {tale && (
          <article style={{ marginTop: 28, background: 'var(--bg-elevated, #fff)', padding: 28, borderRadius: 20, border: '1px solid var(--border, #eee)' }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 16 }}>{tale.title}</h2>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-line' }}>{tale.story}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
              <button onClick={speaking ? stopSpeak : speak} style={btn}>{speaking ? '⏹ Стоп' : '🔊 Читать вслух'}</button>
              <button onClick={() => generate()} style={{ ...btn, background: 'transparent', color: 'var(--text-primary)' }}>🎲 Ещё сказку</button>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border, #ddd)',
  fontFamily: "'Inter', sans-serif", fontSize: 16, background: 'var(--bg-primary, #fff)', color: 'var(--text-primary)',
};
const btn: React.CSSProperties = {
  background: 'var(--brand-primary, #3a7a32)', color: '#fff', border: '1px solid var(--border, transparent)',
  borderRadius: 30, padding: '10px 20px', fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, cursor: 'pointer',
};
