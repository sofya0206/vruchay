import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Input, Select, Textarea } from './Field';
import { cn } from './cn';

/*
 * Ширина поля, переданная снаружи, обязана победить базовую.
 *
 * У Tailwind порядок классов в атрибуте `class` ничего не решает:
 * побеждает тот, что стоит позже в собранном CSS. Поэтому простая
 * склейка строкой оставляла в разметке и `w-full`, и `w-44` — и какой
 * из них сработает, зависело от сборки, а не от кода. Проверяем не
 * «класс есть», а «лишнего класса не осталось»: только это и значит,
 * что поле нужной ширины.
 */
describe('поля формы: класс снаружи сильнее базового', () => {
  it('ширина заменяет w-full, а не соседствует с ним', () => {
    for (const markup of [
      renderToStaticMarkup(<Input className="w-44" />),
      renderToStaticMarkup(<Textarea className="w-44" />),
      renderToStaticMarkup(<Select className="w-44" />),
    ]) {
      expect(markup).toContain('w-44');
      expect(markup).not.toContain('w-full');
    }
  });

  it('без своей ширины базовая остаётся', () => {
    expect(renderToStaticMarkup(<Input />)).toContain('w-full');
  });

  it('несвязанные классы не выбрасываются', () => {
    const markup = renderToStaticMarkup(<Input className="tabular text-right" />);
    expect(markup).toContain('w-full');
    expect(markup).toContain('tabular');
    expect(markup).toContain('text-right');
  });

  it('cn пропускает пустые значения', () => {
    expect(cn('px-2', false, undefined, null, 'py-1')).toBe('px-2 py-1');
  });
});
