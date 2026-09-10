import { describe, expect, it } from 'vitest';

import { explainCode, readConfig } from './ezviz';

// ══════════════════════════════════════════════════════════════════════
// Облако EZVIZ отвечает 200 НА ВСЁ.
//
// «Неверный ключ», «камера офлайн», «превышен лимит» и успех приходят
// одним и тем же кодом HTTP — разница только в поле внутри тела. Код,
// который проверяет `res.ok`, считает исправным любой отказ и молча
// перестаёт снимать. Поэтому разбор кода здесь и проверяется.
//
// Вторая половина — слова. Настраивать это будет владелец, а не
// программист: «код 20007» ему не говорит ничего, «камера офлайн» —
// говорит всё.
// ══════════════════════════════════════════════════════════════════════

describe('explainCode', () => {
  it('офлайн-камера названа словами, а не кодом', () => {
    const text = explainCode('20007');
    expect(text).toContain('офлайн');
    expect(text).not.toContain('20007');
  });

  it('чужой серийный номер отличается от офлайна', () => {
    // Разные беды и лечатся по-разному: одна — включить камеру, другая —
    // исправить номер в настройках.
    expect(explainCode('20002')).toContain('серийный');
    expect(explainCode('20014')).toContain('неверно');
  });

  it('неверные ключи приложения названы прямо', () => {
    expect(explainCode('10001')).toContain('ключи');
  });

  it('незнакомый код не теряется — показываем его и текст облака', () => {
    // Молча проглотить неизвестный отказ значит оставить владельца с
    // пустым блоком и без единой зацепки.
    const text = explainCode('31337', 'something odd');
    expect(text).toContain('31337');
    expect(text).toContain('something odd');
  });

  it('незнакомый код без текста всё равно называет себя', () => {
    expect(explainCode('31337')).toContain('31337');
  });
});

describe('readConfig', () => {
  it('без ключей — не настроено, и это не ошибка', () => {
    // Пока владелец не завёл приложение в кабинете EZVIZ, блока фермы
    // просто нет. Бросать исключение значило бы поднимать тревогу о том,
    // чего ещё не включали.
    const saved = { ...process.env };
    delete process.env.EZVIZ_APP_KEY;
    delete process.env.EZVIZ_APP_SECRET;
    delete process.env.EZVIZ_DEVICE_SERIAL;
    expect(readConfig()).toBeNull();
    process.env = saved;
  });

  it('половина ключей — тоже не настроено', () => {
    // Частичная настройка опаснее полного отсутствия: код бы пошёл в
    // облако с пустым секретом и получил невнятный отказ.
    const saved = { ...process.env };
    process.env.EZVIZ_APP_KEY = 'k';
    delete process.env.EZVIZ_APP_SECRET;
    process.env.EZVIZ_DEVICE_SERIAL = 'SN';
    expect(readConfig()).toBeNull();
    process.env = saved;
  });

  it('адрес облака по умолчанию есть, но переопределяется', () => {
    // У EZVIZ адреса разные по регионам, и аккаунт работает только со
    // своим. Вписанный в код один адрес однажды даст «устройство не
    // найдено» на исправной камере.
    const saved = { ...process.env };
    process.env.EZVIZ_APP_KEY = 'k';
    process.env.EZVIZ_APP_SECRET = 's';
    process.env.EZVIZ_DEVICE_SERIAL = 'SN';
    delete process.env.EZVIZ_HOST;
    expect(readConfig()?.host).toMatch(/^https:\/\//);
    process.env.EZVIZ_HOST = 'https://iusopen.ezvizlife.com';
    expect(readConfig()?.host).toBe('https://iusopen.ezvizlife.com');
    process.env = saved;
  });
});
