import React from 'react';
import type {
  CoverBlock, TocBlock, ChefWordBlock, RestaurantOfWeekBlock,
  TrendAnalyticsBlock, RecipeBlock, KidsBlock,
  FamilyConversionBlock, CollectionArBlock, RestaurantBrand, Audience, L10n,
} from '@/lib/magazine/types';
import {
  UI, LANGS, t, tri, inline,
  KIDS_MECHANIC_LABELS_I18N,
  type Lang, type UIKey,
} from '@/lib/magazine/i18n';

// ════════════════════════════════════════════════════════════
// Журнал печатается на двух языках: узбекский (основной, крупно)
// и русский — мельче под ним (.mag-lang-sec).
// ════════════════════════════════════════════════════════════

const PRIMARY: Lang = 'uz';

/** Подпись интерфейса на двух языках в одну строку. */
function ui(key: UIKey) { return inline(key); }

/**
 * Двуязычный текст: узбекский в основном стиле, русский —
 * мельче, приглушённо, с языковой меткой.
 */
function Tri({ v, style, secondaryScale = 0.78, className }: {
  v: L10n | undefined | null;
  style?: React.CSSProperties;
  secondaryScale?: number;
  className?: string;
}) {
  const parts = tri(v);
  if (!parts.length) return null;
  const [main, ...rest] = parts;
  const baseSize = typeof style?.fontSize === 'string' ? parseFloat(style.fontSize) : undefined;
  const secSize = baseSize ? `${(baseSize * secondaryScale).toFixed(1)}pt` : '7.5pt';
  return (
    <div className={className}>
      <div style={style}>{main.text}</div>
      {rest.length > 0 && (
        <div className="mag-lang-sec">
          {rest.map((p) => (
            <div key={p.lang} className="mag-lang-sec-line" style={{ fontSize: secSize }}>
              <span className="mag-lang-tag">{p.lang}</span>{p.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

/** Фото с подписью (подпись — обязательный элемент редакционной вёрстки). */
function Figure({ src, caption, height }: { src?: string; caption?: L10n; height?: string }) {
  if (!src) return null;
  return (
    <figure className="mag-figure">
      <img src={src} alt="" style={height ? { height } : undefined} />
      {caption && (
        <figcaption className="mag-photo-caption">
          {tri(caption).map((p) => p.text).join(' · ')}
        </figcaption>
      )}
    </figure>
  );
}

const H1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontWeight: 900, color: 'var(--ink)', lineHeight: 1.1 };
const BODY: React.CSSProperties = { fontFamily: "'Cormorant Garamond', serif", color: 'var(--ink)', lineHeight: 1.6 };
const contentPad: React.CSSProperties = { padding: '4mm var(--margin-page) 8mm' };

// ── COVER ──
export function CoverPage({ b, weekLabel }: { b: CoverBlock; weekLabel: string }) {
  const titleParts = tri(b.title);
  const accentParts = tri(b.accentTitle);
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
            UZ · RU
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 10mm 18mm' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '26pt', fontWeight: 900, lineHeight: 1.1, maxWidth: '92%' }}>
            <span style={{ color: '#e8d48c' }}>{titleParts[0]?.text}</span>
            {accentParts[0] && <><br />{accentParts[0].text}</>}
          </div>
          {/* Заголовок на втором языке */}
          {(titleParts.length > 1 || accentParts.length > 1) && (
            <div style={{ marginTop: '3mm', borderLeft: '1.5px solid rgba(232,212,140,0.5)', paddingLeft: '3mm' }}>
              {titleParts.slice(1).map((p, i) => (
                <div key={p.lang} style={{ fontFamily: "'Playfair Display', serif", fontSize: '11pt', fontWeight: 700, color: 'rgba(255,255,255,0.72)', lineHeight: 1.25 }}>
                  {p.text} {accentParts[i + 1]?.text ?? ''}
                </div>
              ))}
            </div>
          )}
          {b.subtitle && (
            <div style={{ marginTop: '4mm', maxWidth: '86%' }}>
              {tri(b.subtitle).map((p) => (
                <div key={p.lang} style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: p.lang === PRIMARY ? '10.5pt' : '8pt', color: p.lang === PRIMARY ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.55)', fontStyle: 'italic', lineHeight: 1.4 }}>{p.text}</div>
              ))}
            </div>
          )}
          {b.tags && b.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '3mm', marginTop: '5mm', flexWrap: 'wrap' }}>
              {b.tags.map((tag, i) => (
                <span key={i} className="mag-kicker" style={{ color: 'rgba(255,255,255,0.5)' }}>{t(tag as L10n, PRIMARY)}</span>
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
export function TocPage({ b, entries, n, weekLabel }: {
  b: TocBlock;
  entries: { letter: string; titles: string[]; page: number }[];
  n: number; weekLabel: string;
}) {
  return (
    <div className="mag-page">
      <RunningHeader right={`${ui('issue')} ${weekLabel}`} />
      <div style={{ padding: '8mm var(--margin-page) 6mm' }}>
        <div style={{ ...H1, fontSize: '22pt' }}>{UI.uz.contents}</div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '6.5pt', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--caption)', marginTop: '1mm' }}>
          {UI.ru.contents}
        </div>
        <div style={{ width: '20mm', height: '2px', background: 'var(--gold)', margin: '3mm 0 5mm' }} />
        <div>
          {entries.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', padding: '3mm 0', borderBottom: '0.5px solid var(--rule-light)' }}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '17pt', fontWeight: 800, color: 'var(--accent)', width: '12mm', flexShrink: 0, lineHeight: 1 }}>{e.letter}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '10.5pt', fontWeight: 800, color: 'var(--ink)' }}>{e.titles[0]}</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '7.5pt', color: 'var(--caption)', lineHeight: 1.3 }}>{e.titles.slice(1).join(' · ')}</div>
              </div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '9pt', fontWeight: 700, color: 'var(--caption)', paddingLeft: '4mm' }}>{e.page}</div>
            </div>
          ))}
        </div>
        {b.editorialNote && (
          <div style={{ marginTop: '5mm', borderTop: '2px solid var(--gold)', paddingTop: '3.5mm' }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '2mm', fontSize: '5.2pt' }}>{ui('editorial')}</div>
            <Tri v={b.editorialNote} style={{ ...BODY, fontSize: '9.5pt', color: 'var(--ink-soft)', fontStyle: 'italic' }} />
          </div>
        )}
      </div>
      <PageNum n={n} />
    </div>
  );
}

// ── Обёртка контентной страницы с hero ──
function SectionPage({ tag, heroImage, caption, n, children }: {
  tag: string; audience?: Audience; heroImage?: string; caption?: L10n; n: number; children: React.ReactNode;
}) {
  return (
    <div className="mag-page">
      {heroImage ? (
        <div style={{ height: '74mm', overflow: 'hidden', position: 'relative' }}>
          <img src={heroImage} alt="" className="mag-hero-img" style={{ height: '100%' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '16mm', background: 'linear-gradient(transparent,var(--paper))' }} />
          <div style={{ position: 'absolute', top: '5mm', left: 'var(--margin-page)' }}>
            <span className="mag-section-tag mag-section-tag-dark" style={{ fontSize: '5pt' }}>{tag}</span>
          </div>
        </div>
      ) : (
        <div style={{ padding: '4mm var(--margin-page) 0' }}>
          <span className="mag-section-tag" style={{ fontSize: '5pt' }}>{tag}</span>
        </div>
      )}
      {heroImage && caption && (
        <div style={{ padding: '1.5mm var(--margin-page) 0' }}>
          <div className="mag-photo-caption">{tri(caption).map((p) => p.text).join(' · ')}</div>
        </div>
      )}
      <div style={contentPad}>{children}</div>
      <PageNum n={n} />
    </div>
  );
}

// ── CHEF WORD (портрет + буквица) ──
export function ChefWordPage({ b, n }: { b: ChefWordBlock; n: number }) {
  const textParts = tri(b.text);
  return (
    <SectionPage tag={ui('chefWord')} n={n}>
      <div style={{ display: 'flex', gap: '4mm', alignItems: 'flex-start', marginBottom: '3mm' }}>
        {b.portrait && (
          <img src={b.portrait} alt="" style={{ width: '30mm', height: '38mm', objectFit: 'cover', borderRadius: '1.5mm', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1 }}>
          <Tri v={b.chefName} style={{ ...H1, fontSize: '17pt' }} />
          <hr className="mag-divider mag-divider-gold" style={{ width: '20mm', margin: '2.5mm 0' }} />
        </div>
      </div>
      {textParts[0] && (
        <div className="mag-dropcap" style={{ ...BODY, fontSize: '10pt' }}>{textParts[0].text}</div>
      )}
      {textParts.length > 1 && (
        <div className="mag-lang-sec" style={{ marginTop: '3mm' }}>
          {textParts.slice(1).map((p) => (
            <div key={p.lang} className="mag-lang-sec-line" style={{ fontSize: '8pt', marginBottom: '1.5mm' }}>
              <span className="mag-lang-tag">{p.lang}</span>{p.text}
            </div>
          ))}
        </div>
      )}
    </SectionPage>
  );
}

// ── RESTAURANT OF WEEK ──
export function RestaurantOfWeekPage({ b, n }: { b: RestaurantOfWeekBlock; n: number }) {
  return (
    <SectionPage tag={ui('restaurantOfWeek')} heroImage={b.heroImage} n={n}>
      <Tri v={b.name} style={{ ...H1, fontSize: '21pt' }} />
      {b.meta && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '6.5pt', color: 'var(--caption)', letterSpacing: '0.5px', marginTop: '1mm' }}>{t(b.meta, PRIMARY)}</div>}
      {b.pullQuote && (
        <>
          <hr className="mag-divider" />
          <div className="mag-pull-quote" style={{ fontSize: '12pt' }}>«{t(b.pullQuote, PRIMARY)}»</div>
          {tri(b.pullQuote).slice(1).map((p) => (
            <div key={p.lang} className="mag-lang-sec-line" style={{ fontSize: '7.5pt', fontStyle: 'italic', paddingLeft: '2mm' }}>
              <span className="mag-lang-tag">{p.lang}</span>«{p.text}»
            </div>
          ))}
          {b.quoteAttr && <div className="mag-pull-quote-attr">{t(b.quoteAttr, PRIMARY)}</div>}
        </>
      )}
      <hr className="mag-divider" />
      <div>
        {(b.interview ?? []).map((qa, i) => (
          <div key={i} style={{ marginBottom: '2.5mm' }}>
            <div style={{ ...BODY, fontSize: '9.5pt' }}>
              <strong style={{ color: 'var(--accent)' }}>— {t(qa.q, PRIMARY)}</strong>
            </div>
            <Tri v={qa.a} style={{ ...BODY, fontSize: '9pt' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '3mm', marginTop: '3mm' }}>
        {b.whatToOrder && (
          <div className="mag-card-elegant" style={{ flex: 1 }}>
            <div className="mag-kicker" style={{ color: 'var(--accent)', marginBottom: '1mm', fontSize: '5pt' }}>{ui('whatToOrder')}</div>
            <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>{t(b.whatToOrder, PRIMARY)}</div>
          </div>
        )}
        {b.rating && (
          <div className="mag-card-warm" style={{ flex: 1 }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1mm', fontSize: '5pt' }}>{ui('ourRating')}</div>
            <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>{t(b.rating, PRIMARY)}</div>
          </div>
        )}
      </div>
    </SectionPage>
  );
}

// ── HEALTH & BEAUTY (склейка: несколько тем на одной полосе) ──
export function TrendAnalyticsPage({ b, n }: { b: TrendAnalyticsBlock; n: number }) {
  return (
    <SectionPage tag={ui('healthBeauty')} n={n}>
      <Tri v={b.title ?? { uz: UI.uz.healthBeautyTitle, ru: UI.ru.healthBeautyTitle }} style={{ ...H1, fontSize: '17pt' }} />
      <hr className="mag-divider mag-divider-gold" style={{ width: '25mm' }} />
      {b.items.map((it, i) => (
        <div key={i} style={{ marginBottom: '4mm', paddingBottom: i < b.items.length - 1 ? '3mm' : 0, borderBottom: i < b.items.length - 1 ? '0.5px solid var(--rule-light)' : 'none' }}>
          <div style={{ display: 'flex', gap: '3.5mm', alignItems: 'flex-start' }}>
            {it.image && <img className="mag-thumb" src={it.image} alt="" />}
            <div style={{ flex: 1 }}>
              {it.trendQuery && (
                <div style={{ marginBottom: '2mm' }}>
                  <div className="mag-kicker" style={{ color: '#7c3aed', marginBottom: '1mm', fontSize: '5pt' }}>{ui('googleTrend')}</div>
                  <div style={{ ...BODY, fontSize: '9pt', fontStyle: 'italic', color: 'var(--ink)' }}>«{t(it.trendQuery, PRIMARY)}»</div>
                </div>
              )}
              <div className="mag-kicker" style={{ color: 'var(--accent)', marginBottom: '1mm', fontSize: '5pt' }}>
                {it.factTitle ? t(it.factTitle, PRIMARY) : ui('factOfWeek')}
              </div>
              <Tri v={it.fact} style={{ ...BODY, fontSize: '9pt', color: 'var(--ink)' }} />
            </div>
          </div>
          {it.advice && (
            <div className="mag-card-warm" style={{ marginTop: '2mm' }}>
              <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1mm', fontSize: '5pt' }}>{ui('microgreenAdvice')}</div>
              <Tri v={it.advice} style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }} />
            </div>
          )}
        </div>
      ))}
    </SectionPage>
  );
}

// ── RECIPE (фото у каждого шага) ──
export function RecipePage({ b, n }: { b: RecipeBlock; n: number }) {
  return (
    <SectionPage tag={ui('recipeOfWeek')} heroImage={b.heroImage} caption={b.caption} n={n}>
      <Tri v={b.title} style={{ ...H1, fontSize: '19pt' }} />
      {b.subtitle && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '6.5pt', color: 'var(--caption)', marginTop: '1.5mm' }}>{t(b.subtitle, PRIMARY)}</div>}
      <hr className="mag-divider" />
      <div style={{ display: 'flex', gap: '3mm', marginBottom: '3mm' }}>
        {b.chefVersion && (
          <div className="mag-card-dark" style={{ flex: 1 }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1.5mm', fontSize: '5pt' }}>{ui('chefVersion')}</div>
            <div style={{ ...BODY, fontSize: '8pt', color: 'rgba(255,255,255,0.85)' }}>{t(b.chefVersion, PRIMARY)}</div>
          </div>
        )}
        {b.homeVersion && (
          <div className="mag-card-warm" style={{ flex: 1 }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1.5mm', fontSize: '5pt' }}>{ui('homeVersion')}</div>
            <div style={{ ...BODY, fontSize: '8pt', color: 'var(--ink-soft)' }}>{t(b.homeVersion, PRIMARY)}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '2.5mm' }}>
        {(b.steps ?? []).map((s, i) => (
          <div key={i} style={{ flex: 1, borderLeft: '2px solid var(--gold)', paddingLeft: '2.5mm' }}>
            {s.image && <img src={s.image} alt="" style={{ width: '100%', height: '16mm', objectFit: 'cover', borderRadius: '1mm', marginBottom: '1.5mm', display: 'block' }} />}
            <div className="mag-kicker" style={{ color: 'var(--gold)', fontSize: '5pt' }}>{t(s.title, PRIMARY)}</div>
            <Tri v={s.text} style={{ ...BODY, fontSize: '7.5pt', color: 'var(--ink-soft)', marginTop: '1mm' }} secondaryScale={0.85} />
          </div>
        ))}
      </div>
    </SectionPage>
  );
}



// ── KIDS ──
export function KidsPage({ b, n, kidsQrDataUrl }: { b: KidsBlock; n: number; kidsQrDataUrl?: string }) {
  const mechLabel = LANGS.map((l) => KIDS_MECHANIC_LABELS_I18N[l][b.mechanic]).join(' · ');
  return (
    <div className="mag-page" style={{ background: 'var(--gold-soft)' }}>
      <div style={{ padding: '6mm var(--margin-page) 0', display: 'flex', gap: '3mm', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="mag-section-tag mag-section-tag-gold" style={{ fontSize: '5pt' }}>{UI.uz.kids} · 4+</span>
        <span className="mag-kicker" style={{ color: 'var(--gold)', fontSize: '5pt' }}>{mechLabel}</span>
      </div>
      <div style={contentPad}>
        <Tri v={b.title} style={{ ...H1, fontSize: '19pt', marginTop: '2mm' }} />
        <hr className="mag-divider mag-divider-gold" style={{ width: '25mm' }} />
        <Figure src={b.image} caption={b.caption} height="42mm" />
        {b.instruction && (
          <div className="mag-card-warm" style={{ marginBottom: '3mm' }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1mm', fontSize: '5pt' }}>{ui('whatToDo')}</div>
            <Tri v={b.instruction} style={{ ...BODY, fontSize: '9pt', color: 'var(--ink-soft)' }} />
          </div>
        )}
        {b.tale && (
          <div style={{ marginBottom: '3mm' }}>
            <div className="mag-kicker" style={{ color: 'var(--accent)', marginBottom: '1mm', fontSize: '5pt' }}>{ui('neuroTale')}</div>
            <Tri v={b.tale} style={{ ...BODY, fontSize: '9pt' }} />
          </div>
        )}
        {b.riddle && (
          <div className="mag-card-dark" style={{ marginBottom: '3mm' }}>
            <div className="mag-kicker" style={{ color: '#c084fc', marginBottom: '1mm', fontSize: '5pt' }}>{ui('voiceRiddle')}</div>
            <div style={{ ...BODY, fontSize: '9pt', color: 'rgba(255,255,255,0.9)' }}>{t(b.riddle, PRIMARY)}</div>
            {b.botLink && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '6.5pt', color: '#c084fc', marginTop: '1.5mm' }}>{UI.uz.answerBot}: {b.botLink}</div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: '4mm', alignItems: 'center', borderTop: '1.5px solid var(--gold)', paddingTop: '3mm' }}>
          <div style={{ width: '22mm', height: '22mm', background: '#fff', borderRadius: '2mm', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {kidsQrDataUrl
              ? <img src={kidsQrDataUrl} alt="QR Fresh Kids" style={{ width: '100%', height: '100%' }} />
              : <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '7pt', color: '#999' }}>QR</span>}
          </div>
          <div>
            <div className="mag-kicker" style={{ color: 'var(--accent)', marginBottom: '1mm', fontSize: '5pt' }}>{ui('playOnline')}</div>
            {LANGS.map((l) => (
              <div key={l} style={{ ...BODY, fontSize: l === PRIMARY ? '8pt' : '6.8pt', color: l === PRIMARY ? 'var(--ink-soft)' : 'var(--caption)', lineHeight: 1.35 }}>{UI[l].kidsQrText}</div>
            ))}
          </div>
        </div>
      </div>
      <PageNum n={n} />
    </div>
  );
}


// ── FAMILY CONVERSION (QR + промокод) ──
export function FamilyConversionPage({ b, brand, qrDataUrl, n }: {
  b: FamilyConversionBlock; brand: RestaurantBrand; qrDataUrl?: string; n: number;
}) {
  const discount = brand.promoDiscount ?? 10;
  return (
    <SectionPage tag={ui('forFamily')} n={n}>
      <div style={{ ...H1, fontSize: '17pt' }}>{UI.uz.farmStory}</div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '6pt', color: 'var(--caption)', letterSpacing: '1px', marginTop: '0.8mm' }}>
        {UI.ru.farmStory}
      </div>
      <hr className="mag-divider mag-divider-gold" style={{ width: '25mm' }} />
      <Figure src={b.farmImage} caption={b.caption} height="40mm" />
      {b.farmStory && <Tri v={b.farmStory} style={{ ...BODY, fontSize: '9pt', marginBottom: '3.5mm' }} />}
      <div className="mag-card-dark" style={{ display: 'flex', gap: '4mm', alignItems: 'center' }}>
        <div style={{ width: '28mm', height: '28mm', background: '#fff', borderRadius: '2mm', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          {qrDataUrl
            ? <img src={qrDataUrl} alt="QR" style={{ width: '100%', height: '100%' }} />
            : <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '7pt', color: '#999', textAlign: 'center' }}>QR</span>}
        </div>
        <div style={{ flex: 1 }}>
          <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1.5mm', fontSize: '5pt' }}>
            {UI.uz.discountFrom} −{discount}% · {UI.ru.discountFrom} −{discount}%
          </div>
          {b.promoText && <Tri v={b.promoText} style={{ ...BODY, fontSize: '8.5pt', color: 'rgba(255,255,255,0.85)' }} />}
          {brand.promoCode && (
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '10pt', fontWeight: 800, color: '#e8d48c', marginTop: '2mm', letterSpacing: '1px' }}>
              {UI.uz.promoCode}: {brand.promoCode}
            </div>
          )}
        </div>
      </div>
    </SectionPage>
  );
}

// ── COLLECTION + AR ──
export function CollectionArPage({ b, n }: { b: CollectionArBlock; n: number }) {
  return (
    <SectionPage tag={ui('collectionAR')} n={n}>
      <div style={{ ...H1, fontSize: '18pt' }}>{UI.uz.card} «{t(b.cardName, PRIMARY)}»</div>
      <hr className="mag-divider mag-divider-gold" style={{ width: '25mm' }} />
      <Figure src={b.cardImage} height="46mm" />
      {b.cardText && <Tri v={b.cardText} style={{ ...BODY, fontSize: '9pt', marginBottom: '3mm' }} />}
      <div className="mag-card-elegant">
        <div className="mag-kicker" style={{ color: 'var(--accent)', marginBottom: '1mm', fontSize: '5pt' }}>{ui('liveIn3D')}</div>
        <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>
          {b.arUrl ?? '/magazine/ar'}
        </div>
      </div>
    </SectionPage>
  );
}
