'use client';

import * as Icons from '@/components/ui/Icons';
import { useLang } from '@/components/providers/LangProvider';
import { LogoIcon } from '@/components/ui/Logo';

export function Footer() {
  const { t } = useLang();

  return (
    <footer className="footer" id="footer">
      <div className="footer__inner">
        {/* Brand */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: 'var(--space-3)',
          }}>
            <LogoIcon size={42} />
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl)',
              fontWeight: 'var(--font-extrabold)',
            }}>
              <span style={{
                background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Microgreen
              </span>
              <span style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--text-muted)',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                WebkitTextFillColor: 'initial',
              }}>
                Uzbekistan
              </span>
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
            {t('Yangi va sog\'lom mikroko\'katlar.', 'Свежая и полезная микрозелень.')}
            <br />
            {t("Mikroko'katlar + Gidroponika.", 'Микрозелень + Гидропоника.')}
          </p>
          {/* Social icons */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            {[
              { href: 'https://instagram.com/Microgreen_uz', icon: <Icons.Instagram size={18} />, label: 'Instagram' },
              { href: 'https://t.me/Microgreenuzbekistan_bot', icon: <Icons.MessageCircle size={18} />, label: 'Telegram' },
              { href: 'tel:+998997772232', icon: <Icons.Phone size={18} />, label: 'Phone' },
            ].map((social, i) => (
              <a key={i} href={social.href} target="_blank" rel="noopener noreferrer"
                aria-label={social.label}
                style={{
                  width: 40, height: 40, borderRadius: '12px',
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-secondary)', transition: 'all 0.2s',
                  textDecoration: 'none',
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'var(--brand-primary-light)'; e.currentTarget.style.color = 'var(--brand-primary)'; e.currentTarget.style.borderColor = 'var(--brand-primary)'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div>
          <h4 className="footer__section-title">{t('Kategoriyalar', 'Категории')}</h4>
          <ul className="footer__links">
            <li><a href="/catalog?category=mikrozelen" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.Leaf size={14} /> {t("Mikroko'katlar", 'Микрозелень')}</a></li>
            <li><a href="/catalog?category=salaty" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.Leaf size={14} /> {t("Salatlar", 'Салаты')}</a></li>
            <li><a href="/catalog?category=semena" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.Droplet size={14} /> {t("Urug'lar", 'Семена')}</a></li>
            <li><a href="/catalog?category=udobreniya" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.Zap size={14} /> {t("O'g'itlar", 'Удобрения')}</a></li>
            <li><a href="/catalog?category=oborudovanie" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.Plug size={14} /> {t("Uskunalar", 'Оборудование')}</a></li>
          </ul>
        </div>

        {/* Info */}
        <div>
          <h4 className="footer__section-title">{t("Ma'lumot", 'Информация')}</h4>
          <ul className="footer__links">
            <li><a href="/#location-section">{t('Biz haqimizda', 'О нас')}</a></li>
            <li><a href="/#location-section">{t('Yetkazib berish', 'Доставка')}</a></li>
            <li><a href="/#location-section">{t('Aloqa', 'Контакты')}</a></li>
            <li><a href="/catalog">{t('Barcha mahsulotlar', 'Все товары')}</a></li>
          </ul>
        </div>

        {/* Contacts */}
        <div>
          <h4 className="footer__section-title">{t('Aloqa', 'Контакты')}</h4>
          <ul className="footer__links">
            <li>
              <a href="tel:+998997772232" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icons.Phone size={14} /> +998 99 777 22 32
              </a>
            </li>
            <li>
              <a href="https://instagram.com/Microgreen_uz" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icons.Instagram size={14} /> @Microgreen_uz
              </a>
            </li>
            <li>
              <a href="https://t.me/Microgreenuzbekistan_bot" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icons.MessageCircle size={14} /> Telegram Bot
              </a>
            </li>
            <li style={{ marginTop: 'var(--space-2)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icons.MapPin size={14} /> {t('Ray senter, Hokimiyat yonida', 'Рай центр, рядом с Хокимиятом')}
            </li>
          </ul>
        </div>
      </div>

      <div className="footer__copyright">
        © {new Date().getFullYear()} Microgreen Uzbekistan. {t('Barcha huquqlar himoyalangan.', 'Все права защищены.')}
      </div>
    </footer>
  );
}
