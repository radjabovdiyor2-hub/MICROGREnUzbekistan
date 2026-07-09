'use client';

import * as Icons from '@/components/ui/Icons';
import { useLang } from '@/components/providers/LangProvider';

export function StoreLocation() {
  const { t } = useLang();

  return (
    <section className="section" id="location-section">
      <div className="container">
        <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icons.MapPin size={28} /> {t('Bizning manzil', 'Наш адрес')}
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 'var(--space-6)',
          alignItems: 'start',
        }}>
          {/* Info */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
            boxShadow: 'var(--shadow-card)',
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl)',
              fontWeight: 'var(--font-bold)',
              marginBottom: 'var(--space-4)',
              color: 'var(--brand-primary)',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <Icons.Home size={22} /> {t("Microgreen Do'koni", 'Магазин Махалу')}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <span style={{ color: 'var(--brand-primary)' }}><Icons.MapPin size={20} /></span>
                <div>
                  <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)' }}>{t('Manzil', 'Адрес')}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>{t("Samarqand viloyati, Kamolot mahallasi, posyolok Super yonida", 'Самаркандская область, махалля Камолот, ориентир посёлок Супер')}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <span style={{ color: 'var(--brand-primary)' }}><Icons.Phone size={20} /></span>
                <div>
                  <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)' }}>{t('Telefon', 'Телефон')}</div>
                  <a href="tel:+998949999599" style={{ color: 'var(--brand-primary)', fontSize: 'var(--text-sm)' }}>+998 94 999 95 99</a>
                  <br />
                  <a href="tel:+998980072020" style={{ color: 'var(--brand-primary)', fontSize: 'var(--text-sm)' }}>+998 98 007 20 20</a>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <span style={{ color: 'var(--brand-primary)' }}><Icons.Clock size={20} /></span>
                <div>
                  <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)' }}>{t('Ish vaqti', 'Режим работы')}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                    {t('Dushanba - Shanba', 'Пн - Сб')}: 08:00 - 20:00
                    <br />
                    {t('Yakshanba', 'Вс')}: 09:00 - 18:00
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <span style={{ color: 'var(--brand-primary)' }}><Icons.Truck size={20} /></span>
                <div>
                  <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)' }}>{t('Yetkazib berish', 'Доставка')}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                    {t('30—90 daqiqa ichida', 'В течение 30—90 минут')}
                    <br />
                    <span style={{ color: 'var(--success)' }}>{t("500 000 so'mdan — bepul!", 'От 500 000 сум — бесплатно!')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
              <a href="https://www.instagram.com/microgreenuzbekistan" target="_blank" rel="noopener noreferrer"
                className="btn btn-outline btn-sm" id="location-instagram"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icons.Instagram size={16} /> Instagram
              </a>
              <a href="tel:+998949999599" className="btn btn-primary btn-sm" id="location-call"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icons.Phone size={16} /> {t("Qo'ng'iroq", 'Позвонить')}
              </a>
            </div>
          </div>

          {/* Map — lazy loaded on click */}
          <div style={{
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            aspectRatio: '4 / 3',
            border: '1px solid var(--border)',
            position: 'relative',
            background: 'var(--bg-tertiary)',
          }}>
              <iframe
                src="https://yandex.ru/map-widget/v1/?pt=66.961888%2C39.581813&z=16&l=map&lang=uz_UZ"
                width="100%"
                height="100%"
                style={{ border: 0, display: 'block' }}
                allowFullScreen
                loading="lazy"
                title="Microgreen do'koni joylashuvi"
              />
            {/* Map Actions Overlay */}
            <div style={{
              position: 'absolute',
              bottom: 'var(--space-3)',
              left: 'var(--space-3)',
              right: 'var(--space-3)',
              display: 'flex',
              gap: 'var(--space-2)',
            }}>
              <a
                href="https://yandex.com/maps/?pt=66.961888,39.581813&z=16&l=map"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm"
                style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  backdropFilter: 'blur(8px)',
                  fontSize: '12px',
                }}
                id="map-yandex"
              >
                <Icons.MapPin size={14} /> {t('Yandex Xarita', 'Яндекс Карты')}
              </a>
              <a
                href="https://www.google.com/maps?q=39.581813,66.961888"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-accent btn-sm"
                style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  backdropFilter: 'blur(8px)',
                  fontSize: '12px',
                }}
                id="map-google"
              >
                <Icons.Navigation size={14} /> Google Maps
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
