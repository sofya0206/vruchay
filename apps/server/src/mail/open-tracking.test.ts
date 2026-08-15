import { describe, expect, it } from 'vitest';
import { PIXEL_GIF, pixelUrl, withOpenPixel } from './open-tracking';

/*
 * Ошибка здесь не роняет отправку — она тихо ломает статистику или,
 * что хуже, портит вёрстку письма у получателя. Заметить это по логам
 * невозможно: письмо ушло успешно.
 */

describe('картинка-отметка', () => {
  it('это настоящий GIF', () => {
    // Первые байты файла — подпись формата. Если сюда попадёт мусор,
    // почтовый клиент покажет значок битой картинки в конце письма.
    expect(PIXEL_GIF.subarray(0, 6).toString('ascii')).toBe('GIF89a');
  });

  it('весит меньше сотни байт', () => {
    expect(PIXEL_GIF.length).toBeLessThan(100);
  });
});

describe('адрес отметки', () => {
  it('собирается из внешнего адреса сервиса', () => {
    expect(pixelUrl('https://vruchay.ru', 'abc')).toBe('https://vruchay.ru/api/v1/t/o/abc.gif');
  });

  it('не удваивает косую черту', () => {
    // PUBLIC_URL задаётся руками и нередко приезжает со слэшем на конце.
    expect(pixelUrl('https://vruchay.ru/', 'abc')).toBe('https://vruchay.ru/api/v1/t/o/abc.gif');
  });
});

describe('подстановка в письмо', () => {
  const html = '<p>Здравствуйте!</p>';

  it('дописывает картинку в конец, не трогая текст', () => {
    const result = withOpenPixel(html, 'https://vruchay.ru', 'e1');
    expect(result.startsWith(html)).toBe(true);
    expect(result).toContain('src="https://vruchay.ru/api/v1/t/o/e1.gif"');
  });

  it('картинка не занимает места', () => {
    // Иначе в конце письма появлялась бы пустая полоса или рамка.
    const result = withOpenPixel(html, 'https://vruchay.ru', 'e1');
    expect(result).toContain('width="1"');
    expect(result).toContain('height="1"');
    expect(result).toContain('border:0');
  });

  it('без alt-подписи', () => {
    // Клиент, не загружающий картинки, показал бы её текстом.
    expect(withOpenPixel(html, 'https://vruchay.ru', 'e1')).toContain('alt=""');
  });
});
