'use client';

import { BatteryWarning } from 'lucide-react';

import { openNativeSettings } from '@/lib/native/geo';

// ══════════════════════════════════════════════════════════════════════
// Две причины, по которым трек рвётся ТОЛЬКО в приложении.
//
// Браузер глохнет с погашенным экраном — об этом говорит строка под
// кнопкой смены. У приложения граница другая, и её две:
//
//   · БАТАРЕЯ. Xiaomi, Redmi и Samsung по умолчанию усыпляют фоновые
//     службы, и постоянное уведомление их не спасает. Починить можно
//     только руками — «Батарея → Без ограничений», — поэтому рядом кнопка,
//     которая открывает ровно эти настройки;
//   · СМАХНУТОЕ ПРИЛОЖЕНИЕ. Модуль геопозиции снимает службу, когда
//     приложение выгружают из недавних, и сайт этого не переживает. Пока
//     своей родной службы нет, честнее предупредить, чем молча терять
//     полдня трека.
//
// Рисуется только в приложении и только при открытой смене: в браузере
// эти советы неверны, а без смены — не к чему.
// ══════════════════════════════════════════════════════════════════════

const text = {
  battery: {
    ru: 'Трек рвётся? Батарея → «Без ограничений»',
    uz: 'Trek uzilyaptimi? Batareya → «Cheklovsiz»',
  },
  batterySettings: { ru: 'Открыть настройки', uz: 'Sozlamalarni ochish' },
  noSwipe: {
    ru: 'Не смахивайте приложение из недавних — запись остановится',
    uz: 'Ilovani soʻnggi ilovalar roʻyxatidan surib yopmang — yozuv toʻxtaydi',
  },
};

export function FieldAppHints({ lang }: { lang: 'ru' | 'uz' }) {
  const t = (key: keyof typeof text) => text[key][lang];

  return (
    <>
      <span
        style={{
          display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap',
          fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
        }}
      >
        <BatteryWarning size={14} /> {t('battery')}
        <button className="btn btn-ghost btn-sm" onClick={() => openNativeSettings()}>
          {t('batterySettings')}
        </button>
      </span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {t('noSwipe')}
      </span>
    </>
  );
}
