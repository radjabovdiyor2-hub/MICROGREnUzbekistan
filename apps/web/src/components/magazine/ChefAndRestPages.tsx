import React from 'react';
import type { ChefWordBlock, RestaurantOfWeekBlock } from '@/lib/magazine/types';
import { inline, tri, t, type Lang, type UIKey } from '@/lib/magazine/i18n';
import { Tri, PageNum } from './blockParts';

const PRIMARY: Lang = 'uz';
function ui(key: UIKey) { return inline(key); }

const H1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontWeight: 900, color: 'var(--ink)', lineHeight: 1.1 };
const BODY: React.CSSProperties = { fontFamily: "'Cormorant Garamond', serif", color: 'var(--ink)', lineHeight: 1.6 };
const contentPad: React.CSSProperties = { padding: '4mm var(--margin-page) 8mm' };

export function SectionPage({ tag, heroImage, caption, n, children }: {
  tag: string; audience?: unknown; heroImage?: string; caption?: any; n: number; children: React.ReactNode;
}) {
  return (
    <div className="mag-page">
      {heroImage ? (
        <div style={{ height: '74mm', overflow: 'hidden', position: 'relative' }}>
          <img src={heroImage} alt="" className="mag-hero-img" style={{ height: '100%' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '16mm', background: 'linear-gradient(transparent,var(--paper))' }} />
          <div style={{ position: 'absolute', top: '5mm', left: 'var(--margin-page)' }}>
            <span className="mag-section-tag mag-section-tag-dark" style={{ fontSize: '6.5pt' }}>{tag}</span>
          </div>
        </div>
      ) : (
        <div style={{ padding: '4mm var(--margin-page) 0' }}>
          <span className="mag-section-tag" style={{ fontSize: '6.5pt' }}>{tag}</span>
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
      <div className="mag-card-warm" style={{ marginTop: '5mm' }}>
        <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1mm', fontSize: '6.5pt' }}>{ui('chefVersion')}</div>
        <div style={{ ...BODY, fontSize: '9pt', fontStyle: 'italic', color: 'var(--ink-soft)' }}>
          «Har kuni yangi ko‘kat, tirik olov va samimiy mehmondo‘stlik — taomimiz siri.»
          <div className="mag-lang-sec">
            <div className="mag-lang-sec-line" style={{ fontSize: '7.5pt' }}>
              <span className="mag-lang-tag">ru</span>«Свежая зелень, живой огонь и радушие — секрет каждого нашего блюда.»
            </div>
          </div>
        </div>
      </div>
    </SectionPage>
  );
}

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
            <div className="mag-kicker" style={{ color: 'var(--accent)', marginBottom: '1mm', fontSize: '6.5pt' }}>{ui('whatToOrder')}</div>
            <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>{t(b.whatToOrder, PRIMARY)}</div>
          </div>
        )}
        {b.rating && (
          <div className="mag-card-warm" style={{ flex: 1 }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1mm', fontSize: '6.5pt' }}>{ui('ourRating')}</div>
            <div style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }}>{t(b.rating, PRIMARY)}</div>
          </div>
        )}
      </div>
    </SectionPage>
  );
}
