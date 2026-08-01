import React from 'react';
import type {
  ChefWordBlock, RestaurantOfWeekBlock,
  TrendAnalyticsBlock, RecipeBlock,
  FamilyConversionBlock,
  RestaurantBrand, Audience, L10n,
} from '@/lib/magazine/types';
import {
  UI, t, tri, inline,
  type Lang, type UIKey,
} from '@/lib/magazine/i18n';
import { Tri, PageNum, Figure } from './blockParts';

export { CoverPage } from './CoverPage';
export { TocPage } from './TocPage';

const PRIMARY: Lang = 'uz';

function ui(key: UIKey) { return inline(key); }

const H1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontWeight: 900, color: 'var(--ink)', lineHeight: 1.1 };
const BODY: React.CSSProperties = { fontFamily: "'Cormorant Garamond', serif", color: 'var(--ink)', lineHeight: 1.6 };
const contentPad: React.CSSProperties = { padding: '4mm var(--margin-page) 8mm' };

export { SectionPage, ChefWordPage, RestaurantOfWeekPage } from './ChefAndRestPages';
import { SectionPage } from './ChefAndRestPages';

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
                  <div className="mag-kicker" style={{ color: 'var(--cat-9)', marginBottom: '1mm', fontSize: '6.5pt' }}>{ui('googleTrend')}</div>
                  <div style={{ ...BODY, fontSize: '9pt', fontStyle: 'italic', color: 'var(--ink)' }}>«{t(it.trendQuery, PRIMARY)}»</div>
                </div>
              )}
              <div className="mag-kicker" style={{ color: 'var(--accent)', marginBottom: '1mm', fontSize: '6.5pt' }}>
                {it.factTitle ? t(it.factTitle, PRIMARY) : ui('factOfWeek')}
              </div>
              <Tri v={it.fact} style={{ ...BODY, fontSize: '9pt', color: 'var(--ink)' }} />
            </div>
          </div>
          {it.advice && (
            <div className="mag-card-warm" style={{ marginTop: '2mm' }}>
              <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1mm', fontSize: '6.5pt' }}>{ui('microgreenAdvice')}</div>
              <Tri v={it.advice} style={{ ...BODY, fontSize: '8.5pt', color: 'var(--ink-soft)' }} />
            </div>
          )}
        </div>
      ))}
    </SectionPage>
  );
}

export function RecipePage({ b, n }: { b: RecipeBlock; n: number }) {
  return (
    <SectionPage tag={ui('recipeOfWeek')} heroImage={b.heroImage} caption={b.caption} n={n}>
      <Tri v={b.title} style={{ ...H1, fontSize: '19pt' }} />
      {b.subtitle && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '6.5pt', color: 'var(--caption)', marginTop: '1.5mm' }}>{t(b.subtitle, PRIMARY)}</div>}
      <hr className="mag-divider" />
      <div style={{ display: 'flex', gap: '3mm', marginBottom: '3mm' }}>
        {b.chefVersion && (
          <div className="mag-card-dark" style={{ flex: 1 }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1.5mm', fontSize: '6.5pt' }}>{ui('chefVersion')}</div>
            <div style={{ ...BODY, fontSize: '8pt', color: 'rgba(var(--overlay-light-rgb), 0.85)' }}>{t(b.chefVersion, PRIMARY)}</div>
          </div>
        )}
        {b.homeVersion && (
          <div className="mag-card-warm" style={{ flex: 1 }}>
            <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1.5mm', fontSize: '6.5pt' }}>{ui('homeVersion')}</div>
            <div style={{ ...BODY, fontSize: '8pt', color: 'var(--ink-soft)' }}>{t(b.homeVersion, PRIMARY)}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '2.5mm' }}>
        {(b.steps ?? []).map((s, i) => (
          <div key={i} style={{ flex: 1, borderLeft: '2px solid var(--gold)', paddingLeft: '2.5mm' }}>
            {s.image && <img src={s.image} alt="" style={{ width: '100%', height: '16mm', objectFit: 'cover', borderRadius: '1mm', marginBottom: '1.5mm', display: 'block' }} />}
            <div className="mag-kicker" style={{ color: 'var(--gold)', fontSize: '6.5pt' }}>{t(s.title, PRIMARY)}</div>
            <Tri v={s.text} style={{ ...BODY, fontSize: '7.5pt', color: 'var(--ink-soft)', marginTop: '1mm' }} secondaryScale={0.85} />
          </div>
        ))}
      </div>
    </SectionPage>
  );
}

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
        <div style={{ width: '28mm', height: '28mm', background: 'rgb(var(--overlay-light-rgb))', borderRadius: '2mm', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          {qrDataUrl
            ? <img src={qrDataUrl} alt="QR" style={{ width: '100%', height: '100%' }} />
            : <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '7pt', color: 'var(--text-muted)', textAlign: 'center' }}>QR</span>}
        </div>
        <div style={{ flex: 1 }}>
          <div className="mag-kicker" style={{ color: 'var(--gold)', marginBottom: '1.5mm', fontSize: '6.5pt' }}>
            {UI.uz.discountFrom} −{discount}% · {UI.ru.discountFrom} −{discount}%
          </div>
          {b.promoText && <Tri v={b.promoText} style={{ ...BODY, fontSize: '8.5pt', color: 'rgba(var(--overlay-light-rgb), 0.85)' }} />}
          {brand.promoCode && (
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '10pt', fontWeight: 800, color: 'var(--editorial-gold-light)', marginTop: '2mm', letterSpacing: '1px' }}>
              {UI.uz.promoCode}: {brand.promoCode}
            </div>
          )}
        </div>
      </div>
    </SectionPage>
  );
}
