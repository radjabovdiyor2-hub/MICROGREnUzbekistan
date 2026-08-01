'use client';

import React from 'react';

interface Props {
  shotUrl: string;
  accent: string;
  guestName: string;
  setGuestName: (v: string) => void;
  consent: boolean;
  setConsent: (v: boolean) => void;
  sending: boolean;
  error: string | null;
  share: () => void;
  submit: () => void;
  btnStyle: (bg: string, color?: string) => React.CSSProperties;
}

export function FrameStudioPreview({
  shotUrl, accent, guestName, setGuestName, consent, setConsent, sending, error, share, submit, btnStyle,
}: Props) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '20px 16px 40px' }}>
      <img
        src={shotUrl}
        alt="Ваш кадр"
        style={{ width: '100%', maxWidth: 380, margin: '0 auto', display: 'block', borderRadius: 16 }}
      />
      <div style={{ maxWidth: 380, margin: '18px auto 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={share} style={btnStyle(accent)}>📤 Сохранить / поделиться</button>

        <div style={{
          padding: 16, borderRadius: 16, background: 'rgba(var(--overlay-light-rgb), 0.06)',
          border: '1px solid rgba(var(--overlay-light-rgb), 0.1)',
        }}>
          <div style={{ color: 'var(--text-inverse)', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            Хотите в следующий номер?
          </div>
          <p style={{ color: 'rgba(var(--overlay-light-rgb), 0.6)', fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
            Лучшие кадры недели печатаем в журнале FRESH WEEKLY с именем автора.
          </p>
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Как вас подписать"
            maxLength={40}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 12, marginBottom: 10,
              background: 'rgba(var(--overlay-dark-rgb), 0.35)', border: '1px solid rgba(var(--overlay-light-rgb), 0.15)',
              color: 'var(--text-inverse)', fontSize: 14, fontFamily: 'inherit',
            }}
          />
          <label style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            color: 'rgba(var(--overlay-light-rgb), 0.7)', fontSize: 12, lineHeight: 1.5, cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            Согласен на публикацию кадра в журнале и на странице ресторана
          </label>
          <button
            onClick={submit}
            disabled={!consent || sending}
            style={{ ...btnStyle(consent ? accent : 'rgba(var(--overlay-light-rgb), 0.12)'), marginTop: 12, opacity: consent ? 1 : 0.6 }}
          >
            {sending ? 'Отправляем...' : '✨ Отправить в журнал'}
          </button>
        </div>

        <button onClick={() => window.location.reload()} style={btnStyle('transparent', accent)}>
          🔄 Снять заново
        </button>
        {error && <p style={{ color: 'var(--error)', fontSize: 13, textAlign: 'center' }}>{error}</p>}
      </div>
    </div>
  );
}
