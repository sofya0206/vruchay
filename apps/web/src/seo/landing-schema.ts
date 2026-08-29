import { FAQ_ITEMS } from '../landing/faq-items';
import { PLANS } from '../landing/plans';

/**
 * Разметка данных для посадочной страницы.
 *
 * Значения обязаны совпадать с тем, что человек видит на странице: расхождение
 * разметки и видимого текста поисковики считают обманом и снимают расширенный
 * сниппет целиком. Поэтому предложение и вопросы здесь собираются из тех же
 * данных, что и компоненты.
 *
 * Публичных цен у сервиса нет, и объявлять их в Offer нельзя: цена в разметке
 * без цены на странице — ровно тот случай, за который снимают сниппет. Пока
 * планы без цены, предложение описывается без неё; появится `priceRub`
 * в plans.ts — появится и цена в разметке.
 *
 * FAQPage даёт раскрывающиеся вопросы прямо в выдаче. Случай ровно наш:
 * вопросы настоящие, ответы совпадают с поведением системы.
 */

const SITE = 'https://vruchay.ru';

/**
 * Предложение. Без цены это `PriceSpecification` с пометкой «по запросу»:
 * поисковику честнее сказать, что цена не объявлена, чем не сказать ничего.
 */
const offers = PLANS.map((plan) => ({
  '@type': 'Offer',
  name: plan.name,
  description: plan.volume,
  ...(plan.priceRub === null
    ? { priceSpecification: { '@type': 'PriceSpecification', priceCurrency: 'RUB' } }
    : { price: plan.priceRub, priceCurrency: 'RUB' }),
  availability: 'https://schema.org/InStock',
  url: `${SITE}/#ceny`,
}));

export const LANDING_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'Вручай',
      url: SITE,
      description: 'Сервис массовой выдачи именных наградных документов',
      areaServed: 'RU',
    },
    {
      '@type': 'Product',
      name: 'Вручай — выдача наградных документов',
      description:
        'Именное заполнение готовых бланков грамот, дипломов и сертификатов по списку участников с рассылкой на адреса получателей.',
      brand: { '@id': `${SITE}/#organization` },
      offers,
    },
    {
      '@type': 'FAQPage',
      // Вопросы те же, что на странице: у разметки нет своей копии текста.
      mainEntity: FAQ_ITEMS.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
  ],
};
