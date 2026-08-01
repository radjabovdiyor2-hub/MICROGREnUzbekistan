'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useCart } from '@/components/providers/CartProvider';
import { QuickCalcPanel } from './QuickCalc';
import { useAuth } from '@/components/providers/AuthProvider';
import { triggerHaptic } from '@/utils/haptic';
import { motion, AnimatePresence } from 'framer-motion';
import { AiChatFab } from './AiChatFab';
import { AiChatHeader } from './AiChatHeader';
import { AiChatMessages } from './AiChatMessages';
import { AiChatInput } from './AiChatInput';
import { type Message, type ChatMode, type QuickActionId } from './aiChatConfig';
import { copyToClipboard, shareMessageText, startSpeechRecognition } from './aiChatActions';


export function AiChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>('chat');
  const cart = useCart();
  const { dbUser } = useAuth();
  const [messages, setMessages] = useState<Message[]>(() => [
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runQuickAction = (id: QuickActionId) => {
    switch (id) {
      case 'photo':
        fileInputRef.current?.click();
        break;
      case 'care':
        setInput("Mikroko'katlarni qanday to'g'ri sug'orish kerak?");
        setTimeout(() => document.getElementById('ai-chat-send')?.click(), 50);
        break;
      case 'calc':
        setMode('tools');
        break;
      case 'call':
        window.open('tel:+998949999599');
        break;
    }
  };

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
    await copyToClipboard(msg);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const shareMessage = useCallback((msg: Message) => shareMessageText(msg), []);

  const toggleListening = () => {
    if (isListening) { setIsListening(false); return; }
    const started = startSpeechRecognition(
      () => setIsListening(true),
      (text) => setInput(p => p ? `${p} ${text}` : text),
      () => setIsListening(false),
    );
    if (!started) alert("Brauzeringiz ovozni qo'llab-quvvatlamaydi");
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

    const payload: Record<string, unknown> = {
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

  if (!isOpen) return <AiChatFab onOpen={() => setIsOpen(true)} />;

  return (
    <AnimatePresence>
      <motion.div
        className="ai-chat-panel"
        id="ai-chat-panel"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 260 }}
        style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
      {/* Header */}
      <AiChatHeader mode={mode} setMode={setMode} isLoading={isLoading}
        onClear={clearChat} onClose={() => setIsOpen(false)} />

      {/* Professional Calculator Panel */}
      {mode === 'tools' && <QuickCalcPanel onSendToChat={sendFromCalc} />}

      {/* Messages */}
      <AiChatMessages
        messages={messages} isLoading={isLoading} streamText={streamText}
        copiedId={copiedId} messagesEndRef={messagesEndRef}
        onCopy={copyMessage} onShare={shareMessage}
        onQuickAction={runQuickAction} onSuggestion={setInput} />

      <AiChatInput
        input={input} setInput={setInput} isLoading={isLoading} isListening={isListening}
        imagePreview={imagePreview} inputRef={inputRef} fileInputRef={fileInputRef}
        onFileChange={handleFileChange} onRemoveImage={removeImage}
        onToggleListening={toggleListening} onSend={sendMessage} />
    </motion.div>
    </AnimatePresence>
  );
}
