'use client';

import { MapPin, X } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// «Сейчас ставим пин» — плашка поверх карты.
//
// ЧЕГО НЕ БЫЛО. Режим простановки объявлялся только в лотке «Без
// координат», и только для тех, кто в этом лотке лежит. У клиента, у
// которого координата УЖЕ есть, лотка нет — значит нажатие «Переставить
// пин» не показывало ничего вообще. На компьютере оставался курсор-крест,
// на телефоне — ни курсора, ни подсказки, ни выхода: человек тыкал в
// карту, ничего не происходило (см. mapClick.ts), и режим не снимался.
//
// Плашка живёт в оверлее сцены, а не в потоке над картой: в полном экране
// поток не виден, а бросать человека без выхода именно там опаснее всего.
// ══════════════════════════════════════════════════════════════════════

const label = {
  title: { ru: 'Куда поставить пин?', uz: 'Pin qayerga?' },
  hint: {
    ru: 'Ткните карту в нужном месте — точка переедет туда.',
    uz: 'Xaritada kerakli joyni bosing — nuqta oʻsha yerga koʻchadi.',
  },
  chain: {
    ru: 'Дальше сам откроется следующий из очереди.',
    uz: 'Keyingisi navbatdan oʻzi ochiladi.',
  },
  cancel: { ru: 'Отмена', uz: 'Bekor qilish' },
};

export function PlacingBanner({ name, lang, chaining, onCancel }: {
  /** Кому ставим. null — имя ещё не приехало, режим всё равно объявляем. */
  name: string | null;
  lang: 'ru' | 'uz';
  chaining: boolean;
  onCancel: () => void;
}) {
  return (
    <div
      className="card"
      role="status"
      style={{
        padding: 'var(--space-3)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        maxWidth: 'min(420px, 100%)',
        borderColor: 'var(--brand-accent)',
      }}
    >
      <MapPin size={18} style={{ color: 'var(--brand-accent)', flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>
          {label.title[lang]}{name ? ` ${name}` : ''}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          {label.hint[lang]}{chaining ? ` ${label.chain[lang]}` : ''}
        </div>
      </div>

      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={onCancel}
        style={{ flexShrink: 0, minHeight: 40 }}
      >
        <X size={14} /> {label.cancel[lang]}
      </button>
    </div>
  );
}
