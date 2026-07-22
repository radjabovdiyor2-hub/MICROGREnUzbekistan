'use client';

import { useState } from 'react';
import Link from 'next/link';

/* ─────────────────────────────────────────────
   Нейро-сказка — FRESH WEEKLY
   AI генерирует персонализированную сказку
   с именем ребёнка и героем Росточком.
   Языки: русский / узбекский
   ───────────────────────────────────────────── */

const PASSPORT_KEY = 'fw_passport_v2';

export default function NeuroTalePage() {
  const [childName, setChildName] = useState('');
  const [age, setAge] = useState('');
  const [favorite, setFavorite] = useState('');
  const [lang, setLang] = useState<'ru' | 'uz'>('ru');
  const [loading, setLoading] = useState(false);
  const [tale, setTale] = useState<{ title: string; story: string } | null>(null);
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [stampEarned, setStampEarned] = useState(false);

  const generate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!childName.trim()) { setError(lang === 'ru' ? 'Впиши имя ребёнка 🙂' : 'Bola ismini yozing 🙂'); return; }
    setLoading(true); setError(''); setTale(null); stopSpeak();
    try {
      const res = await fetch('/api/magazine/kids/tale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childName, age, favorite, lang }),
      });
      const data = await res.json();
      if (res.ok && data.story) {
        setTale({ title: data.title, story: data.story });
        // Дать печать в паспорт
        earnStamp();
      }
      else setError(data.error || (lang === 'ru' ? 'Что-то пошло не так' : 'Xatolik yuz berdi'));
    } catch { setError(lang === 'ru' ? 'Нет связи со сказочником' : 'Aloqa yo\'q'); }
    finally { setLoading(false); }
  };

  const earnStamp = () => {
    try {
      const raw = localStorage.getItem(PASSPORT_KEY);
      if (raw) {
        const passport = JSON.parse(raw);
        if (!passport.achievements?.includes('tale')) {
          passport.achievements = [...(passport.achievements || []), 'tale'];
          localStorage.setItem(PASSPORT_KEY, JSON.stringify(passport));
          setStampEarned(true);
        }
      }
    } catch { /* ok */ }
  };

  const speak = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !tale) return;
    stopSpeak();
    const u = new SpeechSynthesisUtterance(`${tale.title}. ${tale.story}`);
    u.lang = lang === 'uz' ? 'uz-UZ' : 'ru-RU';
    u.rate = 0.95; u.pitch = 1.1;
    u.onend = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };

  const stopSpeak = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  const i18n = {
    ru: {
      back: '← Fresh Kids',
      title: '📖 Нейро-сказка',
      sub: 'Росточек придумает историю специально для твоего ребёнка.',
      name: 'Имя ребёнка *',
      age: 'Возраст',
      fav: 'Что любит (динозавры, футбол…)',
      gen: '✨ Сочинить сказку',
      genLoading: '✨ Сочиняю…',
      read: '🔊 Читать вслух',
      stop: '⏹ Стоп',
      again: '🎲 Ещё сказку',
      share: '📋 Скопировать',
      copied: '✓ Скопировано!',
      stamp: '⭐ Печать «Послушал нейро-сказку» получена!',
      passport: 'Открыть паспорт →',
    },
    uz: {
      back: '← Fresh Kids',
      title: '📖 Neuro-ertak',
      sub: 'Rostochek bolangiz uchun maxsus hikoya o\'ylab topadi.',
      name: 'Bola ismi *',
      age: 'Yoshi',
      fav: 'Nimani yaxshi ko\'radi (dinozavr, futbol…)',
      gen: '✨ Ertak yaratish',
      genLoading: '✨ Yozilmoqda…',
      read: '🔊 Ovoz bilan o\'qish',
      stop: '⏹ To\'xtatish',
      again: '🎲 Yana ertak',
      share: '📋 Nusxalash',
      copied: '✓ Nusxalandi!',
      stamp: '⭐ «Neuro-ertak tingladi» tamg\'asi olindi!',
      passport: 'Pasportni ochish →',
    },
  };
  const t = i18n[lang];

  const [copied, setCopied] = useState(false);
  const copyTale = () => {
    if (!tale) return;
    navigator.clipboard.writeText(`${tale.title}\n\n${tale.story}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)', padding: '90px 20px 80px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Link href="/magazine/kids" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 }}>{t.back}</Link>

          {/* Переключатель языка */}
          <div style={{
            display: 'flex', gap: 4, padding: 3,
            background: 'var(--bg-elevated, rgba(255,255,255,0.05))',
            borderRadius: 20, border: '1px solid var(--border, #eee)',
          }}>
            {(['ru', 'uz'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)} style={{
                padding: '4px 12px', borderRadius: 16,
                border: 'none', cursor: 'pointer',
                fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
                background: lang === l ? 'var(--brand-primary, #3a7a32)' : 'transparent',
                color: lang === l ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.2s',
              }}>{l === 'ru' ? '🇷🇺 Рус' : '🇺🇿 O\'zb'}</button>
            ))}
          </div>
        </div>

        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(30px, 6vw, 46px)', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px' }}>{t.title}</h1>
        <p style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', marginBottom: 24 }}>{t.sub}</p>

        <form onSubmit={generate} style={{
          display: 'grid', gap: 12,
          background: 'var(--bg-elevated, #fff)', padding: 20, borderRadius: 20,
          border: '1px solid var(--border, #eee)',
          boxShadow: 'var(--shadow-md, 0 4px 20px rgba(0,0,0,0.06))',
        }}>
          <input value={childName} onChange={e => setChildName(e.target.value)} placeholder={t.name} style={inp} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <input value={age} onChange={e => setAge(e.target.value)} placeholder={t.age} inputMode="numeric" style={inp} />
            <input value={favorite} onChange={e => setFavorite(e.target.value)} placeholder={t.fav} style={inp} />
          </div>
          <button type="submit" disabled={loading} style={{
            background: 'var(--brand-primary, #3a7a32)', color: '#fff',
            border: 'none', borderRadius: 30, padding: '14px',
            fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'opacity 0.2s',
          }}>
            {loading ? t.genLoading : t.gen}
          </button>
          {error && <div style={{ color: 'var(--error, #e11)', fontFamily: "'Inter', sans-serif", fontSize: 14 }}>{error}</div>}
        </form>

        {tale && (
          <article style={{
            marginTop: 28, background: 'var(--bg-elevated, #fff)',
            padding: 28, borderRadius: 20,
            border: '1px solid var(--border, #eee)',
            boxShadow: 'var(--shadow-md, 0 4px 20px rgba(0,0,0,0.06))',
            animation: 'fadeIn 0.5s ease',
          }}>
            <h2 style={{
              fontFamily: "'Playfair Display', serif", fontSize: 28,
              fontWeight: 800, color: 'var(--text-primary)', marginBottom: 16,
            }}>{tale.title}</h2>
            <div style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 20, lineHeight: 1.7,
              color: 'var(--text-primary)', whiteSpace: 'pre-line',
            }}>{tale.story}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
              <button onClick={speaking ? stopSpeak : speak} style={actionBtn}>
                {speaking ? t.stop : t.read}
              </button>
              <button onClick={copyTale} style={{ ...actionBtn, background: '#7c3aed' }}>
                {copied ? t.copied : t.share}
              </button>
              <button onClick={() => generate()} style={{
                ...actionBtn, background: 'transparent', color: 'var(--text-primary)',
                border: '1px solid var(--border, #ccc)',
              }}>{t.again}</button>
            </div>
          </article>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: '1px solid var(--border, #ddd)',
  fontFamily: "'Inter', sans-serif", fontSize: 16,
  background: 'var(--bg-primary, #fff)', color: 'var(--text-primary)',
};

const actionBtn: React.CSSProperties = {
  background: 'var(--brand-primary, #3a7a32)', color: '#fff',
  border: 'none', borderRadius: 30, padding: '10px 20px',
  fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700,
  cursor: 'pointer', transition: 'all 0.2s',
};
