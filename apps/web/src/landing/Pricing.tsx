import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { PLANS, planPrice, planGridClass } from './plans';

/**
 * Условия.
 *
 * Ценника здесь нет намеренно. У наших покупателей объём и состав работ
 * слишком разные, чтобы три колонки с цифрами сказали правду: одна и та же
 * федерация выдаёт пять тысяч документов в спокойный год и вдвое больше
 * в год чемпионата. Цифра на странице в таком разговоре не помогает,
 * а мешает — её приходится сначала объяснять, а потом от неё отступать.
 *
 * Зато бесплатная проба названа громко и стоит рядом: это единственное,
 * что человек может сделать не разговаривая с нами. Пятьдесят документов
 * без водяных знаков — настоящее награждение, а не демонстрация.
 *
 * Цена возвращается данными: появится `priceRub` в plans.ts — здесь
 * появится число, и переписывать страницу не придётся.
 */
export function Pricing() {
  return (
    <section id="ceny" className="mx-auto max-w-5xl scroll-mt-16 px-6 py-16">
      <h2 className="font-serif text-3xl">Условия</h2>
      <p className="mt-2 max-w-xl text-[var(--text-muted)]">
        Считаем по вашему календарю награждений: сколько документов, в какие
        месяцы и что должно работать. Разговор занимает минут пятнадцать.
      </p>

      <div className={`mt-8 grid gap-5 ${planGridClass()}`}>
        {PLANS.map((plan) => {
          const price = planPrice(plan);
          return (
            <div
              key={plan.id}
              className={`flex flex-col rounded-xl bg-[var(--surface)] p-6 transition-shadow duration-200 hover:shadow-[0_12px_32px_-16px_rgba(20,32,26,0.3)] ${
                plan.highlight ? 'ring-2 ring-[var(--accent)]' : 'ring-1 ring-[var(--line)]'
              }`}
            >
              <h3 className="font-serif text-xl">{plan.name}</h3>
              <p className="mt-4 text-2xl">
                {price.value}
                {price.period && (
                  <span className="ml-2 text-sm text-[var(--text-muted)]">{price.period}</span>
                )}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{plan.volume}</p>

              <ul className="mt-5 grid flex-1 gap-2 text-sm sm:grid-cols-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                    {f}
                  </li>
                ))}
              </ul>

              <a href="#obsudit" className="mt-6">
                <Button variant="primary" className="w-full">
                  Обсудить условия
                </Button>
              </a>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl bg-[var(--accent-soft)] p-6">
        <div className="min-w-64 flex-1">
          <h3 className="font-serif text-xl text-[var(--accent)]">
            Первые 50 документов — бесплатно
          </h3>
          <p className="mt-2 text-sm leading-relaxed">
            Без водяных знаков, без карты и без разговора с нами. Пятидесяти
            документов хватает, чтобы провести настоящее награждение и понять,
            подходит ли сервис. Начать можно прямо сейчас, условия обсудим,
            когда станет понятно, что и в каком объёме вы выдаёте.
          </p>
        </div>
        <Link to="/register">
          <Button variant="primary">Начать бесплатно</Button>
        </Link>
      </div>
    </section>
  );
}
