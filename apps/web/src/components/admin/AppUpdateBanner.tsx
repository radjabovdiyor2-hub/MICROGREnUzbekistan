'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

import { isNativeApp, nativePlugin } from '@/lib/native/bridge';
import { timeoutSignal } from '@/lib/net/connection';

// ══════════════════════════════════════════════════════════════════════
// «Вышла новая версия приложения».
//
// ЗАЧЕМ. APK ставится файлом, мимо магазина, — сам он не обновится
// никогда. Человек может полгода ходить со сборкой, в которой сломан сбор
// трека: приложение ведь открывается, значит «работает». Узнать об этом
// иначе нельзя ни ему, ни владельцу.
//
// ТОЛЬКО В ПРИЛОЖЕНИИ. В браузере обновлять нечего, и полоса там была бы
// шумом на весь экран админки.
//
// НЕ ЗАСТАВЛЯЕМ. Полоса закрывается, работа не блокируется: обновление
// посреди объезда — это потеря дня, а не забота о свежести.
// ══════════════════════════════════════════════════════════════════════

interface AppInfoPlugin {
  getInfo(): Promise<{ version: string; build: string }>;
}

export function AppUpdateBanner({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const [fresh, setFresh] = useState<{ version: string; url: string } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;

    const check = async () => {
      const plugin = nativePlugin<AppInfoPlugin>('App');
      if (!plugin) return;

      try {
        const [info, res] = await Promise.all([
          plugin.getInfo(),
          fetch('/api/app/version', { signal: timeoutSignal() }),
        ]);
        if (!res.ok) return;
        const body = (await res.json()) as { version?: string; url?: string };

        // Пусто — владелец ничего не объявлял. Сравнение строк, а не
        // чисел: «1.10» и «1.2» числами не сравниваются, а знать, какая
        // из них свежее, мы всё равно не можем — знает владелец.
        if (!body.version || body.version === info.version) return;
        setFresh({ version: body.version, url: body.url ?? '' });
      } catch {
        // Нет связи — не повод писать об этом посреди экрана: человек и
        // так увидит это по всему остальному.
      }
    };

    void check();
  }, []);

  if (!fresh || hidden) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
        padding: 'var(--space-3)',
        marginBottom: 'var(--space-3)',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <Download size={18} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 180 }}>
        {t('Вышла новая версия приложения', 'Ilovaning yangi versiyasi chiqdi')} — {fresh.version}
      </span>
      {fresh.url && (
        <a className="btn btn-primary" href={fresh.url} target="_blank" rel="noopener noreferrer">
          {t('Обновить', 'Yangilash')}
        </a>
      )}
      <button type="button" className="btn btn-secondary" onClick={() => setHidden(true)}>
        {t('Потом', 'Keyinroq')}
      </button>
    </div>
  );
}
