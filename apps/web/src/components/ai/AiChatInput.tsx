'use client';

import { Camera, Mic, MicOff, Send, X } from 'lucide-react';
import type { RefObject } from 'react';

// Превью снимка и строка ввода ИИ-чата. Вынесено из AiChatWidget.

interface Props {
  input: string;
  setInput: (v: string) => void;
  isLoading: boolean;
  isListening: boolean;
  imagePreview: { url: string; base64: string; mimeType: string } | null;
  inputRef: RefObject<HTMLInputElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  onToggleListening: () => void;
  onSend: () => void;
}

export function AiChatInput({
  input, setInput, isLoading, isListening, imagePreview,
  inputRef, fileInputRef, onFileChange, onRemoveImage, onToggleListening, onSend,
}: Props) {
  return (
    <>
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
      <button onClick={onRemoveImage} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: 4, display: 'flex' }}>
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
    <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={onFileChange} />

    <input
      ref={inputRef}
      type="text"
      placeholder={isListening ? "Tinglayapman..." : "Savolingizni yozing..."}
      value={input}
      onChange={e => setInput(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && onSend()}
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

    <button onClick={onToggleListening} title="Ovoz orqali"
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

    <button className="btn btn-primary btn-sm" onClick={onSend}
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
    </>
  );
}
