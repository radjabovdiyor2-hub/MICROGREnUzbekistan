'use client';

import { Wand2 } from 'lucide-react';

import { useGeocodePass } from './useGeocodePass';

// ══════════════════════════════════════════════════════════════════════
// Запуск геокодера и его прогресс.
//
// Стоит рядом с ручным пином намеренно: автоматика закрывает массу, но
// точность «город» она честно пропускает, и остаток доразмечается руками.
// Два способа — одно место, иначе владелец решит, что автоматика сломалась,
// когда часть клиентов останется в лотке.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  onBatchDone: () => void;
}

const label = {
  run: { ru: 'Найти по адресам', uz: 'Manzil boʻyicha topish' },
  stop: { ru: 'Стоп', uz: 'Toʻxtatish' },
  coarse: { ru: 'только город', uz: 'faqat shahar' },
  noAddress: { ru: 'без адреса', uz: 'manzilsiz' },
};

export function GeocodeControls({ lang, onBatchDone }: Props) {
  const geo = useGeocodePass(onBatchDone);

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '0 var(--space-3) var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        {geo.running ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={geo.stop}>
            {label.stop[lang]}
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => geo.start()}>
            <Wand2 size={14} /> {label.run[lang]}
          </button>
        )}

        {(geo.running || geo.finished) && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {geo.progress.processed} → {geo.progress.placed} ✓
            {geo.progress.tooCoarse > 0 && `, ${geo.progress.tooCoarse} ${label.coarse[lang]}`}
            {geo.progress.noAddress > 0 && `, ${geo.progress.noAddress} ${label.noAddress[lang]}`}
          </span>
        )}
      </div>

      {geo.error && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--error-bg)',
            color: 'var(--error)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {geo.error}
        </div>
      )}
    </>
  );
}
