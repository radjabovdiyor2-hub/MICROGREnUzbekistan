import type { Page, TestInfo } from "@playwright/test";

// ══════════════════════════════════════════════════════════════════════
// ПРОВЕРКА РАСКЛАДКИ: ЧТО НА ЧТО НАЕЗЖАЕТ, ЧТО ВЫЛЕЗЛО, ЧЕГО НЕ ДОСТАТЬ.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ИНСТРУМЕНТ, А НЕ ГЛАЗА
//
// Претензия владельца — «чтобы ничего не наступало на ничего» — звучит как
// вкусовая, но проверяется механически. Кнопку либо можно нажать, либо
// поверх неё лежит что-то другое; подпись либо видна целиком, либо обрезана
// без многоточия. Это факты, а не мнения, и браузер отвечает на них точно.
//
// Глазами же такое не ловится: в админке сорок вкладок, у карты четыре
// вкладки дока и полноэкранный режим, и дефект вылезает на одной из
// комбинаций. Снимок экрана показывает ту, что открыли; обход показывает
// все.
//
// ПОЧЕМУ `elementFromPoint`, А НЕ СРАВНЕНИЕ ПРЯМОУГОЛЬНИКОВ
//
// Пересечение прямоугольников — не перекрытие. Кнопка внутри карточки
// пересекается с карточкой всегда, значок внутри кнопки — с кнопкой.
// Вопрос не «накладываются ли рамки», а «кому достанется нажатие», и
// ответ на него у браузера уже есть: он считает его на каждый клик и
// честно учитывает `pointer-events`, `z-index` и порядок слоёв.
//
// Поэтому перекрытием считается ровно одно: в середину видимого элемента
// ткнули, а попали в чужой — не в него, не в его потомка и не в его
// предка. Предка допускаем намеренно: подпись, обнимающая флажок,
// перехватывает нажатие СЕБЕ и сама его передаёт — это работает.
// ══════════════════════════════════════════════════════════════════════

export type FindingKind =
  /** В середину элемента попадает посторонний узел: нажатие уйдёт не туда. */
  | "covered"
  /** Элемент вылез за правый край, и его не догнать прокруткой. */
  | "overflow-x"
  /** Текст обрезан рамкой без многоточия: человек не знает, что там дальше. */
  | "clipped"
  /** Прицел меньше пальца. */
  | "tiny"
  /** Лежит в приклеенном слое за пределами экрана: прокруткой не достать. */
  | "unreachable";

export interface Finding {
  kind: FindingKind;
  /** Опознание узла: тег, классы, начало текста. */
  what: string;
  detail: string;
}

export interface AuditOptions {
  /**
   * Где искать. По умолчанию вся страница.
   *
   * Открытая модалка делает всё под собой честно перекрытым, и это не
   * дефект, а её работа. Тогда сценарий сужает проверку до самой модалки.
   */
  scope?: string;
  /**
   * Что не считать дефектом. Селекторы: если узел им соответствует или
   * лежит внутри такого — молчим.
   *
   * Нужен для чужого: контролы MapLibre нарисованы библиотекой, их размер
   * задан не нами, и чинить их в своём коде нечем.
   */
  ignore?: string[];
  /**
   * Слои, которых на бою не существует: перекрытие ими — не дефект.
   *
   * Значок и оверлей ошибок Next.js живут только в режиме разработки и
   * стоят ровно в левом нижнем углу — там же, где кнопки карты. Без этого
   * списка обход сообщал бы о них на каждом экране, и настоящие находки
   * утонули бы в этом шуме.
   */
  transparent?: string[];
  /** Минимальный прицел. Ниже 1024 px в проекте обещано 36. */
  minTarget?: number;
}

/**
 * Снять раскладку с открытой страницы.
 *
 * Ничего не нажимает и не прокручивает: состояние экрана готовит сценарий,
 * инструмент только смотрит.
 */
export async function auditLayout(page: Page, options: AuditOptions = {}): Promise<Finding[]> {
  return page.evaluate((opts: AuditOptions) => {
    const scope: Element = (opts.scope ? document.querySelector(opts.scope) : null) ?? document.body;
    const ignore = opts.ignore ?? [];
    const transparent = opts.transparent ?? ["nextjs-portal", "#__next-build-watcher"];
    const minTarget = opts.minTarget ?? 0;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const out: { kind: FindingKind; what: string; detail: string }[] = [];

    /** Короткое опознание узла — по нему дефект ищется в коде. */
    const name = (el: Element | null): string => {
      if (!el) return "—";
      const tag = el.tagName.toLowerCase();
      const cls =
        typeof el.className === "string" && el.className.trim()
          ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
          : "";
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      const aria = el.getAttribute("aria-label");
      const label = text || aria || "";
      return `${tag}${cls}${label ? ` «${label}»` : ""}`;
    };

    // Слои разработки не проверяем ни как виновников, ни как пострадавших:
    // их кнопки («Reload», «Back» в оверлее ошибок Next.js) на бою не
    // существуют, а прицел у них свой и нам не подвластен.
    const skip = (el: Element): boolean =>
      ignore.some((sel) => el.closest(sel) !== null) ||
      transparent.some((sel) => el.closest(sel) !== null);

    const shown = (el: Element): boolean => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0.5 && r.height > 0.5;
    };

    /** Ближайший предок, который реально прокручивается по X. */
    const scrollsX = (el: Element): boolean => {
      let node: Element | null = el.parentElement;
      while (node && node !== document.documentElement) {
        const ox = getComputedStyle(node).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
        node = node.parentElement;
      }
      return false;
    };

    /** Лежит ли узел внутри приклеенного слоя — того, что прокруткой не сдвинуть. */
    const inFixed = (el: Element): boolean => {
      let node: Element | null = el;
      while (node && node !== document.documentElement) {
        if (getComputedStyle(node).position === "fixed") return true;
        node = node.parentElement;
      }
      return false;
    };

    /** Ближайший предок со своей вертикальной прокруткой. */
    const scroller = (el: Element): Element | null => {
      let node: Element | null = el.parentElement;
      while (node && node !== document.documentElement) {
        const oy = getComputedStyle(node).overflowY;
        if (oy === "auto" || oy === "scroll") return node;
        node = node.parentElement;
      }
      return null;
    };

    /**
     * Лежит ли элемент ЗА видимым окном своего списка.
     *
     * БЕЗ ЭТОЙ ПРОВЕРКИ ИНСТРУМЕНТ ВРЁТ САМЫМ ОБИДНЫМ ОБРАЗОМ. Первый же
     * прогон объявил недостижимыми «Продать» и телефон в карточке точки —
     * ровно то, на что владелец однажды жаловался по-настоящему. Замер
     * показал обратное: лист прокручивается, содержимого в нём 1024 px при
     * окне в 388, и обе кнопки в одном движении пальца.
     *
     * То есть «нарисовано ниже края» и «не достать» — разные вещи, и
     * путать их нельзя: список длиннее экрана есть на каждом втором экране,
     * и если считать это дефектом, настоящие находки утонут в нём.
     *
     * Что за краем списка — про перекрытие молчим (там что угодно сверху,
     * и это нормально), а достижимость решает уже отдельная проверка: она
     * спрашивает не положение, а умеет ли хозяин прокрутиться вообще.
     */
    const outsideScroller = (el: Element): boolean => {
      const box = scroller(el);
      if (!box) return false;
      const br = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return r.bottom > br.bottom + 1 || r.top < br.top - 1;
    };

    const INTERACTIVE =
      'button, a[href], select, textarea, input:not([type="hidden"]), [role="button"], [role="tab"], [role="switch"]';

    // ── 1. Перекрытые органы управления ───────────────────────────────
    for (const el of Array.from(scope.querySelectorAll(INTERACTIVE))) {
      if (skip(el) || !shown(el)) continue;
      const r = el.getBoundingClientRect();

      // Полностью за пределами экрана — это отдельный разговор (ниже),
      // а `elementFromPoint` там всё равно ответит пустотой.
      if (r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H) continue;

      // Середину берём от ВИДИМОЙ части: у элемента, наполовину уехавшего
      // под край, геометрический центр лежит за экраном, и проверка
      // сообщала бы о перекрытии там, где его нет.
      const cx = Math.round((Math.max(0, r.left) + Math.min(W, r.right)) / 2);
      const cy = Math.round((Math.max(0, r.top) + Math.min(H, r.bottom)) / 2);

      // Ниже сгиба своего же списка — не перекрытие, а прокрутка.
      if (outsideScroller(el)) continue;

      const hit = document.elementFromPoint(cx, cy);
      if (!hit) continue;
      if (hit === el || el.contains(hit) || hit.contains(el)) continue;
      if (transparent.some((sel) => hit.closest(sel) !== null)) continue;

      out.push({
        kind: "covered",
        what: name(el),
        detail: `в точке (${cx}, ${cy}) нажатие достаётся ${name(hit)}`,
      });
    }

    // ── 2. Вылет за правый край ───────────────────────────────────────
    //
    // Проверяем не только корневую прокрутку: горизонтальная полоса на
    // странице — это следствие, а виновник может быть глубоко внутри.
    //
    // ТОЛЬКО ПРАВЫЙ КРАЙ. Слева за экраном стоят выдвижные панели — и
    // стоят там намеренно: боковая колонка админки на телефоне припаркована
    // на -280 px и выезжает по бургеру. Считать это дефектом значит
    // сообщать о нём на каждом экране приложения.
    for (const el of Array.from(scope.querySelectorAll("*"))) {
      if (skip(el) || !shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= W + 1) continue;
      // Ленты фильтров и таблицы прокручиваются вбок намеренно.
      if (scrollsX(el)) continue;
      // Сообщаем о самом внешнем виновнике: его дети вылезли вместе с ним,
      // и перечислять их значит утопить причину в следствиях.
      const parent = el.parentElement;
      if (parent && parent !== scope) {
        const pr = parent.getBoundingClientRect();
        if (pr.right > W + 1 && !scrollsX(parent)) continue;
      }
      out.push({
        kind: "overflow-x",
        what: name(el),
        detail: `ширина экрана ${W}, элемент занимает ${Math.round(r.left)}…${Math.round(r.right)}`,
      });
    }

    // ── 3. Текст, обрезанный без многоточия ───────────────────────────
    for (const el of Array.from(scope.querySelectorAll("*"))) {
      if (skip(el) || !shown(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.overflowX !== "hidden" && cs.overflowY !== "hidden") continue;
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      // Многоточие — это честное «дальше есть ещё». Обрезка без него
      // выглядит как законченная строка и врёт.
      const cutX = cs.overflowX === "hidden" && el.scrollWidth > el.clientWidth + 1;
      const cutY = cs.overflowY === "hidden" && el.scrollHeight > el.clientHeight + 1;
      if (!cutX && !cutY) continue;
      if (cutX && cs.textOverflow === "ellipsis") continue;
      out.push({
        kind: "clipped",
        what: name(el),
        detail: cutX
          ? `видно ${el.clientWidth} px из ${el.scrollWidth}, многоточия нет`
          : `видно ${el.clientHeight} px из ${el.scrollHeight} по высоте`,
      });
    }

    // ── 4. Прицел меньше пальца ───────────────────────────────────────
    if (minTarget > 0) {
      for (const el of Array.from(scope.querySelectorAll(INTERACTIVE))) {
        if (skip(el) || !shown(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width >= minTarget - 0.5 && r.height >= minTarget - 0.5) continue;
        out.push({
          kind: "tiny",
          what: name(el),
          detail: `${Math.round(r.width)}×${Math.round(r.height)} при обещанных ${minTarget}`,
        });
      }
    }

    // ── 5. Недостижимое в приклеенном слое ────────────────────────────
    //
    // Самый дорогой дефект и самый тихий: кнопка существует, видна в
    // разметке, проходит все проверки «есть ли она» — и лежит за нижним
    // краем экрана. Приклеенный слой не прокручивается, добраться нечем.
    for (const el of Array.from(scope.querySelectorAll(INTERACTIVE))) {
      if (skip(el) || !shown(el)) continue;
      const r = el.getBoundingClientRect();

      // Случай первый: лежит за окном списка, который прокрутиться НЕ МОЖЕТ.
      // Именно этим когда-то отрезало «Продать» в карточке точки: тело
      // листа отказывалось сжиматься, и `overflow-y: auto` не включался.
      const box = scroller(el);
      if (box && outsideScroller(el) && box.scrollHeight <= box.clientHeight + 1) {
        const br = box.getBoundingClientRect();
        out.push({
          kind: "unreachable",
          what: name(el),
          detail: `выходит за ${name(box)} (${Math.round(br.top)}…${Math.round(br.bottom)}), занимая ${Math.round(r.top)}…${Math.round(r.bottom)}, а прокрутиться тот не может`,
        });
        continue;
      }

      // Случай второй: приклеенный слой за краем экрана. Прокрутки над ним
      // нет по определению — он не движется вместе со страницей.
      if (!inFixed(el) || scroller(el)) continue;
      if (r.top >= -1 && r.bottom <= H + 1) continue;
      out.push({
        kind: "unreachable",
        what: name(el),
        detail: `высота экрана ${H}, элемент занимает ${Math.round(r.top)}…${Math.round(r.bottom)} и прокрутки над ним нет`,
      });
    }

    return out;
  }, options);
}

/**
 * Пройти проверку и приложить находки к отчёту.
 *
 * Отдельная обёртка, потому что список находок сам по себе бесполезен: он
 * нужен либо в утверждении, либо в отчёте рядом со снимком того экрана, на
 * котором получен.
 */
export async function reportLayout(
  page: Page,
  info: TestInfo,
  screen: string,
  options: AuditOptions = {},
): Promise<Finding[]> {
  const findings = await auditLayout(page, options);
  const lines = findings.length
    ? findings.map((f) => `[${f.kind}] ${f.what}\n    ${f.detail}`).join("\n")
    : "чисто";
  await info.attach(`layout:${screen}`, { body: `${screen}\n${lines}\n`, contentType: "text/plain" });
  await info.attach(`shot:${screen}`, {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
  return findings;
}
