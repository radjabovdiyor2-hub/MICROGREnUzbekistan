# Design System (apps/web)

Активация: **Glob** — `apps/web/src/**/*.tsx`, `apps/web/src/**/*.css`, `apps/web/design-system/**`.

## Единственный источник истины

```
apps/web/design-system/tokens/tokens.json     W3C DTCG, совместим с Figma (Tokens Studio)
        ↓  npm run tokens:build               → design-system/build-tokens.mjs
apps/web/design-system/build/tokens.css + theme.css
        ↓  @import
apps/web/src/app/globals.css                  Design System v1.0
```

Правишь токен — правишь `tokens.json` и пересобираешь. Правка `build/*.css` руками бессмысленна: следующая сборка её сотрёт.

## Запреты

- **Захардкоженный цвет — дефект.** Только CSS-переменные: `--brand-primary`, `--brand-accent`, `--bg-primary`, `--text-primary`, `--info`, `--cat-1`…`--cat-4`. Ни `#10b981`, ни `rgb(...)`, ни tailwind-класс вроде `text-emerald-500` в новом коде.
- Никаких новых глобальных стилей мимо cascade layers: `@layer theme, base, components, utilities`. Tailwind v4 utilities живут в слое `utilities`.
- `'use client'` — только для реально интерактивных компонентов. По умолчанию RSC.
- Компонент > 200 строк — разбивать.
- Нет default-экспортов, кроме Next.js `page`/`layout`. Нет barrel-файлов (`index.ts` с ре-экспортами).

## Правила

- `const`-arrow для компонентов, деструктуризация props прямо в сигнатуре.
- Файл компонента и экспорт — PascalCase: `ProductCard.tsx` → `export function ProductCard`.
- Mobile-first. Адаптивная типографика через `clamp()`, не через набор брейкпоинтов.
- Тёмная тема — селектор `[data-theme="dark"]`, не медиазапрос.
- Анимации — CSS transitions. Framer Motion только для сложной хореографии, не для hover и fade.
- `prefers-reduced-motion` соблюдать: при активации анимация ≤ 0.01 мс.
- Иконки — `lucide-react`.

## Проверка

```bash
cd apps/web && npm run tokens:build   # если трогал tokens.json
npm run lint                          # ESLint 9
npm run build                         # включает typecheck Next.js
```

Визуальную правку проверять в браузере (`npm run dev`, порт 3005). Скриншот или описание того, что изменилось на экране, — часть отчёта.
