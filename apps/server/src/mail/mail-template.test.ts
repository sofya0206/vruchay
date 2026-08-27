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

describe('парные формы в письме', () => {
  /*
   * Письмо и приложенная к нему грамота идут получателю вместе. Если
   * в письме останется «награждён(а)», а на грамоте будет «награждена»,
   * человек увидит обе версии рядом и решит, что что-то сломалось.
   */
  it('тело письма раскрывает парные формы по полу', () => {
    const html = renderHtmlTemplate('<p>Вы награждён(а)!</p>', { name: 'Петрова Мария' });
    expect(html).toContain('Вы награждена!');

    const male = renderHtmlTemplate('<p>Вы награждён(а)!</p>', { name: 'Иванов Пётр' });
    expect(male).toContain('Вы награждён!');
  });

  it('тема письма раскрывает парные формы по полу', () => {
    expect(renderSubject('Вы прошёл(ла) обучение', { name: 'Петрова Мария' })).toBe(
      'Вы прошла обучение',
    );
  });

  it('данные получателя парной формой не считаются', () => {
    // Разбор идёт по шаблону, а не по подставленным значениям:
    // иначе чужой файл со списком управлял бы текстом письма.
    const html = renderHtmlTemplate('<p>%note</p>', {
      name: 'Петрова Мария',
      note: 'награждён(а)',
    });
    expect(html).toContain('<p>награждён(а)</p>');
  });

  it('экранирование данных при этом сохраняется', () => {
    const html = renderHtmlTemplate('<p>Вы награждён(а), %name</p>', {
      name: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    // Пол по такому «имени» не определяется — печатаем как написано.
    expect(html).toContain('награждён(а)');
  });
});
