import { describe, expect, it } from 'vitest';
import { parseBody, toHtml, toText, wrapSelection } from './email-body';

/*
 * Перевод идёт в обе стороны: человек правит текст, сервер хранит разметку.
 * Ошибка здесь не даёт отказа — она тихо портит письмо при каждом открытии,
 * и заметит это получатель.
 */

describe('текст → разметка письма', () => {
  it('пустая строка разделяет абзацы', () => {
    expect(toHtml('Первый\n\nВторой')).toBe('<p>Первый</p>\n<p>Второй</p>');
  });

  it('одиночный перенос остаётся внутри абзаца', () => {
    expect(toHtml('С уважением,\nоргкомитет')).toBe('<p>С уважением,<br>оргкомитет</p>');
  });

  it('переносит начертания', () => {
    expect(toHtml('*Поздравляем* и _желаем_')).toBe('<p><b>Поздравляем</b> и <i>желаем</i></p>');
  });

  it('сам делает ссылку из адреса', () => {
    expect(toHtml('Проверить: https://vruchay.ru/verify/1')).toContain(
      '<a href="https://vruchay.ru/verify/1">https://vruchay.ru/verify/1</a>',
    );
  });

  it('не забирает точку в конце предложения в ссылку', () => {
    // «зайдите на https://vruchay.ru.» — точка принадлежит предложению.
    expect(toHtml('Зайдите на https://vruchay.ru.')).toContain('href="https://vruchay.ru"');
    expect(toHtml('Зайдите на https://vruchay.ru.')).toContain('</a>.');
  });

  it('экранирует разметку, введённую человеком', () => {
    // Иначе набранное в поле превратилось бы в разметку письма.
    expect(toHtml('<script>alert(1)</script>')).toContain('&lt;script&gt;');
    expect(toHtml('<script>alert(1)</script>')).not.toContain('<script>');
  });

  it('не оставляет пустых абзацев', () => {
    expect(toHtml('Один\n\n\n\nДва')).toBe('<p>Один</p>\n<p>Два</p>');
  });

  it('переменные не трогает', () => {
    expect(toHtml('Здравствуйте, %name!')).toBe('<p>Здравствуйте, %name!</p>');
  });
});

describe('разметка → текст', () => {
  it('разбирает абзацы и переносы', () => {
    expect(toText('<p>Первый</p><p>С уважением,<br>оргкомитет</p>')).toBe(
      'Первый\n\nС уважением,\nоргкомитет',
    );
  });

  it('разбирает начертания', () => {
    expect(toText('<p><b>Жирный</b> и <i>курсив</i></p>')).toBe('*Жирный* и _курсив_');
  });

  it('ссылку с тем же текстом сводит к адресу', () => {
    expect(toText('<p><a href="https://vruchay.ru">https://vruchay.ru</a></p>')).toBe(
      'https://vruchay.ru',
    );
  });

  it('возвращает мнемоники обратно символами', () => {
    expect(toText('<p>Иванов &amp; Петров</p>')).toBe('Иванов & Петров');
  });
});

describe('обратимость', () => {
  // Главное свойство: открыл, ничего не поменял, сохранил — текст тот же.
  const samples = [
    'Здравствуйте, %name!\n\nВаш документ во вложении.\n\nС уважением,\nоргкомитет',
    '*Поздравляем!* Вы заняли _первое_ место.',
    'Проверить подлинность: https://vruchay.ru/verify/abc',
  ];

  for (const sample of samples) {
    it(`не портит текст: «${sample.slice(0, 30)}…»`, () => {
      expect(toText(toHtml(sample))).toBe(sample);
    });
  }
});

describe('разбор для предпросмотра', () => {
  /*
   * Предпросмотр рисуется из этого же разбора, что и разметка письма.
   * Так они не могут разойтись — а разойдясь, дали бы худшее: человек
   * утверждает письмо по картинке, которая не соответствует отправляемому.
   */

  it('делит на абзацы', () => {
    expect(parseBody('Первый\n\nВторой')).toHaveLength(2);
  });

  it('одиночный перенос — кусок «перенос», а не новый абзац', () => {
    const [p] = parseBody('С уважением,\nоргкомитет');
    expect(p.map((r) => r.kind)).toEqual(['text', 'break', 'text']);
  });

  it('различает начертания и ссылку', () => {
    const [p] = parseBody('*Жирный* и _курсив_ и https://vruchay.ru');
    expect(p.filter((r) => r.kind === 'bold')).toHaveLength(1);
    expect(p.filter((r) => r.kind === 'italic')).toHaveLength(1);
    expect(p.filter((r) => r.kind === 'link')).toHaveLength(1);
  });

  it('в кусках лежит исходный текст, а не разметка', () => {
    // Предпросмотр рисует их как есть — экранировать нечего и незачем.
    const [p] = parseBody('<b>не тег</b>');
    expect(p).toEqual([{ kind: 'text', text: '<b>не тег</b>' }]);
  });

  it('переменные остаются на месте', () => {
    const [p] = parseBody('Здравствуйте, %name!');
    expect(p[0]).toEqual({ kind: 'text', text: 'Здравствуйте, %name!' });
  });

  it('пустой текст даёт ноль абзацев', () => {
    expect(parseBody('')).toEqual([]);
    expect(parseBody('\n\n  \n')).toEqual([]);
  });

  it('подчёркивания в ключах полей не открывают курсив', () => {
    expect(toHtml('Здравствуйте, %last_name %first_name!')).toBe('<p>Здравствуйте, %last_name %first_name!</p>');
  });

  it('поле с подчёркиванием внутри курсива остаётся целым', () => {
    expect(toHtml('_%name_dat, поздравляем_')).toBe('<p><i>%name_dat, поздравляем</i></p>');
  });

  it('разбор и разметка согласованы: одинаковое число абзацев', () => {
    const sample = 'Первый\n\n*Второй* с https://vruchay.ru\n\nТретий';
    expect(parseBody(sample)).toHaveLength(toHtml(sample).split('<p>').length - 1);
  });
});

describe('кнопки начертания', () => {
  it('оборачивает выделенное', () => {
    const r = wrapSelection('Поздравляем всех', 0, 11, '*');
    expect(r.text).toBe('*Поздравляем* всех');
    expect(r.text.slice(r.selectionStart, r.selectionEnd)).toBe('Поздравляем');
  });

  it('снимает начертание при повторном нажатии', () => {
    const r = wrapSelection('*Поздравляем* всех', 0, 13, '*');
    expect(r.text).toBe('Поздравляем всех');
  });

  it('без выделения ставит курсор между знаками', () => {
    const r = wrapSelection('Текст', 5, 5, '_');
    expect(r.text).toBe('Текст__');
    expect(r.selectionStart).toBe(6);
    expect(r.selectionEnd).toBe(6);
  });
});
