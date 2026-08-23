import type { IControl, Map as MapLibreMap } from 'maplibre-gl';

// ══════════════════════════════════════════════════════════════════════
// Кнопка полного экрана — родным контролом MapLibre, но своим режимом.
//
// Сам режим у нас вёрсточный (см. useMapFullscreen.ts): Fullscreen API
// на iOS вне <video> не работает, а в поле админку открывают в Telegram.
// Но КНОПКА обязана стоять в общей стопке справа сверху — рядом с зумом и
// «где я», а не рядом с ними же, отодвинутая на глазок.
//
// До этого она и была отодвинута: `marginTop: 76` в разметке сцены. Число
// держалось на том, сколько места занимают два соседних контрола, и
// разъехалось бы от любой их правки — например, от возврата компаса.
//
// Классы `maplibregl-ctrl-fullscreen` и `maplibregl-ctrl-shrink` берём
// родные: иконки «развернуть» и «свернуть» уже лежат в maplibre-gl.css,
// который мы и так импортируем. Рисовать свои значило бы завести вторую
// пару стрелок, отличающуюся от соседних кнопок на пиксель.
// ══════════════════════════════════════════════════════════════════════

export interface FullscreenToggleOptions {
  onToggle: () => void;
  /** Состояние читается функцией, а не значением: контрол переживает рендеры. */
  isFull: () => boolean;
  label: (full: boolean) => string;
}

export class FullscreenToggleControl implements IControl {
  private container: HTMLDivElement | null = null;
  private button: HTMLButtonElement | null = null;

  constructor(private readonly options: FullscreenToggleOptions) {}

  onAdd(_map: MapLibreMap): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    const button = document.createElement('button');
    button.type = 'button';

    const icon = document.createElement('span');
    icon.className = 'maplibregl-ctrl-icon';
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);

    button.addEventListener('click', () => this.options.onToggle());
    container.appendChild(button);

    this.container = container;
    this.button = button;
    this.sync();
    return container;
  }

  /**
   * Перерисовать иконку и подпись под текущее состояние.
   *
   * Зовётся из эффекта холста, а не сама: контрол живёт вне React и о
   * смене состояния узнать иначе не может.
   */
  sync(): void {
    const button = this.button;
    if (!button) return;

    const full = this.options.isFull();
    button.className = full ? 'maplibregl-ctrl-shrink' : 'maplibregl-ctrl-fullscreen';

    const label = this.options.label(full);
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(full));
  }

  onRemove(): void {
    this.container?.remove();
    this.container = null;
    this.button = null;
  }
}
