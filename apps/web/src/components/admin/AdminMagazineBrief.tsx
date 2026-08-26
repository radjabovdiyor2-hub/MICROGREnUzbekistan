'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Newspaper, RefreshCw } from 'lucide-react';
import { useState } from 'react';

// ══════════════════════════════════════════════════════════════════════
// Редакционная сводка недели — то, что читают ПЕРЕД тем, как делать выпуск.
//
// ЧЕГО НЕ БЫЛО. `/api/admin/magazine/brief` собирал сезон, погоду, заголовки
// новостей Узбекистана, поисковые тренды из офиса, идеи тем от ИИ и цифры по
// каталогу — и не имел ни одного потребителя. Всё это считалось по запросу,
// которого никто не делал.
//
// СТОИТ НАД СПИСКОМ ВЫПУСКОВ И СВЁРНУТА. Сводка нужна раз в неделю, в момент
// «собираю следующий номер», а не при каждом заходе на вкладку: развёрнутая
// по умолчанию, она отодвигала бы вниз то, ради чего сюда чаще приходят —
// сами выпуски. Запрос уходит только при разворачивании: он ходит в две
// внешние ленты и в модель, и делать это фоном при открытии вкладки значит
// платить за то, чего не просили.
// ══════════════════════════════════════════════════════════════════════

interface Brief {
  season: string;
  weather: string;
  news: string[];
  googleTrends: string[];
  topics: Record<string, string>;
  stats: {
    topMicrogreens: { name: string; count: number }[];
    topProducts: string[];
    partnerCount: number;
    restaurantsTotal: number;
  };
}

const SECTION_RU: Record<string, string> = {
  health: 'Здоровье',
  beauty: 'Красота',
  recipe: 'Рецепт',
  tech: 'Технологии',
  news: 'Новости',
  kids: 'Детям',
};

export function AdminMagazineBrief({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const [open, setOpen] = useState(false);

  const brief = useQuery<Brief>({
    queryKey: ['mag-brief'],
    enabled: open,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch('/api/admin/magazine/brief', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Не удалось собрать сводку');
      return res.json();
    },
  });

  const data = brief.data;

  return (
    <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', font: 'inherit', fontWeight: 'var(--font-semibold)', padding: 0 }}
        >
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Newspaper size={16} />
          {t('Сводка недели', 'Hafta sharhi')}
        </button>

        {open && (
          <>
            <span style={{ flex: 1 }} />
            <button className="btn btn-sm" disabled={brief.isFetching}
              onClick={() => brief.refetch()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={13} /> {t('Обновить', 'Yangilash')}
            </button>
          </>
        )}
      </div>

      {!open && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 4 }}>
          {t(
            'Сезон, погода, новости недели, тренды и идеи тем — перед сборкой номера',
            'Fasl, ob-havo, hafta yangiliklari va mavzu gʻoyalari',
          )}
        </div>
      )}

      {open && brief.isPending && (
        <div style={{ marginTop: 'var(--space-3)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          {t('Собираем…', 'Yigʻilmoqda…')}
        </div>
      )}

      {open && brief.isError && (
        <div style={{ marginTop: 'var(--space-3)', color: 'var(--error)', fontSize: 'var(--text-sm)' }}>
          {t('Сводка не собралась', 'Sharh yigʻilmadi')}
        </div>
      )}

      {open && data && (
        <div style={{ marginTop: 'var(--space-3)', display: 'grid', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
            <Chip label={t('Сезон', 'Fasl')} value={data.season} />
            <Chip label={t('Погода', 'Ob-havo')} value={data.weather} />
            <Chip label={t('Партнёров', 'Hamkorlar')}
              value={`${data.stats.partnerCount} / ${data.stats.restaurantsTotal}`} />
          </div>

          <Group title={t('Идеи тем', 'Mavzu gʻoyalari')}
            empty={Object.keys(data.topics).length === 0}
            hint={t('ИИ не настроен или не ответил', 'AI sozlanmagan')}>
            {Object.entries(data.topics).map(([section, idea]) => (
              <div key={section} style={{ fontSize: 'var(--text-sm)' }}>
                <b>{SECTION_RU[section] ?? section}:</b> {idea}
              </div>
            ))}
          </Group>

          <Group title={t('Новости недели', 'Hafta yangiliklari')} empty={data.news.length === 0}>
            {data.news.map((n) => (
              <div key={n} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>• {n}</div>
            ))}
          </Group>

          <Group title={t('Что ищут', 'Nima qidirishmoqda')} empty={data.googleTrends.length === 0}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              {data.googleTrends.join(' · ')}
            </div>
          </Group>

          <Group title={t('Микрозелень у партнёров', 'Hamkorlarda mikrokoʻkat')}
            empty={data.stats.topMicrogreens.length === 0}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              {data.stats.topMicrogreens.map((m) => `${m.name} (${m.count})`).join(' · ')}
            </div>
          </Group>
        </div>
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ padding: '3px 10px', borderRadius: 999, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
      {label}: <b style={{ color: 'var(--text-primary)' }}>{value}</b>
    </span>
  );
}

function Group({ title, empty, hint, children }: {
  title: string;
  empty: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 4 }}>
        {title}
      </div>
      {empty
        ? <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{hint ?? '—'}</div>
        : <div style={{ display: 'grid', gap: 2 }}>{children}</div>}
    </div>
  );
}
