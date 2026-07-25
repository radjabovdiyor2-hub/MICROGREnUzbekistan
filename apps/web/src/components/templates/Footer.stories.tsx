import type { Meta, StoryObj } from '@storybook/nextjs-vite';

// Tier-3 template: the site footer. Class lives in styles/templates.css.
const meta: Meta = {
  title: 'Templates/Footer',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <footer className="footer">
      <div className="footer__inner">
        <div>
          <div className="footer__section-title">Микрозелень</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            Свежая срезка каждый день в Ташкенте.
          </p>
        </div>
        <div>
          <div className="footer__section-title">Каталог</div>
          <ul className="footer__links">
            <li><a href="#">Микрозелень</a></li>
            <li><a href="#">Наборы</a></li>
            <li><a href="#">Оборудование</a></li>
          </ul>
        </div>
        <div>
          <div className="footer__section-title">Компания</div>
          <ul className="footer__links">
            <li><a href="#">О нас</a></li>
            <li><a href="#">Доставка</a></li>
            <li><a href="#">Контакты</a></li>
          </ul>
        </div>
      </div>
      <div className="footer__copyright">© 2026 Microgreen Uzbekistan</div>
    </footer>
  ),
};
