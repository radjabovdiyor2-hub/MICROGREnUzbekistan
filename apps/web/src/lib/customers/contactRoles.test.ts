import { describe, it, expect } from 'vitest';
import { CONTACT_ROLES, contactRoleLabel, decisionMaker, isContactRole } from './contactRoles';

const c = (role: string, decides = false) => ({ role, decides, name: role });

describe('isContactRole', () => {
  it('пропускает свои роли и отвергает чужое', () => {
    for (const r of CONTACT_ROLES) expect(isContactRole(r)).toBe(true);
    expect(isContactRole('waiter')).toBe(false);
    expect(isContactRole('')).toBe(false);
    expect(isContactRole(null)).toBe(false);
  });
});

describe('contactRoleLabel', () => {
  it('переводит известную роль', () => {
    expect(contactRoleLabel('chef')).toBe('Шеф-повар');
  });

  it('неизвестную показывает как есть, а не прячет', () => {
    expect(contactRoleLabel('sommelier')).toBe('sommelier');
  });
});

describe('decisionMaker', () => {
  it('берёт явно отмеченного решающим', () => {
    const r = decisionMaker([c('chef'), c('manager', true)]);
    expect(r?.contact.role).toBe('manager');
    expect(r?.certain).toBe(true);
  });

  // Догадка обязана быть помечена догадкой: иначе владелец пойдёт
  // договариваться о цене с тем, кто её не утверждает, и узнает об этом
  // в конце разговора.
  it('без отметки предполагает владельца, но честно помечает догадку', () => {
    const r = decisionMaker([c('chef'), c('owner')]);
    expect(r?.contact.role).toBe('owner');
    expect(r?.certain).toBe(false);
  });

  it('при отсутствии владельца предполагает управляющего', () => {
    const r = decisionMaker([c('chef'), c('manager')]);
    expect(r?.contact.role).toBe('manager');
    expect(r?.certain).toBe(false);
  });

  // Пустой ответ честнее подстановки первого попавшегося имени.
  it('не выдумывает решающего, когда угадывать не из чего', () => {
    expect(decisionMaker([c('chef'), c('purchaser')])).toBeNull();
    expect(decisionMaker([])).toBeNull();
  });

  it('явная отметка сильнее догадки по роли', () => {
    const r = decisionMaker([c('owner'), c('chef', true)]);
    expect(r?.contact.role).toBe('chef');
    expect(r?.certain).toBe(true);
  });
});
