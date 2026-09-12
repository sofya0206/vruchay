import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Input, Textarea } from './Field';
import { Select } from './Select';
import { NumberField } from './NumberField';
import { DateField } from './DateField';
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
 *
 * Свои контролы в этом же списке не случайно: у них базовые классы
 * тоже висят на корне, и первая же обёртка ради ширины вернула бы
 * ту самую ошибку, от которой тест и написан.
 */
describe('поля формы: класс снаружи сильнее базового', () => {
  it('ширина заменяет w-full, а не соседствует с ним', () => {
    for (const markup of [
      renderToStaticMarkup(<Input className="w-44" />),
      renderToStaticMarkup(<Textarea className="w-44" />),
      renderToStaticMarkup(<Select className="w-44" value="" onChange={() => {}} options={[]} />),
      renderToStaticMarkup(<DateField className="w-44" value="" onChange={() => {}} />),
    ]) {
      expect(markup).toContain('w-44');
      expect(markup).not.toContain('w-full');
    }
  });

  /*
   * Числовое поле — единственное с обёрткой, и это не недосмотр: свои
   * стрелки стоят в правом краю по absolute, а значит нужен предок
   * с relative. Ширина снаружи ложится на обёртку, а w-full внутри —
   * то, чем поле её заполняет. Проверяем именно это, а не отсутствие
   * w-full: иначе тест требовал бы невозможной разметки.
   */
  it('у числового поля ширина ложится на обёртку', () => {
    const markup = renderToStaticMarkup(<NumberField className="w-44" value={0} onChange={() => {}} />);
    expect(markup).toMatch(/^<div class="[^"]*\bw-44\b/);
    expect(markup).not.toMatch(/^<div class="[^"]*\bw-full\b/);
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

/*
 * Контролы обязаны пережить серверный рендер: к document и window
 * обращаются только эффекты и обработчики, но не сама отрисовка.
 * Посадочные страницы в этом проекте снимаются тем же способом.
 */
describe('выпадающий список: разметка в покое', () => {
  const OPTIONS = [
    { value: 'a', label: 'Первая' },
    { value: 'b', label: 'Вторая' },
  ];

  it('закрытый список не выводит ни одного пункта', () => {
    const markup = renderToStaticMarkup(
      <Select value="a" onChange={() => {}} options={OPTIONS} />,
    );
    expect(markup).toContain('Первая');
    expect(markup).not.toContain('Вторая');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('role="combobox"');
  });

  it('значение, которого нет среди опций, не подменяется первым пунктом', () => {
    // Ровно случай условия награждения: колонки в файле не стало, а правило
    // на неё осталось. Молчаливая подмена переписала бы само правило.
    const markup = renderToStaticMarkup(
      <Select value="исчезнувшая" onChange={() => {}} options={OPTIONS} />,
    );
    expect(markup).toContain('исчезнувшая');
    expect(markup).not.toContain('Первая');
  });

  it('подсказка показывается, когда значение пустое', () => {
    const markup = renderToStaticMarkup(
      <Select value="" onChange={() => {}} options={OPTIONS} placeholder="Выберите" />,
    );
    expect(markup).toContain('Выберите');
  });
});

/*
 * Внутри флажка обязан оставаться настоящий вход. Публичная форма
 * «Обсудить условия» собирает согласие через FormData и проверяет его
 * ещё раз перед отправкой: замени вход на div — и заявка молча
 * перестанет уходить.
 */
describe('флажок: внутри настоящий вход', () => {
  it('несёт имя и обязательность', async () => {
    const { Checkbox } = await import('./Checkbox');
    const markup = renderToStaticMarkup(
      <Checkbox name="consent" required checked={false} onChange={() => {}} />,
    );
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain('name="consent"');
    expect(markup).toContain('required');
  });
});
