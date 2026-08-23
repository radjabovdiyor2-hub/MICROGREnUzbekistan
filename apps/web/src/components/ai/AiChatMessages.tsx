'use client';

import { CheckCircle, Copy, Share2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RefObject } from 'react';
import { SUGGESTIONS, TypingIndicator, renderMarkdown } from './aiChatParts';
import { QUICK_ACTIONS, type QuickActionId, type Message } from './aiChatConfig';
import { tint } from '@/lib/tint';

// Лента сообщений ИИ-чата: ответы, потоковый текст, быстрые действия и
// подсказки. Вынесено из AiChatWidget: файл перерос 200 строк.

interface Props {
  messages: Message[];
  isLoading: boolean;
  streamText: string;
  copiedId: string | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onCopy: (msg: Message) => void;
  onShare: (msg: Message) => void;
  onQuickAction: (id: QuickActionId) => void;
  onSuggestion: (text: string) => void;
}

export function AiChatMessages({
  messages, isLoading, streamText, copiedId, messagesEndRef,
  onCopy, onShare, onQuickAction, onSuggestion,
}: Props) {
  return (
  <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
    <AnimatePresence initial={false}>
      {messages.map((msg) => (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end' }}
        >
        {/* Avatar */}
        {msg.role === 'assistant' && (
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--cat-1), var(--cat-2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px color-mix(in srgb, var(--cat-1) 20%, transparent)',
          }}>
            <Sparkles size={13} color="white" />
          </div>
        )}

        <div style={{ maxWidth: '80%' }}>
          <div style={{
            padding: '10px 14px',
            background: msg.role === 'user' ? 'var(--brand-primary)' : 'var(--bg-secondary)',
            color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
            borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            fontSize: 'var(--text-sm)', lineHeight: 1.55,
            boxShadow: msg.role === 'user' ? '0 2px 8px rgba(var(--brand-primary-rgb), 0.2)' : 'none',
          }}>
            {msg.imageUrl && <img src={msg.imageUrl} alt="Upload" style={{ width: '100%', borderRadius: 8, marginBottom: 8, maxHeight: 180, objectFit: 'cover' }} />}
            <div style={{ whiteSpace: 'pre-wrap' }}>{renderMarkdown(msg.content)}</div>
          </div>
          {/* Actions for AI messages */}
          {msg.role === 'assistant' && msg.id !== '1' && (
            <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
              <button onClick={() => onCopy(msg)} title="Nusxa"
                style={{ background: 'none', border: 'none', color: copiedId === msg.id ? 'var(--success)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, transition: 'all 0.15s' }}>
                {copiedId === msg.id ? <><CheckCircle size={11} /> Nusxalandi</> : <><Copy size={11} /> Nusxa</>}
              </button>
              <button onClick={() => onShare(msg)} title="Ulashish"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6 }}>
                <Share2 size={11} /> Ulashish
              </button>
            </div>
          )}
        </div>
      </motion.div>
    ))}
    </AnimatePresence>

    {/* Streaming text */}
    {streamText && (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--cat-1), var(--cat-2))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={13} color="white" />
        </div>
        <div style={{
          maxWidth: '80%', padding: '10px 14px',
          background: 'var(--bg-secondary)', borderRadius: '16px 16px 16px 4px',
          fontSize: 'var(--text-sm)', lineHeight: 1.55,
        }}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{renderMarkdown(streamText)}</div>
          <span style={{ display: 'inline-block', width: 2, height: 14, background: 'var(--brand-primary)', animation: 'pulse 0.8s infinite', verticalAlign: 'text-bottom', marginLeft: 2 }} />
        </div>
      </div>
    )}

    {/* Typing indicator */}
    {isLoading && <TypingIndicator />}

    <div ref={messagesEndRef} />

    {/* Quick Actions + Suggestions */}
    {messages.length <= 1 && !isLoading && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        {/* Quick Actions Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {QUICK_ACTIONS.map((qa) => (
            <button key={qa.id} onClick={() => onQuickAction(qa.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '12px 4px', borderRadius: 12, cursor: 'pointer',
                background: `${tint(qa.color, 6)}`, border: `1.5px solid ${tint(qa.color, 15)}`,
                color: qa.color, fontSize: 10, fontWeight: 700,
                transition: 'all 0.2s',
              }}>
              {qa.icon}
              <span>{qa.label}</span>
            </button>
          ))}
        </div>
        {/* Suggestion chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {SUGGESTIONS.map((s) => (
          <button key={s.text} onClick={() => onSuggestion(s.text)}
            style={{
              padding: '7px 12px', fontSize: 11, fontWeight: 600,
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              border: '1.5px solid var(--border)', borderRadius: 20,
              cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--brand-primary)'; e.currentTarget.style.background = 'var(--brand-primary-light)'; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}>
            <span>{s.icon}</span> {s.text}
          </button>
        ))}
        </div>
      </div>
    )}
  </div>
  );
}
