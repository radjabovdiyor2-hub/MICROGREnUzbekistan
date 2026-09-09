import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THRESHOLDS,
  GRACE_SEC,
  MIN_JUDGED_SEC,
  reconcileLeg,
  verdictLabel,
  verdictToken,
} from './reconcile';

describe('reconcileLeg', () => {
  it('без эталона не судит вовсе', () => {
    const r = reconcileLeg({ actualSec: 3600, expectedSec: null });
    expect(r.verdict).toBe('unknown');
    expect(r.ratio).toBeNull();
    expect(r.deltaSec).toBeNull();
  });

  it('ноль в эталоне — это «не считали», а не «нисколько»', () => {
    // Иначе любое плечо мгновенно становилось бы бесконечно подозрительным.
    expect(reconcileLeg({ actualSec: 1200, expectedSec: 0 }).verdict).toBe('unknown');
  });

  it('уложился в эталон — норма', () => {
    expect(reconcileLeg({ actualSec: 900, expectedSec: 1000 }).verdict).toBe('normal');
  });

  it('запас на парковку и вход не считается расхождением', () => {
    // Ровно эталон плюс запас — человек ещё не сделал ничего странного.
    const r = reconcileLeg({ actualSec: 1200 + GRACE_SEC, expectedSec: 1200 });
    expect(r.verdict).toBe('normal');
  });

  it('заметно дольше — «дольше обычного», но не обвинение', () => {
    // 20 минут эталона против 35 фактических: с учётом запаса это ×1.55.
    const r = reconcileLeg({ actualSec: 35 * 60, expectedSec: 20 * 60 });
    expect(r.verdict).toBe('slow');
  });

  it('втрое дольше эталона — нужен разговор', () => {
    const r = reconcileLeg({ actualSec: 60 * 60, expectedSec: 20 * 60 });
    expect(r.verdict).toBe('suspect');
    expect(r.deltaSec).toBe(40 * 60);
    expect(r.ratio).toBeCloseTo(3, 5);
  });

  it('короткое плечо не судим: там разница в минуту даёт кратность', () => {
    // Три минуты вместо одной — формально ×3, а на деле один светофор.
    const short = Math.min(MIN_JUDGED_SEC - 60, 3 * 60);
    const r = reconcileLeg({ actualSec: short, expectedSec: 60 });
    expect(r.verdict).toBe('normal');
    // Числа при этом показываем — просто не делаем из них вывода.
    expect(r.ratio).toBeGreaterThan(1);
  });

  it('быстрее эталона — норма, а не повод удивляться', () => {
    const r = reconcileLeg({ actualSec: 10 * 60, expectedSec: 20 * 60 });
    expect(r.verdict).toBe('normal');
    expect(r.deltaSec).toBe(-10 * 60);
  });

  it('пороги можно ужесточить снаружи', () => {
    const strict = { slowRatio: 1.1, suspectRatio: 1.2 };
    const facts = { actualSec: 30 * 60, expectedSec: 20 * 60 };
    expect(reconcileLeg(facts, DEFAULT_THRESHOLDS).verdict).toBe('normal');
    expect(reconcileLeg(facts, strict).verdict).toBe('suspect');
  });
});

describe('verdictToken', () => {
  it('использует только объявленные переменные темы', () => {
    // Незадекларированная переменная не ошибка для браузера — он молча
    // берёт унаследованный цвет, и обвиняющий красный тихо превращается
    // в цвет обычного текста. Ровно так три рамки в админке однажды
    // взяли цвет текста вместо var(--border).
    const declared = ['var(--error)', 'var(--text-secondary)', 'var(--text-muted)'];
    for (const v of ['unknown', 'normal', 'slow', 'suspect'] as const) {
      expect(declared).toContain(verdictToken(v));
    }
  });

  it('красным светит ТОЛЬКО явное расхождение', () => {
    const danger = verdictToken('suspect');
    expect(verdictToken('unknown')).not.toBe(danger);
    expect(verdictToken('normal')).not.toBe(danger);
    // «Дольше обычного» — это ещё не обвинение, и цвет у него не красный.
    expect(verdictToken('slow')).not.toBe(danger);
  });
});

describe('verdictLabel', () => {
  it('говорит на обоих языках и не молчит ни про один исход', () => {
    for (const v of ['unknown', 'normal', 'slow', 'suspect'] as const) {
      expect(verdictLabel(v, 'ru')).toBeTruthy();
      expect(verdictLabel(v, 'uz')).toBeTruthy();
    }
  });
});
