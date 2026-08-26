import { describe, it, expect } from 'vitest';
import { coerceSetting, defaultSettings, PUBLIC_SETTING_KEYS, SETTINGS } from './registry';

// Настройки читают и витрина, и боты, поэтому в базу не должно попадать
// ничего, что потом сломает расчёт заказа или сообщение бота.

describe('coerceSetting', () => {
  it('приводит строку с пробелами к числу', () => {
    const res = coerceSetting('delivery.fee', '30 000');
    expect(res).toEqual({ ok: true, value: 30000 });
  });

  it('отвергает нечисловое значение для денежного поля', () => {
    const res = coerceSetting('delivery.fee', 'бесплатно');
    expect(res.ok).toBe(false);
  });

  it('не пускает процент скидки выше 100', () => {
    const res = coerceSetting('bonus.referralPercent', 150);
    expect(res.ok).toBe(false);
  });

  it('не пускает отрицательный порог склада', () => {
    expect(coerceSetting('stock.criticalLevel', -1).ok).toBe(false);
  });

  it('принимает 0 там, где минимум 0', () => {
    // Пороговое значение: раньше проверка «> 0» отсекла бы бесплатную доставку.
    expect(coerceSetting('delivery.fee', 0)).toEqual({ ok: true, value: 0 });
  });

  it('разбирает список способов оплаты из строки', () => {
    const res = coerceSetting('payment.methods', 'cash, card ,transfer');
    expect(res).toEqual({ ok: true, value: ['cash', 'card', 'transfer'] });
  });

  it('не пускает обратно Click и Payme: платёж по ним не создаётся', () => {
    // Кнопки рисовались, клиент выбирал способ — и оставался должен
    // наличными. Пока нет merchant-контрактов, обещание не должно
    // возвращаться ни правкой кода, ни правкой настройки в админке.
    const res = coerceSetting('payment.methods', 'cash, click, payme');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('click');
  });

  it('по умолчанию на оформлении только то, что действительно работает', () => {
    expect(SETTINGS['payment.methods'].default).toEqual(['cash', 'card', 'transfer']);
  });

  it('не даёт сохранить пустой список способов оплаты', () => {
    // Пустой список сломал бы оформление заказа на витрине.
    expect(coerceSetting('payment.methods', '').ok).toBe(false);
    expect(coerceSetting('payment.methods', []).ok).toBe(false);
  });

  it('понимает строковое "true" для флага', () => {
    expect(coerceSetting('content.bannerEnabled', 'true')).toEqual({ ok: true, value: true });
    expect(coerceSetting('content.bannerEnabled', false)).toEqual({ ok: true, value: false });
  });

  it('отказывает в неизвестном ключе', () => {
    expect(coerceSetting('delivery.nonexistent', 1).ok).toBe(false);
  });
});

describe('defaultSettings', () => {
  it('содержит дефолты, совпадающие с прежним поведением кода', () => {
    const d = defaultSettings();
    expect(d['delivery.fee']).toBe(25_000);
    expect(d['delivery.freeThreshold']).toBe(500_000);
    expect(d['bonus.referralPercent']).toBe(3);
    expect(d['bonus.referrerReward']).toBe(5000);
    expect(d['bonus.newUserReward']).toBe(2000);
    expect(d['stock.criticalLevel']).toBe(2);
  });

  it('каждый дефолт проходит собственную валидацию', () => {
    // Иначе настройку нельзя было бы пересохранить её же значением.
    for (const [key, value] of Object.entries(defaultSettings())) {
      expect(coerceSetting(key, value).ok, `${key}`).toBe(true);
    }
  });
});

describe('публичные ключи', () => {
  it('отдают боту и клиенту доставку и контакты', () => {
    expect(PUBLIC_SETTING_KEYS).toContain('delivery.fee');
    expect(PUBLIC_SETTING_KEYS).toContain('delivery.freeThreshold');
    expect(PUBLIC_SETTING_KEYS).toContain('contacts.phonePrimary');
  });

  it('не публикуют внутренние пороги и бюджеты', () => {
    expect(PUBLIC_SETTING_KEYS).not.toContain('stock.criticalLevel');
    expect(PUBLIC_SETTING_KEYS).not.toContain('ai.monthlyBudgetUsd');
  });
});
