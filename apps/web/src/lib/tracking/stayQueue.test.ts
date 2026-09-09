import { describe, expect, it } from 'vitest';

import {
  MAX_AGE_MS,
  newClientRef,
  requestFor,
  splitByAge,
  type FieldAction,
} from './stayQueue';

const REF = 'abc12345-deadbeefdeadbeef';

function action(over: Partial<FieldAction> = {}): FieldAction {
  return { kind: 'arrive', clientRef: REF, at: Date.now(), customerId: 7, ...over };
}

describe('newClientRef', () => {
  it('подходит под формат, который принимает сервер', () => {
    // Роуты проверяют ключ регуляркой /^[A-Za-z0-9_-]{8,64}$/ — ключ, не
    // прошедший её, молча потерял бы связь стоянки, фото и отъезда.
    expect(newClientRef()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('не повторяется', () => {
    const keys = new Set(Array.from({ length: 200 }, () => newClientRef()));
    expect(keys.size).toBe(200);
  });
});

describe('splitByAge', () => {
  it('свежее оставляет, протухшее отделяет', () => {
    const now = Date.now();
    const { fresh, stale } = splitByAge(
      [action({ at: now - 1000 }), action({ at: now - MAX_AGE_MS - 1000 })],
      now,
    );
    expect(fresh).toHaveLength(1);
    expect(stale).toHaveLength(1);
  });

  it('пустая очередь не ломается', () => {
    expect(splitByAge([])).toEqual({ fresh: [], stale: [] });
  });
});

describe('requestFor', () => {
  it('приезд шлёт clientRef и МОМЕНТ ПРИЕЗДА, а не время отправки', () => {
    const at = Date.now() - 3 * 3600_000;
    const req = requestFor(action({ at }));
    expect(req?.init.method).toBe('POST');
    const body = JSON.parse(req?.init.body as string);
    expect(body.clientRef).toBe(REF);
    expect(body.arrivedAt).toBe(at);
    expect(body.customerId).toBe(7);
  });

  it('отъезд ссылается на стоянку ключом телефона, а не номером базы', () => {
    // Номер выдаёт сервер, до которого из подвала не достучались, — по нему
    // сослаться нечем, и это главная причина существования clientRef.
    const req = requestFor(action({ kind: 'leave' }));
    expect(req?.init.method).toBe('PATCH');
    const body = JSON.parse(req?.init.body as string);
    expect(body.clientRef).toBe(REF);
    expect(body.stayId).toBeUndefined();
  });

  it('фото уходит формой с тем же ключом и временем съёмки', () => {
    const at = Date.now() - 7200_000;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    const req = requestFor(action({ kind: 'photo', at, blob }));
    expect(req?.url).toBe('/api/admin/tracking/photo');
    const form = req?.init.body as FormData;
    expect(form.get('clientRef')).toBe(REF);
    expect(form.get('takenAt')).toBe(String(at));
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('фото без кадра — не запрос: слать пустую форму бессмысленно', () => {
    expect(requestFor(action({ kind: 'photo', blob: undefined }))).toBeNull();
  });

  it('все три действия ссылаются на ОДНУ стоянку', () => {
    const ref = newClientRef();
    const blob = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
    const arrive = requestFor(action({ kind: 'arrive', clientRef: ref }));
    const photo = requestFor(action({ kind: 'photo', clientRef: ref, blob }));
    const leave = requestFor(action({ kind: 'leave', clientRef: ref }));

    expect(JSON.parse(arrive?.init.body as string).clientRef).toBe(ref);
    expect((photo?.init.body as FormData).get('clientRef')).toBe(ref);
    expect(JSON.parse(leave?.init.body as string).clientRef).toBe(ref);
  });
});
