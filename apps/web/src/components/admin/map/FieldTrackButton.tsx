'use client';

import { Radio, RadioTower } from 'lucide-react';

import { useFieldTracker } from './useFieldTracker';

// ══════════════════════════════════════════════════════════════════════
// «Записывать день» — трек без Telegram.
//
// ЗАЧЕМ, ЕСЛИ ЕСТЬ ТРАНСЛЯЦИЯ. Она остаётся основным способом и одна
// работает с погашенным экраном. Но она требует бота: новый человек не
// начинал с ним диалог, на телефоне может не быть Telegram вовсе, аккаунт
// бывает заблокирован. До сих пор в таком случае дня не было ни одного —
// ни трека, ни километров, ни сверки времени. Теперь есть.
//
// О ГРАНИЦЕ ГОВОРИМ ВСЛУХ, А НЕ ПРЯЧЕМ. Браузер пишет позицию, пока
// вкладка видима: погас экран — Safari замеры замораживает, Chrome сильно
// прореживает. Человек, который об этом не знает, закроет телефон в
// кармане и будет уверен, что смена пишется. Поэтому под кнопкой стоит
// строка про экран, а не мелкий значок.
//
// КНОПКА ВИДНА ТОЛЬКО ТОМУ, КТО ЕЗДИТ. Владельцу она не нужна: он смотрит
// чужие дни, а не пишет свой, и лишняя кнопка «записывать меня» на его
// экране однажды включится случайно.
// ══════════════════════════════════════════════════════════════════════

const text = {
  start: { ru: 'Записывать день', uz: 'Kunni yozish' },
  stop: { ru: 'Запись идёт', uz: 'Yozilmoqda' },
  hint: {
    ru: 'Пока экран включён и вкладка открыта',
    uz: 'Ekran yoniq va sahifa ochiq boʻlsa',
  },
  waiting: { ru: 'ждут связи', uz: 'aloqa kutmoqda' },
  denied: {
    ru: 'Доступ к геопозиции закрыт — разрешите его в настройках браузера',
    uz: 'Geopozitsiyaga ruxsat yoʻq — brauzer sozlamalarida ruxsat bering',
  },
  unavailable: {
    ru: 'Спутники не ловятся — выйдите к окну или на улицу',
    uz: 'Sunʼiy yoʻldosh tutilmayapti — deraza yoki koʻcha tomonga chiqing',
  },
  unsupported: {
    ru: 'Этот браузер не умеет определять место',
    uz: 'Bu brauzer joylashuvni aniqlay olmaydi',
  },
  sent: { ru: 'отправлено в', uz: 'yuborildi' },
};

function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function FieldTrackButton({ lang }: { lang: 'ru' | 'uz' }) {
  const t = (key: keyof typeof text) => text[key][lang];
  const tracker = useFieldTracker();

  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)', justifyItems: 'start' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={tracker.on ? tracker.stop : tracker.start}
          className={tracker.on ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          style={{ display: 'flex', gap: 4, alignItems: 'center', minHeight: 44 }}
        >
          {tracker.on ? <RadioTower size={14} /> : <Radio size={14} />}
          {tracker.on ? t('stop') : t('start')}
        </button>

        {/* Сколько крошек ждёт связи. При живой сети здесь ноль, и строки
            нет: постоянный счётчик на экране читался бы как поломка. */}
        {tracker.pending > 0 && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {tracker.pending} {t('waiting')}
          </span>
        )}

        {/* Время последней удачной отправки — единственное доказательство,
            что запись доходит до сервера, а не только идёт на телефоне. */}
        {tracker.pending === 0 && tracker.sentAt !== null && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {t('sent')} {clock(tracker.sentAt)}
          </span>
        )}
      </div>

      {tracker.on && tracker.failure === null && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t('hint')}</span>
      )}

      {/* Отказ сервера показываем ЕГО СЛОВАМИ и по-русски для обоих
          языков: «совпадают имена сотрудников» чинит владелец, и человеку
          в поле надо передать ему ровно эту фразу, а не пересказ. */}
      {tracker.rejected !== null && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--error)' }}>
          {tracker.rejected}
        </span>
      )}

      {tracker.failure !== null && (
        <span
          style={{
            fontSize: 'var(--text-xs)',
            // Отказ в доступе человек может исправить сам — это ошибка.
            // Потерянные спутники в подвале исправить нельзя, и красным
            // здесь светила бы каждая вторая точка.
            color: tracker.failure === 'denied' ? 'var(--error)' : 'var(--text-muted)',
          }}
        >
          {t(tracker.failure)}
        </span>
      )}
    </div>
  );
}
