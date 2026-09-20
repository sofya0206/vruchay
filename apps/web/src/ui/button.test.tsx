import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Button } from './Button';

/*
 * Кнопка — самый частый элемент кабинета, и три её свойства нельзя
 * потерять молча: доступное имя у кнопки-значка, занятость в загрузке
 * и отсутствие системной подсказки.
 */
describe('кнопка', () => {
  it('кнопка-значок несёт доступное имя и не несёт title', () => {
    const markup = renderToStaticMarkup(
      <Button iconOnly label="Скачать" icon={<span>i</span>} title="Скачать" />,
    );
    expect(markup).toContain('aria-label="Скачать"');
    expect(markup).not.toContain('title=');
  });

  it('в загрузке занята и недоступна, подпись остаётся — ширина не прыгает', () => {
    const markup = renderToStaticMarkup(
      <Button variant="primary" loading>
        Сохраняем
      </Button>,
    );
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled');
    expect(markup).toContain('Сохраняем');
  });

  it('с адресом становится ссылкой теми же классами', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <Button variant="primary" to="/documents">
          К документам
        </Button>
      </MemoryRouter>,
    );
    expect(markup).toContain('<a ');
    expect(markup).toContain('href="/documents"');
    expect(markup).toContain('bg-accent-button');
  });

  it('включённый переключатель помечен aria-pressed', () => {
    const markup = renderToStaticMarkup(<Button active>Слои</Button>);
    expect(markup).toContain('aria-pressed="true"');
  });

  it('отвечает на нажатие телом: класс pressable стоит всегда', () => {
    expect(renderToStaticMarkup(<Button>Да</Button>)).toContain('pressable');
  });
});
