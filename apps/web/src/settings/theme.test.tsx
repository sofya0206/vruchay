// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UiTheme } from '../api/org';
import { ThemeProvider, useTheme } from './theme';

/*
 * Библиотеки для тестов React в проекте нет: рендерим по-настоящему
 * в jsdom и щёлкаем по кнопкам. Компонент-щуп показывает текущее
 * значение стора и даёт три кнопки — по одной на тему.
 */
function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <output>{theme}</output>
      {(['system', 'light', 'dark'] as UiTheme[]).map((value) => (
        <button key={value} type="button" data-theme-choice={value} onClick={() => setTheme(value)}>
          {value}
        </button>
      ))}
    </div>
  );
}

describe('стор темы', () => {
  let host: HTMLDivElement;
  let root: Root;

  const mount = async () => {
    await act(async () => {
      root.render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      );
    });
  };
  const choose = async (value: UiTheme) => {
    await act(async () => {
      host.querySelector<HTMLButtonElement>(`[data-theme-choice="${value}"]`)!.click();
    });
  };
  const current = () => host.querySelector('output')!.textContent;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('без сохранённого выбора — как в системе, атрибута на корне нет', async () => {
    await mount();
    expect(current()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('выбор ставит атрибут на корень и запоминается в хранилище', async () => {
    await mount();
    await choose('dark');
    expect(current()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('vruchay:theme')).toBe('dark');
  });

  it('«как в системе» снимает атрибут, чтобы не перебивать настройку системы', async () => {
    await mount();
    await choose('light');
    await choose('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('vruchay:theme')).toBe('system');
  });

  it('стартует с темы прошлого визита', async () => {
    localStorage.setItem('vruchay:theme', 'dark');
    await mount();
    expect(current()).toBe('dark');
  });

  it('мусор в хранилище не ломает старт', async () => {
    localStorage.setItem('vruchay:theme', 'neon');
    await mount();
    expect(current()).toBe('system');
  });
});
