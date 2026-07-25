// ============================================================================
// Microgreen Design System — token build
// ----------------------------------------------------------------------------
// Single source of truth:  design-system/tokens/tokens.json  (W3C DTCG format)
// Outputs (generated, do NOT hand-edit):
//   build/tokens.css  — runtime CSS custom properties (light + dark + global)
//   build/theme.css   — Tailwind v4 @theme block (utilities from the tokens)
//   build/tokens.ts   — typed JS/TS export for logic that needs raw values
//
// Run with:  npm run tokens:build   (from apps/web)   or   node design-system/build-tokens.mjs
//
// This is a deliberately tiny, zero-dependency generator. It emits the EXACT
// current CSS variable names/values, so swapping globals.css over to the import
// is visually a no-op. It can be replaced by Style Dictionary later without
// touching tokens.json (the format is Style-Dictionary / Tokens Studio ready).
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'tokens', 'tokens.json');
const OUT = join(__dirname, 'build');

/** Recursively flatten a DTCG node into { name, value, type } entries.
 *  `name` is the CSS custom-property name WITHOUT the leading `--`, built by
 *  joining the path segments below the theme/global root with `-`. Chosen keys
 *  in tokens.json reproduce the existing variable names 1:1. */
function flatten(node, prefix = []) {
  const out = [];
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (val && typeof val === 'object' && '$value' in val) {
      out.push({ name: [...prefix, key].join('-'), value: String(val.$value), type: val.$type ?? 'other' });
    } else if (val && typeof val === 'object') {
      out.push(...flatten(val, [...prefix, key]));
    }
  }
  return out;
}

/** Deep-convert a DTCG node ($value/$type) to Tokens Studio native (value/type)
 *  so the Figma plugin imports it one-click. */
function toStudio(node) {
  if (node && typeof node === 'object') {
    if ('$value' in node) {
      const o = { value: node.$value };
      if (node.$type) o.type = node.$type;
      return o;
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith('$')) continue;
      out[k] = toStudio(v);
    }
    return out;
  }
  return node;
}

const tokens = JSON.parse(readFileSync(SRC, 'utf8'));
const light = flatten(tokens.light);
const dark = flatten(tokens.dark);
const global = flatten(tokens.global);

const banner = (extra = '') =>
  `/* AUTO-GENERATED from design-system/tokens/tokens.json — do NOT edit by hand.\n` +
  `   Edit the tokens, then run: npm run tokens:build${extra ? `\n   ${extra}` : ''} */\n`;

const decls = (entries, indent = '  ') =>
  entries.map((t) => `${indent}--${t.name}: ${t.value};`).join('\n');

// ---- build/tokens.css ------------------------------------------------------
const tokensCss =
  `${banner()}\n` +
  `:root,\n[data-theme="light"] {\n${decls(light)}\n  color-scheme: light;\n}\n\n` +
  `[data-theme="dark"] {\n${decls(dark)}\n  color-scheme: dark;\n}\n\n` +
  `:root {\n${decls(global)}\n}\n`;

// ---- build/theme.css (Tailwind v4 @theme) ----------------------------------
// Colors reference the runtime vars so utilities stay theme-aware (flip on
// [data-theme]). Radius / font-family / font-size are emitted as static
// literals: their Tailwind key names collide with our runtime var names, so a
// `var()` self-reference would be circular — and these tokens don't change
// between themes anyway. Spacing is omitted: our --space-* scale already equals
// Tailwind's default spacing multiplier, so p-4/gap-4/etc. match as-is.
const isColor = (t) => t.type === 'color' && !t.name.endsWith('-rgb') && !t.name.startsWith('header');
const g = (name) => global.find((t) => t.name === name)?.value;

const colorVars = light
  .filter(isColor)
  .map((t) => `  --color-${t.name}: var(--${t.name});`)
  .join('\n');

const radiusVars = global
  .filter((t) => t.name.startsWith('radius-'))
  .map((t) => `  --${t.name}: ${t.value};`)
  .join('\n');

const fontFamilyVars = ['font-body', 'font-display']
  .map((n) => `  --${n}: ${g(n)};`)
  .join('\n');

const fontSizeVars = global
  .filter((t) => /^text-/.test(t.name))
  .map((t) => `  --${t.name}: ${t.value};`)
  .join('\n');

const themeCss =
  `${banner('Merged into Tailwind via @import in globals.css (theme + utilities layers; no Preflight).')}\n` +
  `@theme {\n` +
  `  /* Colors — theme-aware (bg-brand-primary, text-text-secondary, border-border …) */\n` +
  `${colorVars}\n\n` +
  `  /* Radius — rounded-sm|md|lg|xl|2xl|full */\n${radiusVars}\n\n` +
  `  /* Font family — font-body, font-display */\n${fontFamilyVars}\n\n` +
  `  /* Font size — text-xs … text-4xl */\n${fontSizeVars}\n` +
  `}\n`;

// ---- build/tokens.ts -------------------------------------------------------
const toObj = (entries) =>
  `{\n${entries.map((t) => `  ${JSON.stringify(t.name)}: ${JSON.stringify(t.value)},`).join('\n')}\n}`;

const tokensTs =
  `// AUTO-GENERATED from design-system/tokens/tokens.json — do NOT edit by hand.\n` +
  `// Raw token values for logic that can't use CSS variables (e.g. canvas, framer-motion).\n` +
  `// Prefer CSS variables (var(--token)) or Tailwind utilities in components.\n\n` +
  `export const tokensLight = ${toObj(light)} as const;\n\n` +
  `export const tokensDark = ${toObj(dark)} as const;\n\n` +
  `export const tokensGlobal = ${toObj(global)} as const;\n\n` +
  `export const tokens = { light: tokensLight, dark: tokensDark, global: tokensGlobal } as const;\n`;

// ---- Tokens Studio bundle (import into Figma to sync Variables) -------------
// Three token sets + $metadata (order) + $themes (Light/Dark modes). See FIGMA.md.
const FIGMA = join(__dirname, 'figma');
const themes = [
  { id: 'light', name: 'Light', group: 'Theme', $figmaStyleReferences: {}, $figmaVariableReferences: {},
    selectedTokenSets: { global: 'source', light: 'enabled', dark: 'disabled' } },
  { id: 'dark', name: 'Dark', group: 'Theme', $figmaStyleReferences: {}, $figmaVariableReferences: {},
    selectedTokenSets: { global: 'source', light: 'disabled', dark: 'enabled' } },
];

// ---- write -----------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'tokens.css'), tokensCss);
writeFileSync(join(OUT, 'theme.css'), themeCss);
writeFileSync(join(OUT, 'tokens.ts'), tokensTs);

mkdirSync(FIGMA, { recursive: true });
writeFileSync(join(FIGMA, 'global.json'), JSON.stringify(toStudio(tokens.global), null, 2));
writeFileSync(join(FIGMA, 'light.json'), JSON.stringify(toStudio(tokens.light), null, 2));
writeFileSync(join(FIGMA, 'dark.json'), JSON.stringify(toStudio(tokens.dark), null, 2));
writeFileSync(join(FIGMA, '$metadata.json'), JSON.stringify({ tokenSetOrder: ['global', 'light', 'dark'] }, null, 2));
writeFileSync(join(FIGMA, '$themes.json'), JSON.stringify(themes, null, 2));

console.log(
  `✓ tokens built → build/{tokens.css, theme.css, tokens.ts} + figma/{global,light,dark,$metadata,$themes}.json\n` +
    `  light: ${light.length}  dark: ${dark.length}  global: ${global.length}  colors→tailwind: ${light.filter(isColor).length}`,
);
