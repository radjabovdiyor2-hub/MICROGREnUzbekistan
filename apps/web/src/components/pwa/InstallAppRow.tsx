'use client';

import { Download, Smartphone } from 'lucide-react';

import { useLang } from '@/components/providers/LangProvider';
import { useInstallPrompt } from '@/lib/pwa/installPrompt';

// ══════════════════════════════════════════════════════════════════════
// Постоянное предложение установить приложение — в блоке доставки.
//
// ЗАЧЕМ ВТОРАЯ ТОЧКА. Первая — плавающий тост — появляется один раз и
// через три секунды после загрузки, а если человек его закрыл, молчит три
// дня. Это верно для навязчивого предложения, но означает, что найти
// установку намеренно нельзя: постоянного места у неё не было вовсе.
//
// Здесь, рядом с доставкой и контактами, оно уместно: человек уже решил
// заказывать и смотрит, как с нами связаться.
//
// САМА ПРЯЧЕТСЯ, ЕСЛИ УСТАНОВИТЬ НЕЛЬЗЯ. На iPhone события установки нет
// вовсе, в уже установленном приложении — тоже. Кнопка, которая
// гарантированно не сработает, хуже её отсутствия: тот же довод, по
// которому в проекте убрали проверку живости воркера карты.
// ══════════════════════════════════════════════════════════════════════

export function InstallAppRow() {
  const { t } = useLang();
  const { canInstall, install } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-4)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-md)',
          background: 'var(--brand-primary-light)',
          color: 'var(--brand-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Smartphone size={20} />
      </div>

      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontWeight: 'var(--font-semibold)' }}>
          {t('Ilovani telefonga o’rnating', 'Установите приложение')}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {t(
            'Katalog aloqasiz ham ochiladi, buyurtma bir bosishda',
            'Каталог открывается без связи, заказ — в одно касание',
          )}
        </div>
      </div>

      <button
        onClick={() => void install()}
        className="btn btn-secondary btn-sm"
        style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44 }}
      >
        <Download size={15} />
        {t('O’rnatish', 'Установить')}
      </button>
    </div>
  );
}
