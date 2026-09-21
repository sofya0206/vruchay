import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { LandingPage } from '../pages/LandingPage';
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
 * Вёрстку тесты не стерегут — её видно глазами. Стерегут они утверждения,
 * за которые придётся отвечать и которые глазами не всегда заметны.
 *
 * Тарифную сетку пересматривают (решение владельца, 29.08.2026): пока
 * пересмотр не закончен, ни одна публичная страница не должна называть
 * рубли — случайно оставленная цифра на одной странице спорит с текстом
 * «цены обсуждаются лично» на всех остальных.
 *
 * А фраза «мы в реестре российского ПО», написанная до того, как запись
 * появилась, снимает предложение с закупки целиком: реестр открытый
 * и проверяется поиском за минуту.
 */

function html(page: ReactElement): string {
  return renderToStaticMarkup(<MemoryRouter>{page}</MemoryRouter>);
}

const PAGES: [string, ReactElement][] = [
  ['главная', <LandingPage />],
  ['госучреждениям', <GovPage />],
  ['организациям', <BusinessPage />],
  ['физлицам', <PersonalPage />],
  ['образованию', <EducationPage />],
  ['международный контур', <InternationalPage />],
  ['оплата', <PricingPage />],
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

describe('на публичных страницах нет цен', () => {
  it.each(PAGES)('%s — без рублей', (_name, page) => {
    expect(html(page)).not.toMatch(/\d[\d\s]*₽/);
  });

  it('разметка данных для поисковиков не публикует предложение с ценой', () => {
    // Offer без указанной цены — не Offer, поэтому его нет вовсе,
    // а не «Offer с пустым price»: последнее поисковики тоже читают как обман.
    expect(JSON.stringify(LANDING_JSON_LD)).not.toContain('"@type":"Offer"');
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
