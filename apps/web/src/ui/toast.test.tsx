import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Toaster, dismissToast, toast, useToasts } from './Toast';

function Probe() {
  return <output>{useToasts().length}</output>;
}

describe('уведомления', () => {
  it('держит не больше трёх: четвёртое вытесняет самое старое', () => {
    const ids = [1, 2, 3, 4].map((n) => toast({ title: `Т${n}` }));
    const markup = renderToStaticMarkup(<Probe />);
    expect(markup).toContain('>3<');
    ids.forEach(dismissToast);
    expect(renderToStaticMarkup(<Probe />)).toContain('>0<');
  });

  it('ошибка читается вслух как alert, остальное — как status', () => {
    const a = toast({ title: 'Не дошло', tone: 'danger' });
    const b = toast({ title: 'Сохранено', tone: 'ok' });
    const markup = renderToStaticMarkup(<Toaster />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('role="status"');
    dismissToast(a);
    dismissToast(b);
  });
});
