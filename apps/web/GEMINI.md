# apps/web — Next.js PWA

## What this is
Main website and storefront: microgreenuzbekistan.com

## Tech
- Next.js 16 (App Router, RSC)
- React 19, TypeScript strict
- TailwindCSS via `src/app/globals.css`

## 🚫 CRITICAL CONSTRAINTS (Never do this)
- NEVER use inline styles or Tailwind classes for brand colors; ALWAYS use `var(--brand-primary)` etc. from `globals.css`.
- NEVER fetch data directly inside `'use client'` components; fetch in Server Components and pass down as props.
- NEVER invent new JSON response shapes for APIs; ALWAYS use `{ data }` or `{ error, code }`.
- NEVER use `export default` for anything other than Next.js page/layout components.
- NEVER create barrel files (`index.ts` re-exports). Import directly from the source file.

## Architecture
- `src/app/` — Routes (App Router)
- `src/components/` — Reusable UI
- `src/lib/` — Business logic, Prisma client
- `src/utils/` — Pure utility functions

## Handling Mistakes
- If hydration errors occur, check if you used browser APIs (like `window` or `localStorage`) during SSR without `useEffect` or `next/dynamic`.
- If CSS doesn't apply, verify the variable exists in `src/app/globals.css`.
