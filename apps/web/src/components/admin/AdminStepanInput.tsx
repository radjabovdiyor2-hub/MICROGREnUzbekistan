'use client';

import React, { useState } from 'react';
import { Mic, Send } from 'lucide-react';

interface Props {
  input: string;
  setInput: (v: string | ((p: string) => string)) => void;
  busy: boolean;
  send: (text: string) => void;
  t: (ru: string, uz: string) => string;
}

export function AdminStepanInput({ input, setInput, busy, send, t }: Props) {
  const [isListening, setIsListening] = useState(false);

  const toggleListening = () => {
    if (isListening) { setIsListening(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert(t('Ваш браузер не поддерживает голосовой ввод', "Brauzeringiz ovozli kiritishni qo'llab-quvvatlamaydi"));
      return;
    }
    const r = new SR(); r.lang = 'ru-RU'; r.interimResults = false;
    r.onstart = () => setIsListening(true);
    r.onresult = (e: SpeechRecognitionEvent) => {
      setInput(p => p ? `${p} ${e.results[0][0].transcript}` : e.results[0][0].transcript);
      setIsListening(false);
    };
    r.onerror = () => setIsListening(false);
    r.onend = () => setIsListening(false);
    r.start();
  };

  return (
    <form
      onSubmit={e => { e.preventDefault(); send(input); }}
      style={{ display: 'flex', gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg-primary)', paddingTop: 8 }}
    >
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={t('Спросите или поручите…', "So'rang yoki topshiring…")}
        disabled={busy}
        style={{
          flex: 1, padding: '12px 14px', border: '1.5px solid var(--border)',
          borderRadius: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)',
          fontSize: 'var(--text-sm)', outline: 'none',
        }}
      />
      <button
        type="button"
        onClick={toggleListening}
        disabled={busy}
        title={t('Голосовой ввод', 'Ovozli kiritish')}
        className="btn btn-ghost"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '12px', borderRadius: 12,
          color: isListening ? 'var(--error)' : 'var(--text-secondary)',
          background: isListening ? 'var(--error-bg)' : 'transparent',
          border: isListening ? '1.5px solid var(--error)' : '1.5px solid var(--border)',
        }}
      >
        <Mic size={16} />
      </button>
      <button type="submit" disabled={busy || !input.trim()} className="btn btn-primary"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Send size={16} /> {t('Отправить', 'Yuborish')}
      </button>
    </form>
  );
}
