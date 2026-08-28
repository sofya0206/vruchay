import { describe, expect, it } from 'vitest';
import { deliveryProblem } from './bounce-reason';

describe('причина недоставки словами', () => {
  it('у дошедшего письма причины нет', () => {
    expect(deliveryProblem('sent', null)).toBeNull();
    expect(deliveryProblem('delivered', null)).toBeNull();
    expect(deliveryProblem('opened', null)).toBeNull();
    expect(deliveryProblem('queued', null)).toBeNull();
  });

  it('несуществующий адрес называется несуществующим', () => {
    const cases = [
      '550 5.1.1 <i***@example.ru>: Recipient address rejected: User unknown',
      '550 No such user here',
      'SMTP error: 550 5.1.1 The email account does not exist',
    ];
    for (const error of cases) {
      expect(deliveryProblem('bounced', error)?.reason).toBe('Такого адреса не существует');
    }
  });

  it('повторять отправку на несуществующий адрес незачем', () => {
    expect(deliveryProblem('bounced', '550 5.1.1 user unknown')?.retryable).toBe(false);
  });

  it('переполненный ящик отличается от несуществующего — и его стоит повторить', () => {
    const problem = deliveryProblem('bounced', '552 5.2.2 Mailbox full: over quota');
    expect(problem?.reason).toBe('Ящик получателя переполнен — письмо не поместилось');
    expect(problem?.retryable).toBe(true);
  });

  it('отказ по правилам домена получателя называется отказом по правилам', () => {
    for (const error of [
      '554 5.7.1 Message rejected due to policy',
      '550 5.7.509 Access denied, sending domain does not pass DMARC',
      'blocked by spam filter',
    ]) {
      expect(deliveryProblem('bounced', error)?.reason).toBe(
        'Почта получателя отклонила письмо по своим правилам',
      );
    }
  });

  it('временная неудача предлагает повторить, а не исправлять адрес', () => {
    const problem = deliveryProblem('failed', '451 4.7.1 Greylisted, try again later');
    expect(problem?.reason).toContain('временно недоступна');
    expect(problem?.retryable).toBe(true);
  });

  it('сетевая ошибка не выдаётся за проблему с адресом', () => {
    expect(deliveryProblem('failed', 'connect ETIMEDOUT 10.0.0.1:25')?.reason).toBe(
      'Не удалось связаться с почтовым сервером получателя',
    );
  });

  it('молчание провайдера так и называется — причина неизвестна', () => {
    const problem = deliveryProblem('bounced', null);
    expect(problem?.reason).toContain('не сообщила');
    expect(problem?.details).toBeNull();
    // Причина неизвестна — значит, могла быть и временной: повторить даём.
    expect(problem?.retryable).toBe(true);
  });

  it('непонятный ответ шлюза сохраняется целиком — поддержке он нужен', () => {
    const problem = deliveryProblem('failed', 'нечто совершенно неожиданное');
    expect(problem?.reason).toBe('Письмо не доставлено');
    expect(problem?.details).toBe('нечто совершенно неожиданное');
  });
});
