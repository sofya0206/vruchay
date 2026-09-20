import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { columnRowClass } from './SectionLayout';
import { IconButton } from './IconButton';

/*
 * Строка колонки собирается через `cn`, а не склейкой строк.
 *
 * Раньше библиотека склеивала классы шаблонной строкой и передавала
 * `px-0` поверх `px-3`, а `md:pl-0` поверх `md:pl-8`. У Tailwind порядок
 * в атрибуте ничего не решает — побеждает тот, что позже в собранном CSS,
 * — поэтому отмена не срабатывала, отступ складывался с отступом
 * внутренней ссылки, и до значка папки выходило 52 точки вместо двадцати,
 * а строка вырастала вдвое против соседних.
 *
 * Проверяем не «нужный класс есть», а «лишнего не осталось»: только это
 * и значит, что отступ ровно один.
 */
describe('строка колонки: класс снаружи сильнее базового', () => {
  it('отступ, переданный снаружи, заменяет базовый, а не соседствует с ним', () => {
    const cls = columnRowClass({ nested: true }) + '';
    // Базовый горизонтальный отступ ровно один — без пары «px-3 px-0».
    expect(cls.match(/(^|\s)px-\d/g) ?? []).toHaveLength(1);
    expect(cls).not.toContain('px-0');
    expect(cls).toContain('md:pl-5');
    expect(cls).not.toContain('md:pl-8');
  });

  it('вложенная строка отличается от корневой отступом и кеглем', () => {
    const root = columnRowClass();
    const nested = columnRowClass({ nested: true });
    expect(root).not.toContain('md:pl-5');
    expect(nested).toContain('md:pl-5');
    expect(nested).toContain('md:text-[13px]');
  });

  it('под указателем строка красится тихим токеном, а не сиреневой плашкой', () => {
    const cls = columnRowClass();
    expect(cls).toContain('hover:bg-row-hover');
    expect(cls).not.toContain('hover:bg-sunken');
  });
});

/*
 * Системной подсказки в разметке быть не должно: у кнопки со значком
 * подпись показывает своя плашка, а браузерная всплывала бы поверх неё
 * второй раз.
 */
describe('кнопка со значком: подсказка своя, не браузерная', () => {
  it('атрибута title в разметке нет, а доступное имя осталось', () => {
    const markup = renderToStaticMarkup(
      <IconButton label="Удалить лист">
        <span>x</span>
      </IconButton>,
    );
    expect(markup).not.toContain('title=');
    expect(markup).toContain('aria-label="Удалить лист"');
  });

  it('title, переданный снаружи, не протекает в разметку', () => {
    const markup = renderToStaticMarkup(
      <IconButton label="Слои" title="Слои">
        <span>x</span>
      </IconButton>,
    );
    expect(markup).not.toContain('title=');
  });
});
