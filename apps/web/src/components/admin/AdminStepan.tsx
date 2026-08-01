'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Mic, Send } from 'lucide-react';
import { AdminStepanHeader, STEPAN_SUGGESTIONS } from './AdminStepanHeader';
import { AdminStepanProposal, type Proposal } from './AdminStepanProposal';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  proposals?: Proposal[];
  /** Результат подтверждения по индексу предложения. */
  done?: Record<number, { ok: boolean; text: string }>;
}

export function AdminStepan({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [isListening, setIsListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const toggleListening = () => {
    if (isListening) { setIsListening(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert(t('Ваш браузер не поддерживает голосовой ввод', 'Brauzeringiz ovozli kiritishni qo\'llab-quvvatlamaydi'));
      return;
    }
    const r = new SR(); r.lang = 'ru-RU'; r.interimResults = false;
    r.onstart = () => setIsListening(true);
    r.onresult = (e: SpeechRecognitionEvent) => { setInput(p => p ? `${p} ${e.results[0][0].transcript}` : e.results[0][0].transcript); setIsListening(false); };
    r.onerror = () => setIsListening(false);
    r.onend = () => setIsListening(false);
    r.start();
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetch('/api/admin/stepan/memory', { credentials: 'same-origin' });
        const data = await res.json();
        if (res.ok && Array.isArray(data.messages)) {
          setMessages(
            data.messages.map((m: { role: string; content: string }) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content,
              proposals: [],
              done: {},
            })),
          );
        }
      } catch {
        // Молчим: пустой разговор — рабочее состояние.
      }
    };
    loadHistory();
  }, []);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;

    const next: Msg[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/admin/stepan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('Стёпан не ответил', 'Stepan javob bermadi'));
        return;
      }

      setMessages([...next, {
        role: 'assistant',
        content: data.reply || '',
        proposals: data.proposals ?? [],
        done: {},
      }]);

      if (data.memoryWarning) setError(data.memoryWarning);
    } catch {
      setError(t('Ошибка сети', 'Tarmoq xatosi'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (msgIndex: number, propIndex: number, proposal: Proposal) => {
    setMessages(prev => {
      const copy = [...prev];
      const msg = { ...copy[msgIndex] };
      msg.done = { ...(msg.done ?? {}), [propIndex]: { ok: true, text: t('Выполняется…', 'Bajarilmoqda…') } };
      copy[msgIndex] = msg;
      return copy;
    });

    try {
      const res = await fetch('/api/admin/stepan/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token: proposal.token }),
      });
      const data = await res.json();

      setMessages(prev => {
        const copy = [...prev];
        const msg = { ...copy[msgIndex] };
        msg.done = {
          ...(msg.done ?? {}),
          [propIndex]: res.ok
            ? { ok: true, text: data.message || t('Выполнено', 'Bajarildi') }
            : { ok: false, text: data.error || t('Не выполнено', 'Bajarilmadi') },
        };
        copy[msgIndex] = msg;
        return copy;
      });
    } catch {
      setMessages(prev => {
        const copy = [...prev];
        const msg = { ...copy[msgIndex] };
        msg.done = { ...(msg.done ?? {}), [propIndex]: { ok: false, text: t('Ошибка сети', 'Tarmoq xatosi') } };
        copy[msgIndex] = msg;
        return copy;
      });
    }
  };

  const reject = (msgIndex: number, propIndex: number) => {
    setMessages(prev => {
      const copy = [...prev];
      const msg = { ...copy[msgIndex] };
      msg.done = { ...(msg.done ?? {}), [propIndex]: { ok: false, text: t('Отклонено', 'Rad etildi') } };
      copy[msgIndex] = msg;
      return copy;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', height: '100%' }}>
      <AdminStepanHeader lang={lang} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minHeight: 200 }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {STEPAN_SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)} className="btn btn-outline btn-sm"
                style={{ borderRadius: 999, fontSize: 'var(--text-xs)' }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%', padding: '10px 14px', borderRadius: 14,
              background: m.role === 'user' ? 'var(--brand-primary)' : 'var(--bg-secondary)',
              color: m.role === 'user' ? 'rgb(var(--overlay-light-rgb))' : 'var(--text-primary)',
              fontSize: 'var(--text-sm)', lineHeight: 1.55, whiteSpace: 'pre-wrap',
            }}>
              {m.content}
            </div>

            {m.proposals?.map((p, pi) => (
              <AdminStepanProposal
                key={pi}
                proposal={p}
                result={m.done?.[pi]}
                onConfirm={() => confirm(i, pi, p)}
                onReject={() => reject(i, pi)}
                lang={lang}
              />
            ))}
          </div>
        ))}

        {busy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            {t('Стёпан смотрит данные…', 'Stepan ma\'lumotlarni ko\'rmoqda…')}
          </div>
        )}

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
            borderRadius: 10, background: 'var(--error-bg)', color: 'var(--error)',
            fontSize: 'var(--text-sm)', fontWeight: 600,
          }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

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
    </div>
  );
}
