'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Calculator, Camera, CheckCircle, Copy, Leaf, Mic, MicOff, Phone, Send, Share2, Sparkles, Trash, X,
} from 'lucide-react';
import { useCart } from '@/components/providers/CartProvider';
import { QuickCalcPanel } from './QuickCalc';
import { useAuth } from '@/components/providers/AuthProvider';
import { triggerHaptic } from '@/utils/haptic';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  timestamp: number;
}

type ChatMode = 'chat' | 'tools';

const SUGGESTIONS = [
  { icon: '', text: "Qanday qilib rukkola o'stiriladi?" },
  { icon: '', text: "pH darajasini qanday o'lchash kerak?" },
  { icon: '', text: "Fitolampa qancha vaqt yonishi kerak?" },
  { icon: '', text: "Gidroponikada suv almashtirish" },
  { icon: '', text: "Rasmdan o'simlik kasalligini aniqlash" },
  { icon: '', text: "Biznes uchun hosildorlikni hisoblash" },
];

// Simple markdown: **bold**, `code`, \n
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`'))
        return <code key={j} style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em' }}>{part.slice(1, -1)}</code>;
      return part;
    });
    return <span key={i}>{parts}{i < lines.length - 1 && <br />}</span>;
  });
}

// Typing indicator with 3 animated dots
function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'flex-start', maxWidth: '85%' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(99,102,241,0.25)',
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

export function AiChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>('chat');
  const cart = useCart();
  const { dbUser } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1', role: 'assistant', timestamp: Date.now(),
      content: "Assalomu alaykum! Men **Microgreen Agro** — mikroko'katlar va gidroponika bo'yicha AI maslahatchiman.\n\nMenga bemalol so'rang:\n- Mikroko'katlar parvarishi\n- Ozuqa va pH balansi\n- Yorug'lik va harorat\n- Rasmdan kasallikni aniqlash\n- Biznes hisob-kitob",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; base64: string; mimeType: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');

  // Quick actions for craftsmen
  const QUICK_ACTIONS = [
    { icon: <Camera size={18} />, label: 'Foto tahlil', color: '#8B5CF6', action: () => fileInputRef.current?.click() },
    { icon: <Leaf size={18} />, label: 'Parvarish', color: '#10B981', action: () => { setInput('Mikroko\'katlarni qanday to\'g\'ri sug\'orish kerak?'); setTimeout(() => document.getElementById("ai-chat-send")?.click(), 50); } },
    { icon: <Calculator size={18} />, label: 'Kalkulyator', color: '#3B82F6', action: () => setMode('tools') },
    { icon: <Phone size={18} />, label: 'Qo\'ng\'iroq', color: '#10B981', action: () => window.open('tel:+998949999599') },
  ];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  // Simulate streaming effect
  const streamResponse = useCallback((fullText: string) => {
    setStreamText('');
    let idx = 0;
    const words = fullText.split(/(\s+)/);
    const interval = setInterval(() => {
      if (idx < words.length) {
        setStreamText(prev => prev + words[idx]);
        idx++;
      } else {
        clearInterval(interval);
        setStreamText('');
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(), role: 'assistant',
          content: fullText, timestamp: Date.now(),
        }]);
      }
    }, 20);
    return () => clearInterval(interval);
  }, []);

  const copyMessage = useCallback(async (msg: Message) => {
    const text = `Microgreen Agro:\n\n${msg.content}\n\nBuyurtma: +998 94 999 95 99\nMicrogreen.uz`;
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea'); ta.value = text;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const shareMessage = useCallback(async (msg: Message) => {
    const text = `Microgreen Agro:\n\n${msg.content}\n\nBuyurtma: +998 94 999 95 99\nMicrogreen.uz`;
    if (navigator.share) {
      try { await navigator.share({ text, title: 'Microgreen Agro' }); } catch { /* cancelled */ }
    } else { copyMessage(msg); }
  }, [copyMessage]);

  const toggleListening = () => {
    if (isListening) { setIsListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Brauzeringiz ovozni qo'llab-quvvatlamaydi"); return; }
    const r = new SR(); r.lang = 'uz-UZ'; r.interimResults = false;
    r.onstart = () => setIsListening(true);
    r.onresult = (e: any) => { setInput(p => p ? `${p} ${e.results[0][0].transcript}` : e.results[0][0].transcript); setIsListening(false); };
    r.onerror = () => setIsListening(false);
    r.onend = () => setIsListening(false);
    r.start();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = (ev.target?.result as string).split(',')[1];
      setImagePreview({ url: URL.createObjectURL(file), base64: b64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = () => {
    if (imagePreview?.url) URL.revokeObjectURL(imagePreview.url);
    setImagePreview(null);
  };

  const sendFromCalc = (text: string) => {
    setInput(text); setMode('chat');
    setTimeout(() => document.getElementById('ai-chat-send')?.click(), 100);
  };

  const clearChat = () => {
    setMessages([{
      id: Date.now().toString(), role: 'assistant', timestamp: Date.now(),
      content: "Yangi suhbat boshlandi! So'rang — yordam beraman.",
    }]);
  };

  const sendMessage = async () => {
    if ((!input.trim() && !imagePreview) || isLoading) return;
    triggerHaptic('light');
    const userContent = input.trim() || 'Rasm';
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userContent, imageUrl: imagePreview?.url, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setIsLoading(true);

    const payload: any = {
      message: userContent,
      history: [...messages].filter(m => m.role !== 'assistant' || m.id !== '1').slice(-10).map(m => ({ role: m.role, content: m.content })),
      userId: dbUser?.id,
      cartItems: cart.items.map(i => ({ name: i.product.nameUz, price: i.product.price, qty: i.quantity })),
    };
    if (imagePreview) { payload.image = { data: imagePreview.base64, mimeType: imagePreview.mimeType }; setImagePreview(null); }

    try {
      const res = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      const reply = data.reply || "Javob topilmadi.";
      setIsLoading(false);
      streamResponse(reply);
    } catch {
      setIsLoading(false);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: "Xatolik yuz berdi. +998 94 999 95 99 ga qo'ng'iroq qiling.", timestamp: Date.now() }]);
    }
  };

  // FAB
  if (!isOpen) {
    return (
      <button className="ai-chat-fab" onClick={() => { setIsOpen(true); triggerHaptic('light'); }} aria-label="Open AI chat" id="ai-chat-fab"
        style={{ position: 'fixed', bottom: 'calc(var(--bottom-nav-height) + var(--space-4))', right: 'var(--space-4)' }}>
        <Sparkles size={24} />
      </button>
    );
  }



  return (
    <div className="ai-chat-panel" id="ai-chat-panel" style={{
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      animation: 'slideUp 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #A855F7 100%)',
        backgroundSize: '200% 200%', animation: 'ai-gradient 8s ease infinite',
        color: 'white', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
          }}>
            <Sparkles size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.2px' }}>Microgreen Agro</div>
            <div style={{ fontSize: 10, opacity: 0.75, fontWeight: 500 }}>
              {isLoading ? 'Yozyapti...' : 'AI Maslahatchi • Online'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setMode(mode === 'tools' ? 'chat' : 'tools')} title="Asboblar"
            style={{ background: mode === 'tools' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, width: 32, height: 32, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
            <Calculator size={15} />
          </button>
          <button onClick={clearChat} title="Tozalash"
            style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, width: 32, height: 32, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
            <Trash size={14} />
          </button>
          <button onClick={() => setIsOpen(false)} id="ai-chat-close" title="Yopish"
            style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, width: 32, height: 32, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Professional Calculator Panel */}
      {mode === 'tools' && <QuickCalcPanel onSendToChat={sendFromCalc} />}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end' }}>
            {/* Avatar */}
            {msg.role === 'assistant' && (
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(99,102,241,0.2)',
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
                  <button onClick={() => copyMessage(msg)} title="Nusxa"
                    style={{ background: 'none', border: 'none', color: copiedId === msg.id ? 'var(--success)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, transition: 'all 0.15s' }}>
                    {copiedId === msg.id ? <><CheckCircle size={11} /> Nusxalandi</> : <><Copy size={11} /> Nusxa</>}
                  </button>
                  <button onClick={() => shareMessage(msg)} title="Ulashish"
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6 }}>
                    <Share2 size={11} /> Ulashish
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming text */}
        {streamText && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
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
              {QUICK_ACTIONS.map((qa, i) => (
                <button key={i} onClick={qa.action}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '12px 4px', borderRadius: 12, cursor: 'pointer',
                    background: `${qa.color}10`, border: `1.5px solid ${qa.color}25`,
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
              <button key={s.text} onClick={() => setInput(s.text)}
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

      {/* Image preview */}
      {imagePreview && (
        <div style={{
          padding: '8px 14px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-secondary)',
        }}>
          <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
            <img src={imagePreview.url} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>Rasm tayyor</span>
          <button onClick={removeImage} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* Input bar */}
      <div style={{
        padding: '10px 12px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 6, alignItems: 'center', background: 'var(--bg-card)', flexShrink: 0,
      }}>
        <button onClick={() => fileInputRef.current?.click()} title="Rasm yuklash"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 6, borderRadius: 8, transition: 'all 0.15s', flexShrink: 0 }}>
          <Camera size={20} />
        </button>
        <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

        <input
          ref={inputRef}
          type="text"
          placeholder={isListening ? "Tinglayapman..." : "Savolingizni yozing..."}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          id="ai-chat-input"
          style={{
            flex: 1, minWidth: 0, padding: '10px 14px',
            border: '1.5px solid var(--border)', borderRadius: 20,
            background: 'var(--bg-secondary)', outline: 'none',
            color: 'var(--text-primary)', fontSize: 'var(--text-sm)',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--brand-primary)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />

        <button onClick={toggleListening} title="Ovoz orqali"
          style={{
            background: isListening ? 'var(--error)' : 'none', border: 'none',
            color: isListening ? 'white' : 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', padding: 6, borderRadius: isListening ? '50%' : 8,
            transition: 'all 0.2s', flexShrink: 0,
            animation: isListening ? 'pulse 1s infinite' : 'none',
            width: isListening ? 34 : 'auto', height: isListening ? 34 : 'auto',
            alignItems: 'center', justifyContent: 'center',
          }}>
          {isListening ? <MicOff size={16} /> : <Mic size={20} />}
        </button>

        <button className="btn btn-primary btn-sm" onClick={sendMessage}
          disabled={isLoading || (!input.trim() && !imagePreview)} id="ai-chat-send"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 14px', height: 36, borderRadius: 18, flexShrink: 0,
            opacity: (isLoading || (!input.trim() && !imagePreview)) ? 0.5 : 1,
            transition: 'all 0.15s',
          }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
