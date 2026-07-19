import React from 'react';
import type {
  Block, CoverBlock, TocBlock, ChefWordBlock, RestaurantOfWeekBlock,
  NewsDigestBlock, TrendAnalyticsBlock, RecipeBlock, ListBlock,
  NutritionistBlock, TechDigestBlock, FitnessBlock, KidsBlock, KidsCatalogBlock,
  FamilyConversionBlock, CollectionArBlock, RestaurantBrand, Audience,
} from '@/lib/magazine/types';
import { AUDIENCE_LABELS, KIDS_MECHANIC_LABELS } from '@/lib/magazine/types';
import { KIDS_MECHANICS } from '@/lib/magazine/kids';

// ── Общие мелкие детали ──
function PageNum({ n }: { n: number }) {
  const side = n % 2 === 0 ? 'mag-page-num-r' : 'mag-page-num-l';
  return <div className={`mag-page-num ${side}`}>{n}</div>;
}

function RunningHeader({ right }: { right: string }) {
  return (
    <div className="mag-running-header">
      <div className="mag-masthead">Fresh Weekly</div>
      <div>{right}</div>
    </div>
  );
}

function AudienceRibbon({ audience }: { audience: Audience }) {
  if (audience === 'all') return null;
  const color: Record<Audience, string> = {
    all: 'var(--accent)', men: '#2563eb', women: '#c2410c', kids: 'var(--gold)', family: 'var(--accent)',
  };
  return (
    <span className="mag-kicker" style={{ color: color[audience] }}>
      {AUDIENCE_LABELS[audience]}
    </span>
  );
}

const H1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontWeight: 900, color: 'var(--ink)', lineHeight: 1.1 };
const BODY: React.CSSProperties = { fontFamily: "'Cormorant Garamond', serif", color: 'var(--ink)', lineHeight: 1.6 };
const contentPad: React.CSSProperties = { padding: '4mm var(--margin-page) 8mm' };

// ── COVER ──
export function CoverPage({ b, weekLabel }: { b: CoverBlock; weekLabel: string }) {
  return (
    <div className="mag-page" style={{ background: '#000', color: '#fff' }}>
      {b.background && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <img src={b.background} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }} />
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,0.5) 0%,rgba(0,0,0,0.1) 35%,rgba(0,0,0,0.05) 55%,rgba(0,0,0,0.7) 85%,rgba(0,0,0,0.85) 100%)' }} />
      <div style={{ position: 'relative', zIndex: 1, minHeight: '210mm', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8mm 10mm 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '36pt', fontWeight: 900, lineHeight: 0.9 }}>FRESH</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '7pt', fontWeight: 700, letterSpacing: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '2mm' }}>WEEKLY</div>
          </div>
          <div style={{ textAlign: 'right', fontFamily: "'Inter', sans-serif", fontSize: '7pt', color: 'rgba(255,255,255,0.6)', lineHeight: 1.8 }}>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '10pt', fontWeight: 900, color: 'rgba(255,255,255,0.9)' }}>{weekLabel}</span><br />
            Ташкент · Самарканд
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 10mm 18mm' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '28pt', fontWeight: 900, lineHeight: 1.1, maxWidth: '90%' }}>
            {b.accentTitle ? <><span style={{ color: '#e8d48c' }}>{b.title}</span><br />{b.accentTitle}</> : b.title}
          </div>
          {b.subtitle && (
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '11pt', color: 'rgba(255,255,255,0.75)', marginTop: '4mm', maxWidth: '80%', fontStyle: 'italic' }}>{b.subtitle}</div>
          )}
          {b.tags && b.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '3mm', marginTop: '5mm', flexWrap: 'wrap' }}>
              {b.tags.map((t, i) => (
                <span key={i} className="mag-kicker" style={{ color: 'rgba(255,255,255,0.5)' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: 'rgba(0,0,0,0.5)', padding: '3.5mm 10mm', display: 'flex', justifyContent: 'space-between', fontFamily: "'Inter', sans-serif", fontSize: '6.5pt', color: 'rgba(255,255,255,0.5)' }}>
          <span>© Fresh Weekly Uzbekistan</span>
          <span style={{ color: '#e8d48c', fontWeight: 600 }}>freshweekly.uz</span>
        </div>
      </div>
    </div>
  );
}

// ── TABLE OF CONTENTS ──
export function TocPage({ b, entries, n, weekLabel }: { b: TocBlock; entries: { letter: string; title: string; page: number }[]; n: number; weekLabel: string }) {
  return (
    <div className="mag-page">
      <RunningHeader right={`Выпуск ${weekLabel}`} />
      <div style={{ padding: '8mm var(--margin-page) 6mm' }}>
        <div style={{ ...H1, fontSize: '24pt' }}>Содержание</div>
        <div style={{ width: '20mm', height: '2px', background: 'var(--gold)', margin: '3mm 0 6mm' }} />
        <div>
          {entries.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', padding: '3.5mm 0', borderBottom: '0.5px solid var(--rule-light)' }}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '20pt', fontWeight: 800, color: 'var(--accent)', width: '14mm', flexShrink: 0, lineHeight: 1 }}>{e.letter}</div>
              <div style={{ flex: 1, fontFamily: "'Playfair Display', serif", fontSize: '11pt', fontWeight: 800, color: 'var(--ink)' }}>{e.title}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '9pt', fontWeight: 700, color: 'var(--caption)', paddingLeft: '4mm' }}>{e.page}</div>
            </div>
          ))}
        </div>
        {b.editorialNote && (
          <div style={{ marginTop: '6mm', borderTop: '2px solid var(--gold)', paddingTop: '4mm' }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '2mm' }}>От редакции</div>
            <div style={{ ...BODY, fontSize: '9.5pt', color: 'var(--ink-soft)', fontStyle: 'italic' }}>{b.editorialNote}</div>
          </div>
        )}
      </div>
      <PageNum n={n} />
    </div>
  );
}

// ── Обёртка контентной страницы с hero ──
function SectionPage({ tag, audience, heroImage, n, children }: { tag: string; audience: Audience; heroImage?: string; n: number; children: React.ReactNode }) {
  return (
    <div className="mag-page">
      {heroImage ? (
        <div style={{ height: '82mm', overflow: 'hidden', position: 'relative' }}>
          <img src={heroImage} alt="" className="mag-hero-img" style={{ height: '100%' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '18mm', background: 'linear-gradient(transparent,var(--paper))' }} />
          <div style={{ position: 'absolute', top: '5mm', left: 'var(--margin-page)' }}>
            <span className="mag-section-tag mag-section-tag-dark">{tag}</span>
          </div>
        </div>
      ) : (
        <div style={{ padding: '4mm var(--margin-page) 0', display: 'flex', gap: '3mm', alignItems: 'center' }}>
          <span className="mag-section-tag">{tag}</span>
          <AudienceRibbon audience={audience} />
        </div>
      )}
      <div style={contentPad}>{children}</div>
      <PageNum n={n} />
    </div>
  );
}

// ── CHEF WORD ──
export function ChefWordPage({ b, n }: { b: ChefWordBlock; n: number }) {
  return (
    <SectionPage tag="Слово шефа" audience={b.audience} n={n}>
      {b.chefName && <div style={{ ...H1, fontSize: '18pt', marginBottom: '2mm' }}>{b.chefName}</div>}
      <hr className="mag-divider" />
      <div style={{ ...BODY, fontSize: '10pt' }}>{b.text}</div>
    </SectionPage>
  );
}

// ── RESTAURANT OF WEEK ──
export function RestaurantOfWeekPage({ b, n }: { b: RestaurantOfWeekBlock; n: number }) {
  return (
    <SectionPage tag="Ресторан недели" audience={b.audience} heroImage={b.heroImage} n={n}>
      <div style={{ ...H1, fontSize: '22pt', marginBottom: '1.5mm' }}>{b.name}</div>
      {b.meta && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '7pt', color: 'var(--caption)', letterSpacing: '0.5px' }}>{b.meta}</div>}
      {b.pullQuote && (<><hr className="mag-divider" /><div className="mag-pull-quote" style={{ fontSize: '13pt' }}>«{b.pullQuote}»</div>{b.quoteAttr && <div className="mag-pull-quote-attr">{b.quoteAttr}</div>}</>)}
      <hr className="mag-divider" />
      <div style={{ ...BODY, fontSize: '9.5pt' }}>
        {(b.interview ?? []).map((qa, i) => (
          <div key={i} style={{ marginBottom: '2mm' }}>
            <strong style={{ color: 'var(--accent)' }}>— {qa.q}</strong><br />{qa.a}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '3mm', marginTop: '3mm' }}>
        {b.whatToOrder && (
          <div className="mag-card-elegant" style={{ flex: 1 }}>
            <div className="mag-kicker" style={{ color: 'var(--accent)', marginBottom: '1mm' }}>Что заказать</div>
            <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>{b.whatToOrder}</div>
          </div>
        )}
        {b.rating && (
          <div className="mag-card-warm" style={{ flex: 1 }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1mm' }}>Наш рейтинг</div>
            <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>{b.rating}</div>
          </div>
        )}
      </div>
    </SectionPage>
  );
}

// ── NEWS DIGEST ──
export function NewsDigestPage({ b, n }: { b: NewsDigestBlock; n: number }) {
  return (
    <SectionPage tag="Новости" audience={b.audience} n={n}>
      <div style={{ ...H1, fontSize: '18pt', marginBottom: '3mm' }}>{b.title ?? 'Новости Узб и мира'}</div>
      <hr className="mag-divider mag-divider-gold" style={{ width: '25mm' }} />
      {b.items.map((it, i) => (
        <div key={i} style={{ marginBottom: '3mm', paddingBottom: '3mm', borderBottom: '0.5px solid var(--rule-light)' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '11pt', fontWeight: 800, color: 'var(--ink)', marginBottom: '1mm' }}>{it.title}</div>
          <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>{it.text}</div>
        </div>
      ))}
    </SectionPage>
  );
}

// ── TREND ANALYTICS (health / beauty) ──
export function TrendAnalyticsPage({ b, n }: { b: TrendAnalyticsBlock; n: number }) {
  const isHealth = b.type === 'healthTrends';
  const title = isHealth ? 'AI-аналитика здоровья' : 'AI-бьюти тренды';
  const accent = isHealth ? '#2563eb' : '#c2410c';
  return (
    <SectionPage tag={isHealth ? 'Здоровье' : 'Бьюти'} audience={b.audience} n={n}>
      <div style={{ ...H1, fontSize: '18pt', marginBottom: '3mm' }}>{title}</div>
      {b.trendQuery && (
        <div className="mag-card-dark" style={{ marginBottom: '3mm' }}>
          <div className="mag-kicker" style={{ color: '#c084fc', marginBottom: '1.5mm' }}>Тренд Google на этой неделе</div>
          <div style={{ ...BODY, fontSize: '10pt', color: 'rgba(255,255,255,0.9)', fontStyle: 'italic' }}>«{b.trendQuery}»</div>
        </div>
      )}
      <div style={{ background: 'var(--violet-soft)', padding: '3.5mm 4mm', borderRadius: '2mm', marginBottom: '3mm' }}>
        <div className="mag-kicker" style={{ color: accent, marginBottom: '1.5mm' }}>{b.factTitle ?? 'Факт недели'}</div>
        <div style={{ ...BODY, fontSize: '9.5pt', color: 'var(--ink)' }}>{b.fact}</div>
      </div>
      {b.advice && (
        <div className="mag-card-warm">
          <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1mm' }}>Совет с микрозеленью</div>
          <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>{b.advice}</div>
        </div>
      )}
    </SectionPage>
  );
}

// ── RECIPE ──
export function RecipePage({ b, n }: { b: RecipeBlock; n: number }) {
  return (
    <SectionPage tag="Рецепт недели" audience={b.audience} heroImage={b.heroImage} n={n}>
      <div style={{ ...H1, fontSize: '20pt' }}>{b.title}</div>
      {b.subtitle && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '7pt', color: 'var(--caption)', marginTop: '1.5mm' }}>{b.subtitle}</div>}
      <hr className="mag-divider" />
      <div style={{ display: 'flex', gap: '3mm', marginBottom: '3mm' }}>
        {b.chefVersion && (
          <div className="mag-card-dark" style={{ flex: 1 }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1.5mm' }}>Версия шефа</div>
            <div style={{ ...BODY, fontSize: '8.5pt', color: 'rgba(255,255,255,0.85)' }}>{b.chefVersion}</div>
          </div>
        )}
        {b.homeVersion && (
          <div className="mag-card-warm" style={{ flex: 1 }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1.5mm' }}>Версия для дома</div>
            <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>{b.homeVersion}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '2mm' }}>
        {(b.steps ?? []).map((s, i) => (
          <div key={i} style={{ flex: 1, borderLeft: '2px solid var(--gold)', padding: '2mm 3mm' }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)' }}>{s.title}</div>
            <div style={{ ...BODY, fontSize: '8pt', color: 'var(--ink-soft)', marginTop: '1mm' }}>{s.text}</div>
          </div>
        ))}
      </div>
    </SectionPage>
  );
}

// ── LIST (kitchen lifehacks / baking) ──
export function ListPage({ b, n }: { b: ListBlock; n: number }) {
  const tag = b.type === 'bakingDesserts' ? 'Выпечка' : 'Лайфхаки';
  return (
    <SectionPage tag={tag} audience={b.audience} n={n}>
      <div style={{ ...H1, fontSize: '18pt' }}>{b.title}</div>
      {b.intro && <div style={{ ...BODY, fontSize: '9pt', color: 'var(--ink-soft)', marginTop: '1.5mm' }}>{b.intro}</div>}
      <hr className="mag-divider mag-divider-gold" style={{ width: '25mm' }} />
      {b.items.map((it, i) => (
        <div key={i} className="mag-card-elegant" style={{ marginBottom: '2.5mm' }}>
          <div className="mag-kicker" style={{ color: 'var(--accent)', marginBottom: '1mm' }}>{it.title}</div>
          <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>{it.text}</div>
        </div>
      ))}
    </SectionPage>
  );
}

// ── NUTRITIONIST ──
export function NutritionistPage({ b, n }: { b: NutritionistBlock; n: number }) {
  return (
    <SectionPage tag="Нутрициолог" audience={b.audience} n={n}>
      <div style={{ ...H1, fontSize: '20pt' }}>{b.title}</div>
      <hr className="mag-divider mag-divider-gold" style={{ width: '25mm' }} />
      {b.fact && (
        <div style={{ background: 'var(--violet-soft)', padding: '3.5mm 4mm', borderRadius: '2mm', marginBottom: '3mm' }}>
          <div className="mag-kicker" style={{ color: '#7c3aed', marginBottom: '1.5mm' }}>Факт недели</div>
          <div style={{ ...BODY, fontSize: '9.5pt', color: '#3b1070' }}>{b.fact}</div>
        </div>
      )}
      {b.table && b.table.length > 0 && (
        <>
          {b.tableTitle && <div className="mag-kicker" style={{ color: 'var(--ink)', marginBottom: '2mm' }}>{b.tableTitle}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Cormorant Garamond', serif", fontSize: '8.5pt', marginBottom: '3mm' }}>
            <thead>
              <tr style={{ background: 'var(--dark-surface)', color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: '6.5pt', textTransform: 'uppercase', letterSpacing: '1px' }}>
                <th style={{ padding: '2.5mm 3mm', textAlign: 'left' }}>#</th>
                <th style={{ padding: '2.5mm 3mm', textAlign: 'left' }}>Продукт</th>
                <th style={{ padding: '2.5mm 3mm', textAlign: 'left' }}>на 100г</th>
                <th style={{ padding: '2.5mm 3mm', textAlign: 'right' }}>vs лимон</th>
              </tr>
            </thead>
            <tbody>
              {b.table.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'var(--accent-light)' : 'transparent' }}>
                  <td style={{ padding: '2mm 3mm' }}>{r.rank}</td>
                  <td style={{ padding: '2mm 3mm' }}><strong>{r.product}</strong></td>
                  <td style={{ padding: '2mm 3mm' }}>{r.per100}</td>
                  <td style={{ padding: '2mm 3mm', textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>{r.vs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {b.quote && (<><div className="mag-pull-quote" style={{ fontSize: '12pt' }}>«{b.quote}»</div>{b.quoteAttr && <div className="mag-pull-quote-attr">{b.quoteAttr}</div>}</>)}
      {b.lifehack && (
        <div className="mag-card-warm" style={{ marginTop: '3mm' }}>
          <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1mm' }}>Лайфхак для хозяйки</div>
          <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>{b.lifehack}</div>
        </div>
      )}
    </SectionPage>
  );
}

// ── TECH DIGEST ──
export function TechDigestPage({ b, n }: { b: TechDigestBlock; n: number }) {
  return (
    <SectionPage tag="Tech" audience={b.audience} n={n}>
      <div style={{ ...H1, fontSize: '18pt', marginBottom: '1mm' }}>{b.title ?? 'Технологии, которые меняют еду'}</div>
      <hr className="mag-divider mag-divider-gold" style={{ width: '25mm' }} />
      {b.entries.map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: '3mm', alignItems: 'flex-start', marginBottom: '3mm', paddingBottom: '3mm', borderBottom: '0.5px solid var(--rule-light)' }}>
          <div style={{ width: '11mm', height: '11mm', background: 'var(--accent)', borderRadius: '3mm', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14pt', flexShrink: 0 }}>{e.icon ?? '•'}</div>
          <div style={{ flex: 1 }}>
            <div className="mag-kicker" style={{ color: 'var(--accent)' }}>{e.kicker}</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '11pt', fontWeight: 800, color: 'var(--ink)', margin: '1mm 0' }}>{e.name}</div>
            <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>{e.text}</div>
          </div>
        </div>
      ))}
      {b.aiHack && (
        <div className="mag-card-dark">
          <div className="mag-kicker" style={{ color: '#c084fc', marginBottom: '1.5mm' }}>AI-лайфхак недели</div>
          <div style={{ ...BODY, fontSize: '9pt', color: 'rgba(255,255,255,0.85)' }}>{b.aiHack}</div>
        </div>
      )}
    </SectionPage>
  );
}

// ── FITNESS ──
export function FitnessPage({ b, n }: { b: FitnessBlock; n: number }) {
  return (
    <SectionPage tag="Фитнес" audience={b.audience} n={n}>
      <div style={{ ...H1, fontSize: '18pt' }}>{b.title}</div>
      {b.intro && <div style={{ ...BODY, fontSize: '9pt', color: 'var(--ink-soft)', marginTop: '1.5mm' }}>{b.intro}</div>}
      <hr className="mag-divider mag-divider-gold" style={{ width: '25mm' }} />
      {(b.exercises ?? []).map((ex, i) => (
        <div key={i} style={{ display: 'flex', gap: '3mm', marginBottom: '2.5mm' }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '14pt', fontWeight: 800, color: 'var(--accent)', width: '10mm', flexShrink: 0 }}>{i + 1}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '11pt', fontWeight: 800, color: 'var(--ink)' }}>{ex.name}</div>
            <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>{ex.text}</div>
          </div>
        </div>
      ))}
    </SectionPage>
  );
}

// ── KIDS ──
export function KidsPage({ b, n, kidsQrDataUrl }: { b: KidsBlock; n: number; kidsQrDataUrl?: string }) {
  return (
    <div className="mag-page" style={{ background: 'var(--gold-soft)' }}>
      <div style={{ padding: '6mm var(--margin-page) 0', display: 'flex', gap: '3mm', alignItems: 'center' }}>
        <span className="mag-section-tag mag-section-tag-gold">Fresh Kids · 4+</span>
        <span className="mag-kicker" style={{ color: 'var(--gold)' }}>{KIDS_MECHANIC_LABELS[b.mechanic]}</span>
      </div>
      <div style={contentPad}>
        <div style={{ ...H1, fontSize: '20pt', marginTop: '2mm' }}>{b.title}</div>
        <hr className="mag-divider mag-divider-gold" style={{ width: '25mm' }} />
        {b.instruction && (
          <div className="mag-card-warm" style={{ marginBottom: '3mm' }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1mm' }}>Что делать</div>
            <div style={{ ...BODY, fontSize: '9.5pt', color: 'var(--ink-soft)' }}>{b.instruction}</div>
          </div>
        )}
        {b.tale && (
          <div style={{ marginBottom: '3mm' }}>
            <div className="mag-kicker" style={{ color: 'var(--accent)', marginBottom: '1mm' }}>Нейро-сказка</div>
            <div style={{ ...BODY, fontSize: '9.5pt' }}>{b.tale}</div>
          </div>
        )}
        {b.riddle && (
          <div className="mag-card-dark" style={{ marginBottom: '3mm' }}>
            <div className="mag-kicker" style={{ color: '#c084fc', marginBottom: '1mm' }}>Голосовая загадка</div>
            <div style={{ ...BODY, fontSize: '9.5pt', color: 'rgba(255,255,255,0.9)' }}>{b.riddle}</div>
            {b.botLink && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '7pt', color: '#c084fc', marginTop: '1.5mm' }}>Ответь голосом боту: {b.botLink}</div>}
          </div>
        )}
        {/* Мост в цифровую экосистему: 9 механик онлайн */}
        <div style={{ display: 'flex', gap: '4mm', alignItems: 'center', borderTop: '1.5px solid var(--gold)', paddingTop: '3mm' }}>
          <div style={{ width: '24mm', height: '24mm', background: '#fff', borderRadius: '2mm', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {kidsQrDataUrl
              ? <img src={kidsQrDataUrl} alt="QR Fresh Kids" style={{ width: '100%', height: '100%' }} />
              : <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '7pt', color: '#999' }}>QR</span>}
          </div>
          <div>
            <div className="mag-kicker" style={{ color: 'var(--accent)', marginBottom: '1mm' }}>Играй онлайн · 9 механик</div>
            <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>Сканируй QR: нейро-сказка с твоим именем, голосовые загадки, AR-раскраски и паспорт агронома.</div>
          </div>
        </div>
      </div>
      <PageNum n={n} />
    </div>
  );
}

// ── KIDS CATALOG (все 9 механик на одной странице) ──
export function KidsCatalogPage({ b, n }: { b: KidsCatalogBlock; n: number }) {
  const modeLabel: Record<string, string> = { online: 'онлайн', ar: 'AR', print: 'в журнале', bot: 'Telegram' };
  return (
    <div className="mag-page" style={{ background: 'var(--gold-soft)' }}>
      <div style={{ padding: '6mm var(--margin-page) 0', display: 'flex', gap: '3mm', alignItems: 'center' }}>
        <span className="mag-section-tag mag-section-tag-gold">Fresh Kids · Экосистема</span>
        <span className="mag-kicker" style={{ color: 'var(--gold)' }}>9 игр</span>
      </div>
      <div style={contentPad}>
        <div style={{ ...H1, fontSize: '19pt', marginTop: '2mm' }}>{b.title ?? 'Девять игр, где еда оживает'}</div>
        {b.intro && <div style={{ ...BODY, fontSize: '9pt', color: 'var(--ink-soft)', marginTop: '1mm' }}>{b.intro}</div>}
        <hr className="mag-divider mag-divider-gold" style={{ width: '25mm' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5mm' }}>
          {KIDS_MECHANICS.map((m) => (
            <div key={m.id} style={{ display: 'flex', gap: '2.5mm', alignItems: 'flex-start', background: 'var(--paper-pure)', borderRadius: '2mm', padding: '2.5mm 3mm' }}>
              <span style={{ fontSize: '15pt', lineHeight: 1, flexShrink: 0 }}>{m.emoji}</span>
              <div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '9pt', fontWeight: 800, color: 'var(--ink)' }}>{m.label}</div>
                <div style={{ ...BODY, fontSize: '7.5pt', color: 'var(--ink-soft)', lineHeight: 1.35 }}>{m.desc}</div>
                <div className="mag-kicker" style={{ color: 'var(--accent)', fontSize: '5.5pt', marginTop: '0.5mm' }}>{modeLabel[m.mode]}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ ...BODY, fontSize: '8pt', color: 'var(--ink-soft)', marginTop: '3mm', textAlign: 'center', fontStyle: 'italic' }}>
          Играй онлайн на freshweekly.uz/magazine/kids — сканируй QR на детской странице.
        </div>
      </div>
      <PageNum n={n} />
    </div>
  );
}

// ── FAMILY CONVERSION (QR + промокод) ──
export function FamilyConversionPage({ b, brand, qrDataUrl, n }: { b: FamilyConversionBlock; brand: RestaurantBrand; qrDataUrl?: string; n: number }) {
  const discount = brand.promoDiscount ?? 10;
  return (
    <SectionPage tag="Для всей семьи" audience={b.audience} n={n}>
      <div style={{ ...H1, fontSize: '18pt' }}>История нашей фермы</div>
      <hr className="mag-divider mag-divider-gold" style={{ width: '25mm' }} />
      {b.farmStory && <div style={{ ...BODY, fontSize: '9.5pt', marginBottom: '4mm' }}>{b.farmStory}</div>}
      <div className="mag-card-dark" style={{ display: 'flex', gap: '4mm', alignItems: 'center' }}>
        <div style={{ width: '30mm', height: '30mm', background: '#fff', borderRadius: '2mm', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          {qrDataUrl
            ? <img src={qrDataUrl} alt="QR промокод" style={{ width: '100%', height: '100%' }} />
            : <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '7pt', color: '#999', textAlign: 'center' }}>QR<br />КОД</span>}
        </div>
        <div style={{ flex: 1 }}>
          <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1.5mm' }}>Скидка −{discount}% от ресторана {brand.name}</div>
          <div style={{ ...BODY, fontSize: '9pt', color: 'rgba(255,255,255,0.85)' }}>{b.promoText ?? 'Понравилась наша микрозелень? Закажите домой со скидкой.'}</div>
          {brand.promoCode && (
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '10pt', fontWeight: 800, color: '#e8d48c', marginTop: '2mm', letterSpacing: '1px' }}>Промокод: {brand.promoCode}</div>
          )}
        </div>
      </div>
    </SectionPage>
  );
}

// ── COLLECTION + AR ──
export function CollectionArPage({ b, n }: { b: CollectionArBlock; n: number }) {
  return (
    <SectionPage tag="Коллекция + AR" audience={b.audience} n={n}>
      <div style={{ ...H1, fontSize: '20pt' }}>Карточка «{b.cardName}»</div>
      <hr className="mag-divider mag-divider-gold" style={{ width: '25mm' }} />
      {b.cardText && <div style={{ ...BODY, fontSize: '9.5pt', marginBottom: '3mm' }}>{b.cardText}</div>}
      <div className="mag-card-elegant">
        <div className="mag-kicker" style={{ color: 'var(--accent)', marginBottom: '1mm' }}>Оживи в 3D</div>
        <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>
          Открой сканер: {b.arUrl ?? '/magazine/ar'} — наведи камеру на карточку, и персонаж оживёт.
        </div>
      </div>
    </SectionPage>
  );
}
