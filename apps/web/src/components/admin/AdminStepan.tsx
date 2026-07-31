'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Brain, CheckCircle2, Loader2, Send, ShieldAlert, X,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Стёпан внутри админки.
//
// Тот же Стёпан, что в Telegram: одна база, одна шина задач. Разница
// только в интерфейсе — здесь он видит те же данные и может предлагать
// действия.
//
// Ключевое правило интерфейса: действие, меняющее данные, НИКОГДА не
// выполняется само. Стёпан показывает карточку «было → стало», и пока
// владелец не нажмёт «Выполнить», в базе ничего не меняется.
// ══════════════════════════════════════════════════════════════════════

interface Proposal {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  before?: string;
  after?: string;
  risky?: boolean;
  token: string;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  proposals?: Proposal[];
  /** Результат подтверждения по индексу предложения. */
  done?: Record<number, { ok: boolean; text: string }>;
}

const SUGGESTIONS = [
  'Как дела с продажами сегодня?',
  'Что заканчивается на складе?',
  'Все ли боты живы?',
  'Покажи прибыль за месяц',
  'Сколько потратили на ИИ?',
];

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

  // История приезжает с сервера, а не живёт в состоянии компонента: раньше
  // перезагрузка вкладки стирала весь разговор, а начатое в Telegram здесь
  // вообще не было видно.
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
        // Молчим: пустой разговор — рабочее состояние, а о недоступности
        // памяти Стёпан скажет сам при первом же ответе (memoryWarning).
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
        // Отправляем только роль и текст: предложения и результаты —
        // состояние интерфейса, модели они не нужны.
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

      // Ответ без памяти внешне неотличим от ответа с памятью — поэтому
      // говорим об этом прямо, а не оставляем владельца гадать.
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
      <div className="card" style={{
        padding: 'var(--space-5)', borderRadius: '18px',
        borderTop: '3px solid var(--brand-primary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: 'var(--brand-primary-light)', color: 'var(--brand-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={22} />
          </div>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>
              {t('Стёпан — операционный директор', 'Stepan — operatsion direktor')}
            </h3>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {t(
                'Видит заказы, склад, финансы и ботов. Действия выполняет только после вашего подтверждения.',
                'Buyurtma, ombor, moliya va botlarni ko\'radi. Amallarni faqat tasdiqlaganingizdan keyin bajaradi.',
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Лента диалога */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minHeight: 200 }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SUGGESTIONS.map(s => (
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
              color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
              fontSize: 'var(--text-sm)', lineHeight: 1.55, whiteSpace: 'pre-wrap',
            }}>
              {m.content}
            </div>

            {m.proposals?.map((p, pi) => {
              const result = m.done?.[pi];
              return (
                <div key={pi} className="card" style={{
                  padding: 'var(--space-4)', borderRadius: 14, maxWidth: '85%',
                  borderLeft: `3px solid ${p.risky ? 'var(--warning)' : 'var(--brand-primary)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {p.risky
                      ? <ShieldAlert size={16} style={{ color: 'var(--warning)' }} />
                      : <CheckCircle2 size={16} style={{ color: 'var(--brand-primary)' }} />}
                    <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{p.summary}</span>
                  </div>

                  {(p.before || p.after) && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                      padding: '8px 10px', borderRadius: 10, background: 'var(--bg-secondary)',
                      fontSize: 'var(--text-sm)', marginBottom: 10,
                    }}>
                      {p.before && <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>{p.before}</span>}
                      {p.before && p.after && <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />}
                      {p.after && <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{p.after}</span>}
                    </div>
                  )}

                  {p.risky && !result && (
                    <p style={{ fontSize: '11px', color: 'var(--warning)', marginBottom: 8 }}>
                      {t('Это увидят клиенты сразу после подтверждения.',
                         'Bu mijozlarga darhol ko\'rinadi.')}
                    </p>
                  )}

                  {result ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)',
                      fontWeight: 600, color: result.ok ? 'var(--success)' : 'var(--text-muted)',
                    }}>
                      {result.ok ? <CheckCircle2 size={15} /> : <X size={15} />} {result.text}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => confirm(i, pi, p)} className="btn btn-primary btn-sm">
                        {t('Выполнить', 'Bajarish')}
                      </button>
                      <button onClick={() => reject(i, pi)} className="btn btn-ghost btn-sm">
                        {t('Отклонить', 'Rad etish')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
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

      {/* Ввод */}
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
        <button type="submit" disabled={busy || !input.trim()} className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Send size={16} /> {t('Отправить', 'Yuborish')}
        </button>
      </form>
    </div>
  );
}
