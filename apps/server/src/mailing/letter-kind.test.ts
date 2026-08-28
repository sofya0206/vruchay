import { describe, expect, it } from 'vitest';
import {
  marketingSetupRefusal,
  renderLetterBody,
  templateKindRefusal,
  unsubscribeUrl,
} from './letter-kind';
import { templateSchema } from './mailing.dto';

/*
 * Здесь проверяется не удобство, а деньги: рекламный кусок внутри
 * транзакционного письма делает рекламным всё письмо целиком, и штраф
 * по ст. 14.3 КоАП считается за каждый факт отправки. Поэтому разделение
 * потоков проверяется со всех трёх сторон: на входе (схема запроса),
 * при выборе шаблона (поток) и при сборке тела письма.
 */

const MARKETING_MARKERS = ['Реклама', 'Отписаться', '/api/v1/u/'];

describe('реклама не попадает в транзакционное письмо', () => {
  it('в собранном транзакционном письме нет ни пометки о рекламе, ни отписки', () => {
    const html = renderLetterBody({
      kind: 'transactional',
      bodyHtml: '<p>Здравствуйте! Ваш документ во вложении.</p>',
    });

    for (const marker of MARKETING_MARKERS) {
      expect(html).not.toContain(marker);
    }
  });

  it('транзакционное письмо уходит ровно тем, что написал оператор', () => {
    const body = '<p>Ваш документ во вложении.</p>';
    expect(renderLetterBody({ kind: 'transactional', bodyHtml: body })).toBe(body);
  });

  it('рекламодателя нельзя передать вместе с письмом о выдаче документа', () => {
    const parsed = templateSchema.safeParse({
      kind: 'transactional',
      subject: 'Ваш документ',
      bodyHtml: '<p>Здравствуйте!</p>',
      attachGeneratedFile: true,
      advertiserName: 'ООО «Ромашка»',
    });

    expect(parsed.success).toBe(false);
  });

  it('то же письмо без рекламодателя принимается', () => {
    const parsed = templateSchema.safeParse({
      kind: 'transactional',
      subject: 'Ваш документ',
      bodyHtml: '<p>Здравствуйте!</p>',
      attachGeneratedFile: true,
    });

    expect(parsed.success).toBe(true);
  });

  it('рекламный текст нельзя отправить транзакционным потоком', () => {
    expect(templateKindRefusal('transactional', 'marketing')).toMatch(/реклам/i);
  });

  it('письмо о выдаче документа нельзя отправить рекламной рассылкой', () => {
    expect(templateKindRefusal('marketing', 'transactional')).toMatch(/реклам/i);
  });

  it('совпадающие потоки не вызывают возражений', () => {
    expect(templateKindRefusal('transactional', 'transactional')).toBeNull();
    expect(templateKindRefusal('marketing', 'marketing')).toBeNull();
  });
});

describe('рекламное письмо', () => {
  const letter = {
    kind: 'marketing' as const,
    bodyHtml: '<p>Скидка на следующий турнир</p>',
    advertiserName: 'ООО «Ромашка», ИНН 7700000000',
    unsubscribeUrl: 'https://vruchay.ru/api/v1/u/00000000-0000-4000-8000-000000000000',
  };

  it('всегда несёт пометку о рекламе и рекламодателя', () => {
    const html = renderLetterBody(letter);
    expect(html).toContain('Реклама');
    expect(html).toContain('ООО «Ромашка», ИНН 7700000000');
  });

  it('всегда несёт ссылку отписки', () => {
    expect(renderLetterBody(letter)).toContain(letter.unsubscribeUrl);
  });

  it('не собирается без рекламодателя', () => {
    expect(marketingSetupRefusal('')).not.toBeNull();
    expect(marketingSetupRefusal('   ')).not.toBeNull();
    expect(marketingSetupRefusal(null)).not.toBeNull();
    expect(marketingSetupRefusal('ООО «Ромашка»')).toBeNull();
  });

  it('имя рекламодателя экранируется — это текст, а не разметка', () => {
    const html = renderLetterBody({ ...letter, advertiserName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('в схеме запроса рекламодатель обязателен', () => {
    const parsed = templateSchema.safeParse({
      kind: 'marketing',
      subject: 'Скидка',
      bodyHtml: '<p>Скидка</p>',
      attachGeneratedFile: false,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('ссылка отписки', () => {
  it('строится от внешнего адреса сервиса и идентификатора письма', () => {
    expect(unsubscribeUrl('https://vruchay.ru', 'abc')).toBe('https://vruchay.ru/api/v1/u/abc');
  });

  it('не удваивает косую черту', () => {
    expect(unsubscribeUrl('https://vruchay.ru/', 'abc')).toBe('https://vruchay.ru/api/v1/u/abc');
  });
});
