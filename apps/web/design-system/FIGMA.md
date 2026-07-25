# Figma ↔ код: мост токенов и playbook

Как связать эту дизайн-систему с Figma по методологии из ролика (Figma как
источник структуры, Figma MCP → токены в стек), адаптировано под реальный
brownfield-проект, где **источник правды сейчас — код** (`tokens.json` → CSS).

> **Честно про окружение:** Figma MCP в этой среде агента **не подключён**
> (доступны только Gmail и Google Calendar MCP). Поэтому сам Figma-файл собирается
> руками по этому playbook. `tokens.json` уже в формате **W3C DTCG / Tokens
> Studio**, поэтому импорт в Figma Variables — в один клик. Когда подключите Figma
> MCP или Dev Mode MCP — агент сможет тянуть структуру фреймов/компонентов и писать
> по ней код (но «пиксель-в-пиксель» кнопки нет: код всё равно пишет агент).

---

## 1. Токены → Figma Variables (плагин Tokens Studio) — почти в один клик

Готовый бандл уже сгенерирован в **`design-system/figma/`** (нативный формат Tokens
Studio, пересобирается вместе с `npm run tokens:build`):

```
figma/$metadata.json   ← порядок наборов: global → light → dark
figma/$themes.json     ← темы Light / Dark уже настроены
figma/global.json      ← типографика, отступы, радиусы, z-index
figma/light.json       ← цвета/тени/скрим/cat-палитра (светлая)
figma/dark.json        ← то же (тёмная)
```

1. В Figma поставь плагин **Tokens Studio for Figma** (бесплатный).
2. Plugin → Settings → Token Storage → **GitHub** (укажи репо + путь `apps/web/design-system/figma`)
   либо **Local/File** и загрузи содержимое папки `figma/`.
3. Плагин подхватит наборы `global/light/dark` и **две готовые темы Light/Dark**
   из `$themes.json` — вручную ничего собирать не надо.
4. **Export → Create Variables.** Получишь Variable Collection с режимами
   Light/Dark — ровно как `[data-theme]` в коде.

> Сырой единый файл `design-system/tokens/tokens.json` (DTCG) тоже импортируется —
> если предпочитаешь один файл и настроить темы руками.

Направление синка: **код → Figma** (сейчас код — источник правды). Правишь токен в
`tokens.json`, `npm run tokens:build`, ре-импорт в Tokens Studio. Если решите
сделать источником Figma — экспортируйте JSON из Tokens Studio обратно в
`tokens.json` и гоняйте `tokens:build`; формат тот же.

---

## 2. Что собрать в Figma (три уровня = как в коде)

**Уровень 1 — Variables** (из шага 1): Colors (brand/bg/text/semantic/border/scrim),
Radius, Type scale, Spacing. Режимы Light/Dark.

**Уровень 2 — Components** (зеркалят `src/components/ui/*`): собирай как Figma
Components с **variant properties**, повторяя пропсы примитивов:

| Figma-компонент | Variant properties (= пропсы) | Состояния |
|---|---|---|
| Button | variant: primary/accent/outline/ghost · size: sm/md/lg/icon | default/hover/active/disabled/loading |
| Card | padded: true/false | rest/hover |
| Badge | variant: primary/accent/ghost/outline/success/warning/error/info | — |
| Input | size: sm/md/lg | default/focus/error/disabled |
| Toast | variant: success/error/warning/info | ± close |
| Progress · Skeleton · Modal | — | — |

**Уровень 3 — Templates**: фреймы реальных экранов на автолейауте (product-grid,
footer, section, hero) — как `Templates/*` сторис. Показывают правильную композицию.

---

## 3. Правила Figma-файла (чтобы MCP отдавал чистую структуру)

- **Variables, а не хардкод** — заливки/тексты/радиусы биндить на переменные.
- **Auto Layout везде**, где в вебе fl/grid; padding/gap = spacing-переменные.
- **Именование слоёв = именам компонентов/пропсов**: `Button/primary/md`,
  `Card`, `Badge/success`. Имя слоя → имя в коде, агенту проще мэпить.
- Одна страница `① Tokens`, одна `② Components`, одна `③ Templates`.

---

## 4. Поток Figma MCP → код (когда подключите)

1. Подключаете Figma Dev Mode MCP (в интерактивной сессии Claude Code: `/mcp` или
   `claude mcp add`).
2. Агент читает выбранный фрейм/компонент: структура, автолейаут, привязанные
   переменные, имена слоёв.
3. Агент пишет React-компонент на **наших примитивах и токенах** (не инлайн-хекс).
4. Сверяете с эталоном, чините системные косяки, обновляете правила
   ([README.md](./README.md)) — потом масштабируете.

---

## 5. Доступная альтернатива уже сейчас — claude.ai/design

В этой среде работает инструмент **DesignSync** + скилл **`/design-sync`**: живой
каталог-витрина дизайн-системы на claude.ai (превью-карточки компонентов,
синхронизация локальной библиотеки покомпонентно). Это не Figma, но закрывает роль
«витрины ДС» без Figma-аккаунта. Запуск: `/design-sync` в интерактивной сессии.

---

## Итог направлений синка

```
tokens.json  ──(Tokens Studio)──►  Figma Variables      (код → Figma, сейчас)
Figma frames ──(Figma MCP)──►      агент пишет код       (когда подключён MCP)
src/components/ui ──(/design-sync)──► claude.ai/design   (витрина, доступно сейчас)
```
