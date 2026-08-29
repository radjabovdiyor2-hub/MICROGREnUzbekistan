// ══════════════════════════════════════════════════════════════════════
// Скрипт, который применяет тему ДО первой отрисовки.
//
// ПОЧЕМУ ОН ЖИВЁТ ОТДЕЛЬНО ОТ РАЗМЕТКИ
//
// Он выполняется в `<head>` до React: иначе человек с тёмной темой видит
// белую вспышку на каждой загрузке. Инлайн — единственный способ успеть;
// внешний файл это лишний поход в сеть ровно перед первым кадром.
//
// А инлайн упирается в CSP. Разрешение выдавалось nonce'ом из middleware,
// и на ДИНАМИЧЕСКИХ страницах это работало. На статически собранных —
// `/catalog/microgreens`, `/catalog/baby-leaf`, `/catalog/salads`,
// `/catalog/balans` — нет: во время сборки заголовка `x-nonce` не
// существует, в HTML запекался `nonce=""`, браузер сверял его с живым
// nonce из заголовка и скрипт не исполнял. Тема не применялась ровно на
// четырёх главных посадочных страницах SEO, а в консоли это была одна
// строка про Content Security Policy, которую никто не читает.
//
// Лечится хешем: у постоянного скрипта постоянный sha256, и он разрешает
// исполнение без всякого nonce — хоть на статике, хоть на динамике.
//
// ПОЧЕМУ ХЕШ ЗАПИСАН СТРОКОЙ, А НЕ СЧИТАЕТСЯ
//
// Его читает `middleware.ts`, а middleware Next.js исполняется в Edge —
// там `node:crypto` нет вовсе, и попытка посчитать хеш на месте роняет
// весь middleware («Native module not found: node:crypto»), то есть всю
// авторизацию API разом. Поэтому константа, а сходство её со скриптом
// стережёт тест `themeBootstrap.test.ts`: он считает sha256 в Node и
// сравнивает. Разойтись молча им теперь нельзя.
// ══════════════════════════════════════════════════════════════════════

export const THEME_BOOTSTRAP =
  `(function(){try{var t=localStorage.getItem('Microgreen-theme');` +
  `if(t){document.documentElement.setAttribute('data-theme',t)}` +
  `else{var d=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';` +
  `document.documentElement.setAttribute('data-theme',d)}}` +
  `catch(e){document.documentElement.setAttribute('data-theme','light')}})()`;

/**
 * `sha256-…` для директивы `script-src`.
 *
 * Меняете скрипт выше — пересчитайте:
 *   node -e "console.log(require('crypto').createHash('sha256').update(SCRIPT,'utf8').digest('base64'))"
 * Забудете — упадёт тест, а не тема.
 */
export const THEME_BOOTSTRAP_HASH = "'sha256-xejVSbcaUFGHrq/DIowkIcyJUzi3sWyVf3o7yfdC9go='";
