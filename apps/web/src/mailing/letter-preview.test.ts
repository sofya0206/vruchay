import { describe, expect, it } from 'vitest';
import {
  STATUS_LABELS,
  fillVariables,
  previewValues,
  statusTone,
  undeliveredCount,
} from './letter-preview';

describe('подстановка данных в предпросмотр', () => {
  it('подставляет значения получателя', () => {
    expect(fillVariables('Здравствуйте, %name!', { name: 'Иванов Иван' })).toBe(
      'Здравствуйте, Иванов Иван!',
    );
  });

  it('переменную без данных оставляет как есть — это и есть сигнал о пустой колонке', () => {
    expect(fillVariables('Разряд: %rank', { name: 'Иванов' })).toBe('Разряд: %rank');
  });

  it('процент, не похожий на переменную, не трогает', () => {
    expect(fillVariables('Скидка 20% участникам', {})).toBe('Скидка 20% участникам');
  });

  it('настоящие данные важнее заглушек', () => {
    const values = previewValues({ name: 'Иванов Иван' }, ['name', 'rank']);
    expect(values.name).toBe('Иванов Иван');
    expect(values.rank).toBe('значение rank');
  });

  it('без получателя показывает заглушки по всем колонкам', () => {
    expect(previewValues(undefined, ['name'])).toEqual({ name: 'значение name' });
  });
});

describe('состояние письма для человека', () => {
  it('отказ шлюза и отказ ящика — одно и то же «не доставлено»', () => {
    expect(STATUS_LABELS.bounced).toBe('не доставлено');
    expect(STATUS_LABELS.failed).toBe('не доставлено');
  });

  it('недоставленное выделяется тревожным цветом, прочитанное — спокойным', () => {
    expect(statusTone('bounced')).toBe('danger');
    expect(statusTone('failed')).toBe('danger');
    expect(statusTone('opened')).toBe('done');
    expect(statusTone('delivered')).toBe('done');
    expect(statusTone('queued')).toBe('neutral');
  });

  it('недоставленные считаются вместе — по ним и работает кнопка повтора', () => {
    expect(undeliveredCount({ bounced: 2, failed: 3, sent: 10 })).toBe(5);
    expect(undeliveredCount({ sent: 10 })).toBe(0);
    expect(undeliveredCount({})).toBe(0);
  });
});
