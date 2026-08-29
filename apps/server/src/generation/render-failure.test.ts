import { describe, expect, it } from 'vitest';
import { jobStopMessage, renderProblem } from './render-failure';

/*
 * Причина неудачи словами.
 *
 * Проверяем не формулировки, а разделение: что попадает в отчёт человеку
 * и что считается общей бедой. Второе дороже ошибки в тексте — от него
 * зависит, остановится ли выпуск или перемелет весь список впустую.
 */

describe('причина, по которой документ не создался', () => {
  it('упавший браузер — общая беда', () => {
    const problem = renderProblem(new Error('Target page, context or browser has been closed'));
    expect(problem.common).toBe(true);
    expect(problem.reason).toContain('аварийно завершился');
  });

  it('не поднявшийся браузер отличается от упавшего: чинить их по-разному', () => {
    const problem = renderProblem(
      new Error('Браузер не удалось запустить 3 раза подряд — печатать нечем'),
    );
    expect(problem.common).toBe(true);
    expect(problem.reason).toContain('не удалось запустить');
  });

  it('недоступное хранилище — общая беда', () => {
    expect(renderProblem(new Error('хранилище недоступно')).common).toBe(true);
    expect(renderProblem(new Error('connect ECONNREFUSED 127.0.0.1:9000')).common).toBe(true);
  });

  it('кончившееся место — общая беда и названо своими словами', () => {
    const problem = renderProblem(new Error("ENOSPC: no space left on device, write"));
    expect(problem.common).toBe(true);
    expect(problem.reason).toContain('место');
  });

  it('не загрузился шрифт — беда этой строки, а не всего выпуска', () => {
    // Подмножество шрифта зависит от текста строки: редкая буква в одной
    // фамилии может не приехать там, где остальные сто вышли исправными.
    const problem = renderProblem(
      new Error('Страница рендера сообщила об ошибке: Не загрузились шрифты: Caveat 400'),
    );
    expect(problem.common).toBe(false);
    expect(problem.reason).toContain('шрифт');
  });

  it('не успевшая отрисоваться страница — беда этой строки', () => {
    const problem = renderProblem(new Error('Timeout 15000ms exceeded'));
    expect(problem.common).toBe(false);
  });

  it('незнакомую причину не выдумываем и общей не считаем', () => {
    // Иначе одна непонятная ошибка останавливала бы всё награждение.
    const problem = renderProblem(new Error('что-то пошло не так'));
    expect(problem.common).toBe(false);
    expect(problem.reason).toBe('Документ не удалось создать');
  });

  it('технический текст остаётся отдельно от того, что видит человек', () => {
    const problem = renderProblem(new Error('AccessDenied at /var/app/dist/storage.js:42'));
    expect(problem.reason).not.toContain('/var/app');
    expect(problem.details).toContain('/var/app');
  });

  it('разбирает и то, что брошено не ошибкой', () => {
    expect(renderProblem('ENOSPC').common).toBe(true);
  });
});

describe('что написано в остановленном задании', () => {
  it('называет причину и обещает, что созданное сохранено', () => {
    const message = jobStopMessage('Хранилище файлов не отвечает');
    expect(message).toContain('хранилище файлов не отвечает');
    expect(message).toContain('продолжить');
    // Наружу — без путей и стеков: полный текст остаётся в журнале сервера.
    expect(message).not.toMatch(/\//);
  });
});
