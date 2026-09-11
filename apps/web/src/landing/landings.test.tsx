import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { GovPage } from '../pages/GovPage';
import { BusinessPage } from '../pages/BusinessPage';
import { PersonalPage } from '../pages/PersonalPage';
import { EducationPage } from '../pages/EducationPage';
import { InternationalPage } from '../pages/InternationalPage';
import { PricingPage } from '../pages/PricingPage';
import { LANDING_JSON_LD } from '../seo/landing-schema';

/**
 * Проверки посадочных страниц.
 *
 * Вёрстку тесты не стерегут — её видно глазами. Стерегут они две вещи,
 * которые глазами как раз не видны: расхождение цен между страницами
 * и утверждения, за которые придётся отвечать.
 *
 * Цена, названная на одной странице иначе, чем на другой, — это спор
 * с клиентом при оплате. А фраза «мы в реестре российского ПО», написанная
 * до того, как запись появилась, снимает предложение с закупки целиком:
 * реестр открытый и проверяется поиском за минуту.
 */

function html(page: ReactElement): string {
  return renderToStaticMarkup(<MemoryRouter>{page}</MemoryRouter>);
}

const PAGES: [string, ReactElement][] = [
  ['госучреждениям', <GovPage />],
  ['организациям', <BusinessPage />],
  ['физлицам', <PersonalPage />],
  ['образованию', <EducationPage />],
  ['международный контур', <InternationalPage />],
  ['тарифы', <PricingPage />],
];

describe.each(PAGES)('посадочная: %s', (_name, page) => {
  const out = html(page);

  it('отрисовывается и содержит заголовок первого уровня', () => {
    expect(out).toContain('<h1');
  });

  it('ведёт в подвале на юридические документы', () => {
    expect(out).toContain('href="/privacy"');
    expect(out).toContain('href="/oferta"');
    expect(out).toContain('href="/dpa"');
  });

  it('не обещает включения в реестр российского ПО', () => {
    // Запись появится после подачи заявления; до этого любое утверждение
    // о ней — повод снять предложение с закупки.
    expect(out).not.toMatch(/включ[ёе]н[ао]? в (единый )?реестр российск/i);
  });
});

describe('цены не расходятся между страницами', () => {
  const pricing = html(<PricingPage />);

  it('совпадают с разметкой данных для поисковиков', () => {
    // Разметка отдаёт роботу те же числа, что человек видит на странице:
    // расхождение поисковики считают обманом и снимают сниппет целиком.
    const offers = JSON.stringify(LANDING_JSON_LD);
    expect(offers).toContain('29000');
    expect(offers).toContain('69000');
    expect(offers).toContain('149000');
    expect(pricing).toContain('29 000 ₽');
    expect(pricing).toContain('69 000 ₽');
    expect(pricing).toContain('149 000 ₽');
  });

  it('называют одну и ту же цену превышения на всех страницах', () => {
    for (const [, page] of PAGES) {
      const out = html(page);
      if (out.includes('сверх')) expect(out).toContain('3 ₽');
    }
  });
});

describe('страница для госучреждений', () => {
  const out = html(<GovPage />);

  it('называет нормы, на которые сошлётся юридический отдел', () => {
    expect(out).toContain('часть 5 статьи 18 152-ФЗ');
    expect(out).toContain('часть 3 статьи 6 152-ФЗ');
    expect(out).toContain('44-ФЗ');
    expect(out).toContain('223-ФЗ');
  });

  it('прямо говорит, что записи в реестре пока нет', () => {
    expect(out).toMatch(/реестре российского ПО пока нет/);
  });
});

describe('международная страница', () => {
  const out = html(<InternationalPage />);

  it('не заявляет соответствия GDPR', () => {
    expect(out).toMatch(/GDPR\) не заявляется/);
    expect(out).not.toMatch(/соответству(ем|ет) GDPR/i);
  });
});
