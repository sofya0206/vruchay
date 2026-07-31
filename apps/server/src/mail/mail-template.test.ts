import { describe, expect, it } from 'vitest';
import { escapeHtml, isValidEmail, renderHtmlTemplate, renderSubject } from './mail-template';

describe('экранирование', () => {
  it('обезвреживает разметку в данных получателя', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('подставляет имя в HTML безопасно', () => {
    const html = renderHtmlTemplate('<p>Здравствуйте, %name!</p>', {
      name: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    // Разметка самого шаблона при этом остаётся рабочей.
    expect(html).toContain('<p>');
  });

  it('сохраняет обычные имена без искажений', () => {
    expect(renderHtmlTemplate('<p>%name</p>', { name: 'Пётр Ерёменко' })).toBe(
      '<p>Пётр Ерёменко</p>',
    );
  });

  it('не ломается на кавычках и амперсандах в названии клуба', () => {
    const html = renderHtmlTemplate('<p>%team</p>', { name: '', team: 'Клуб «Дельфин» & Ко' });
    expect(html).toContain('&amp;');
    expect(html).toContain('«Дельфин»');
  });
});

describe('тема письма', () => {
  it('подставляет переменные и убирает переводы строк', () => {
    // Перевод строки в теме позволил бы подделать заголовки письма.
    expect(renderSubject('Сертификат для %name', { name: 'Иванов\nBcc: chужой@mail.ru' })).toBe(
      'Сертификат для Иванов Bcc: chужой@mail.ru',
    );
  });
});

describe('isValidEmail', () => {
  it('принимает обычные адреса', () => {
    for (const ok of ['ivanov@mail.ru', 'a.b-c_d@sub.example.co']) {
      expect(isValidEmail(ok)).toBe(true);
    }
  });

  it('отклоняет то, что реально встречается в таблицах от федераций', () => {
    for (const bad of ['', '   ', 'нет почты', 'ivanov@', '@mail.ru', 'ivanov mail.ru', 'ivanov@mail']) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});
