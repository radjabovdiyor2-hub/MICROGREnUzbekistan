# Code Style — Microgreen Uzbekistan

## TypeScript (apps/web, apps/game, packages/)

### Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Files (components) | PascalCase | `HeroSection.tsx` |
| Files (utilities) | camelCase | `formatPrice.ts` |
| Files (routes) | lowercase | `page.tsx`, `layout.tsx` |
| Components | PascalCase | `<ProductCard />` |
| Functions | camelCase | `calculateTotal()` |
| Constants | UPPER_SNAKE | `API_URL`, `MAX_ITEMS` |
| Types/Interfaces | PascalCase | `ProductWithCategory` |
| CSS variables | kebab-case | `--brand-primary` |
| Database fields | snake_case (via `@map`) | `created_at`, `is_active` |

### Rules

- **No `any`** — use `unknown` + type guard if needed
- **No default exports** except Next.js pages
- **No barrel files** (`index.ts` re-exports) — import directly
- **Prefer `const` arrow functions** for components
- **Destructure props** in function signature
- **Use `'use client'`** only when component needs interactivity

### Component Structure

```tsx
// 1. Imports
import { useState } from 'react';

// 2. Types
interface Props {
  title: string;
  count: number;
}

// 3. Component
export function MyComponent({ title, count }: Props) {
  // 4. Hooks
  const [open, setOpen] = useState(false);
  
  // 5. Handlers
  const handleClick = () => setOpen(!open);
  
  // 6. Render
  return <div onClick={handleClick}>{title}: {count}</div>;
}
```

## Python (apps/bot, apps/tgas)

### Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Files | snake_case | `sales_bot.py` |
| Functions | snake_case | `handle_order()` |
| Classes | PascalCase | `EventBus` |
| Constants | UPPER_SNAKE | `ADMIN_CHAT_ID` |

### Rules

- **Russian** for docstrings, comments, log messages in `apps/tgas`
- **f-strings** for string formatting (not `.format()`)
- **async/await** everywhere (no sync DB calls)
- **`sqlalchemy.text()`** for raw queries (not ORM models — see `CLAUDE.md`)
- **Type hints** on all function signatures

## CSS

- Use CSS variables from `globals.css` — never hardcode colors
- Design tokens: `--brand-primary`, `--bg-primary`, `--text-primary`
- Mobile-first responsive design
- `clamp()` for responsive font sizes
- Animations: prefer CSS transitions over JS animations
- Dark mode via `[data-theme="dark"]` selector

## Git

- Commit messages in English
- Branch naming: `feature/magazine-page`, `fix/ar-camera-ios`
- Never commit `.env` files
- Always commit `schema.prisma` changes with a descriptive message
