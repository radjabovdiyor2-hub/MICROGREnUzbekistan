'use client';

import { useEffect, useRef, useState } from 'react';
import { AdminStepanHeader } from './AdminStepanHeader';
import { type Proposal } from './AdminStepanProposal';
import { AdminStepanChatList, type Msg } from './AdminStepanChatList';
import { AdminStepanInput } from './AdminStepanInput';

export function AdminStepan({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

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

      <AdminStepanChatList
        messages={messages}
        busy={busy}
        error={error}
        send={send}
        confirm={confirm}
        reject={reject}
        lang={lang}
        t={t}
        bottomRef={bottomRef}
      />

      <AdminStepanInput input={input} setInput={setInput} busy={busy} send={send} t={t} />
    </div>
  );
}
