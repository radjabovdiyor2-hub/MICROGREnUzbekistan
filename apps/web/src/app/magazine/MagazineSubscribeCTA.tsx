import React from 'react';

export function MagazineSubscribeCTA() {
  return (
    <section style={{
      maxWidth: '700px', margin: '0 auto', padding: '0 20px 80px',
      textAlign: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(var(--brand-primary-rgb), 0.1), rgba(var(--brand-primary-rgb), 0.05))',
        border: '1px solid rgba(var(--brand-primary-rgb), 0.2)',
        borderRadius: '24px', padding: '40px 32px',
      }}>
        <h3 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: '28px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)'
        }}>
          Хотите бумажную версию?
        </h3>
        <p style={{
          fontSize: '15px', color: 'var(--text-secondary)',
          lineHeight: 1.6, marginBottom: '24px', maxWidth: '450px', margin: '0 auto 24px',
        }}>
          Премиум-печать на плотной бумаге, 12 страниц A5.
          Закажите через Telegram и получите с доставкой.
        </p>
        <a
          href="https://t.me/fresh_weekly_uz"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '16px 32px', borderRadius: '30px',
            background: 'var(--social-telegram-bright)', color: 'var(--text-inverse)',
            fontWeight: 700, fontSize: '15px', textDecoration: 'none',
            boxShadow: '0 8px 24px color-mix(in srgb, var(--social-telegram-bright) 30%, transparent)',
          }}
        >
          📲 Заказать в Telegram
        </a>
      </div>
    </section>
  );
}
