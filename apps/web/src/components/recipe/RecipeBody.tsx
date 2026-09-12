'use client';

import { useLang } from '@/components/providers/LangProvider';

import { StepTimer } from './StepTimer';

// ══════════════════════════════════════════════════════════════════════
// Тело рецепта на языке читателя.
//
// ЗАЧЕМ ОТДЕЛЬНЫМ КЛИЕНТСКИМ КУСКОМ. Страница рецепта серверная — и должна
// такой остаться: она отдаёт метаданные и разметку для поиска, а их считает
// краулер, а не браузер. Но язык читателя живёт в браузере, и на сервере
// его знать нельзя.
//
// ЧТО БЫЛО. Страница показывала ТОЛЬКО русский: заголовок, описание и все
// шаги приготовления. Узбекский перевод лежал в базе у каждого шага
// (`text_uz`) и не выводился нигде — кроме мелкой серой подписи под
// заголовком. Узбекский читатель открывал рецепт и читал чужой язык.
//
// ЗАГОЛОВОК ОСТАЁТСЯ ДВУЯЗЫЧНЫМ. Название набора на упаковке одно, и
// человек должен узнать его в обоих написаниях — поэтому второе имя
// остаётся подписью, а не исчезает.
// ══════════════════════════════════════════════════════════════════════

interface Step {
  id: string;
  textRu: string;
  textUz: string | null;
  image: string | null;
  timerSeconds: number | null;
}

export function RecipeBody({
  titleRu,
  titleUz,
  descriptionRu,
  descriptionUz,
  cookMinutes,
  servings,
  steps,
  accent,
}: {
  titleRu: string;
  titleUz: string | null;
  descriptionRu: string | null;
  descriptionUz: string | null;
  cookMinutes: number | null;
  servings: number | null;
  steps: Step[];
  accent: string;
}) {
  const { lang } = useLang();
  const uz = lang === 'uz';

  const title = uz ? (titleUz || titleRu) : titleRu;
  const second = uz ? (titleUz ? titleRu : null) : titleUz;
  const description = uz ? (descriptionUz || descriptionRu) : descriptionRu;

  const meta = [
    cookMinutes ? `${cookMinutes} ${uz ? 'daqiqa' : 'мин'}` : null,
    servings ? `${servings} ${uz ? 'porsiya' : 'порц.'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <h1 style={{
        fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 7vw, 40px)',
        fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.1,
      }}>{title}</h1>

      {second && (
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, color: 'var(--text-muted)', marginTop: 4 }}>
          {second}
        </div>
      )}

      {meta && (
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: accent, marginTop: 8, fontWeight: 600 }}>
          {meta}
        </div>
      )}

      {description && (
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)', marginTop: 14 }}>
          {description}
        </p>
      )}

      {steps.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 14 }}>
            {uz ? 'Tayyorlash' : 'Приготовление'}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {steps.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', gap: 14 }}>
                <div style={{
                  flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
                  background: accent, color: 'var(--text-inverse)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Inter', sans-serif", fontWeight: 800,
                }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  {s.image && (
                    <img src={s.image} alt="" style={{ width: '100%', borderRadius: 14, marginBottom: 8, objectFit: 'cover' }} />
                  )}
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                    {/* Нет перевода шага — показываем русский, а не пустоту:
                        рецепт без шага несъедобен. */}
                    {uz ? (s.textUz || s.textRu) : s.textRu}
                  </div>
                  {s.timerSeconds ? <StepTimer seconds={s.timerSeconds} accent={accent} /> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
