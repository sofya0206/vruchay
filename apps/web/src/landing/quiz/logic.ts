/**
 * Подбор тарифа по ответам.
 *
 * Смысл квиза не в том, чтобы собрать анкету, а в том, чтобы каждый ответ
 * менял итог. Поэтому здесь только те вопросы, которые действительно влияют
 * на цену или на состав: объём, способ выдачи, домен отправителя.
 *
 * Логика вынесена из разметки, потому что это единственное место, где можно
 * ошибиться дорого: посчитать клиенту не тот тариф — значит выставить не тот
 * счёт. Разметку такую не проверишь, чистую функцию — легко.
 */

export type Volume = 'to5k' | 'to20k' | 'to60k' | 'more';
export type Delivery = 'weSend' | 'selfService' | 'api';
export type Sender = 'ourDomain' | 'serviceDomain';
export type Payer = 'company' | 'person';

export interface Answers {
  volume?: Volume;
  delivery?: Delivery;
  sender?: Sender;
  payer?: Payer;
  kinds?: string[];
}

export type TariffId = 'start' | 'pro' | 'max' | 'enterprise' | 'payg';

export interface Tariff {
  id: TariffId;
  name: string;
  /** Цена в рублях за год. У оплаты по факту и Enterprise её нет. */
  priceRub: number | null;
  note: string;
}

export const TARIFFS: Record<TariffId, Tariff> = {
  start: { id: 'start', name: 'Старт', priceRub: 29_000, note: 'до 5 000 документов в год' },
  pro: { id: 'pro', name: 'Про', priceRub: 69_000, note: 'до 20 000 документов в год' },
  max: { id: 'max', name: 'Максимум', priceRub: 149_000, note: 'до 60 000 документов в год' },
  enterprise: { id: 'enterprise', name: 'Индивидуальные условия', priceRub: null, note: 'свыше 60 000 документов в год' },
  payg: { id: 'payg', name: 'Оплата за документ', priceRub: null, note: '3 ₽ за выданный документ' },
};

export interface Recommendation {
  tariff: Tariff;
  /** Почему получился именно он — по одной строке на решающий ответ. */
  reasons: string[];
}

const BY_VOLUME: Record<Volume, TariffId> = {
  to5k: 'start',
  to20k: 'pro',
  to60k: 'max',
  more: 'enterprise',
};

const ORDER: TariffId[] = ['payg', 'start', 'pro', 'max', 'enterprise'];

/** Тариф не должен «понижаться» из-за одного ответа при высоком объёме. */
function highest(a: TariffId, b: TariffId): TariffId {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

export function recommend(answers: Answers): Recommendation | null {
  const { volume, delivery, sender, payer } = answers;
  if (!volume) return null;

  const reasons: string[] = [];

  // Частное лицо годовую подписку не берёт: ему нужен разовый выпуск.
  if (payer === 'person') {
    reasons.push('Оплата от частного лица — подписка на год здесь не нужна');
    if (volume === 'to60k' || volume === 'more') {
      reasons.push('При таком объёме выгоднее подписка — напишите нам, посчитаем');
    }
    return { tariff: TARIFFS.payg, reasons };
  }

  let id = BY_VOLUME[volume];
  reasons.push(`${TARIFFS[id].note} — это «${TARIFFS[id].name}»`);

  // Форма на сайте и доступ по API входят начиная с «Про».
  if (delivery === 'selfService' && ORDER.indexOf(id) < ORDER.indexOf('pro')) {
    id = highest(id, 'pro');
    reasons.push('Участники забирают документы сами через форму — это с «Про»');
  }
  if (delivery === 'api' && ORDER.indexOf(id) < ORDER.indexOf('pro')) {
    id = highest(id, 'pro');
    reasons.push('Выдача из вашей системы по API — это с «Про»');
  }

  // Отправка с домена клиента — тоже с «Про».
  if (sender === 'ourDomain' && ORDER.indexOf(id) < ORDER.indexOf('pro')) {
    id = highest(id, 'pro');
    reasons.push('Письма с вашего домена — это с «Про»');
  }

  return { tariff: TARIFFS[id], reasons };
}

/**
 * Итоговая сумма к оплате. Возвращает копейки: рубли с плавающей точкой
 * в денежных расчётах рано или поздно дают расхождение на копейку,
 * а её потом ищут в акте сверки.
 */
export function amountKopecks(tariff: Tariff): number | null {
  return tariff.priceRub === null ? null : tariff.priceRub * 100;
}
