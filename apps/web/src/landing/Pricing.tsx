import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/Button';

/**
 * Цены.
 *
 * Обычный блок из трёх карточек сюда не годится: у нас не три ступени одного
 * тарифа, а две разные модели для двух разных покупателей. Организация планирует
 * бюджет на год и покупает по счёту после разговора с юротделом; организатор
 * одного турнира платит картой за штуку и решение принимает сам.
 *
 * Отсюда и разные целевые действия: у подписки — «запросить счёт», у оплаты
 * по факту — «начать бесплатно». Кнопка «Начать» на годовом тарифе за 149 000 ₽
 * не соответствует тому, как такие покупки происходят на самом деле.
 *
 * По умолчанию открыта подписка: организации — основной покупатель.
 */

const SUBSCRIPTION = [
  {
    name: 'Старт',
    price: '29 000 ₽',
    volume: 'до 5 000 документов в год',
    perDoc: '5,80 ₽ за документ',
    features: [
      'Редактор макетов и списки',
      'Импорт из Excel и CSV',
      'Рассылка с нашего домена',
      'Один пользователь',
    ],
  },
  {
    name: 'Про',
    price: '69 000 ₽',
    volume: 'до 20 000 документов в год',
    perDoc: '3,45 ₽ за документ',
    features: [
      'Всё из «Старта»',
      'Отправка с вашего домена',
      'Форма на сайте и Тильда',
      'До пяти пользователей',
      'Доступ по API',
    ],
    highlight: true,
  },
  {
    name: 'Максимум',
    price: '149 000 ₽',
    volume: 'до 60 000 документов в год',
    perDoc: '2,48 ₽ за документ',
    features: [
      'Всё из «Про»',
      'Импорт списков и протоколов мероприятий',
      'Правила награждения по местам',
      'Пользователи без ограничений',
      'Приоритетная поддержка',
    ],
  },
];

type Mode = 'subscription' | 'payg';

interface Props {
  /**
   * Куда ведёт «Запросить счёт». На главной это блок для организаций,
   * на странице тарифов — форма запроса внизу той же страницы: якорь,
   * которого нет на текущей странице, ведёт в никуда.
   */
  contactHref?: string;
}

export function Pricing({ contactHref = '#federatsiyam' }: Props) {
  const [mode, setMode] = useState<Mode>('subscription');

  return (
    <section id="ceny" className="mx-auto max-w-5xl scroll-mt-16 px-6 py-16">
      <h2 className="font-serif text-3xl">Цены</h2>
      <p className="mt-2 max-w-xl text-[var(--text-muted)]">
        Организациям выгоднее годовая подписка, разовому мероприятию — оплата
        за выданные документы.
      </p>

      <Switcher mode={mode} onChange={setMode} />

      {mode === 'subscription' ? <Subscription contactHref={contactHref} /> : <PayAsYouGo />}
    </section>
  );
}

function Switcher({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const options: { value: Mode; label: string }[] = [
    { value: 'subscription', label: 'Организациям' },
    { value: 'payg', label: 'Разовому мероприятию' },
  ];

  return (
    <div
      role="tablist"
      aria-label="Модель оплаты"
      className="mt-8 inline-flex rounded-xl bg-[var(--surface-sunken)] p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={mode === o.value}
          onClick={() => onChange(o.value)}
          // Переход только по цвету: сдвиг подложки под курсором читался бы
          // как промах мимо кнопки.
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
            mode === o.value
              ? 'bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_3px_rgba(20,32,26,0.12)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Subscription({ contactHref }: { contactHref: string }) {
  return (
    <>
      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {SUBSCRIPTION.map((t) => (
          <div
            key={t.name}
            className={`flex flex-col rounded-xl bg-[var(--surface)] p-6 transition-shadow duration-200 hover:shadow-[0_12px_32px_-16px_rgba(20,32,26,0.3)] ${
              t.highlight ? 'ring-2 ring-[var(--accent)]' : 'ring-1 ring-[var(--line)]'
            }`}
          >
            <div className="flex items-baseline gap-2">
              <h3 className="font-serif text-xl">{t.name}</h3>
              {t.highlight && (
                <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                  чаще всего берут
                </span>
              )}
            </div>
            <p className="mt-4 text-2xl">
              {t.price} <span className="text-sm text-[var(--text-muted)]">в год</span>
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {t.volume} · {t.perDoc}
            </p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                  {f}
                </li>
              ))}
            </ul>
            <a href={contactHref} className="mt-6">
              <Button variant={t.highlight ? 'primary' : 'secondary'} className="w-full">
                Запросить счёт
              </Button>
            </a>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl bg-[var(--surface-sunken)] p-6">
        <div className="min-w-64 flex-1">
          <h3 className="font-medium">Больше 60 000 документов в год</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
            Условия индивидуальные: уровень доступности в договоре, выделенное
            хранилище, обучение сотрудников.
          </p>
        </div>
        <a href={contactHref}>
          <Button variant="secondary">Обсудить</Button>
        </a>
      </div>

      <p className="mt-4 text-sm text-[var(--text-muted)]">
        Превышение лимита — 3 ₽ за документ, без блокировки сервиса. Останавливать
        выдачу в разгар награждения мы считаем недопустимым.
      </p>
    </>
  );
}

function PayAsYouGo() {
  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-xl bg-[var(--surface)] p-6 ring-1 ring-[var(--line)]">
        <h3 className="font-serif text-xl">Оплата за документ</h3>
        <p className="mt-4 text-2xl">
          3 ₽ <span className="text-sm text-[var(--text-muted)]">за выданный документ</span>
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Создание файла, письмо участнику и страница проверки подлинности.
        </p>

        <div className="mt-5 space-y-2 text-sm">
          {[
            ['Пакет 1 000 документов', '2 500 ₽', '2,50 ₽ за штуку'],
            ['Пакет 5 000 документов', '11 000 ₽', '2,20 ₽ за штуку'],
          ].map(([name, price, per]) => (
            <div
              key={name}
              className="flex flex-wrap items-baseline gap-x-3 rounded-lg bg-[var(--surface-sunken)] px-4 py-3"
            >
              <span className="font-medium">{name}</span>
              <span>{price}</span>
              <span className="text-[var(--text-muted)]">{per}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Пакеты без срока действия: остаток не сгорает. Договор и счёт
          не нужны — оплата картой, чек приходит на почту.
        </p>
      </div>

      <div className="flex flex-col justify-between rounded-xl bg-[var(--accent-soft)] p-6">
        <div>
          <h3 className="font-serif text-xl text-[var(--accent)]">Первые 50 — бесплатно</h3>
          <p className="mt-3 text-sm leading-relaxed">
            Без водяных знаков и без карты. Пятидесяти документов хватает, чтобы
            провести настоящее награждение и понять, подходит ли сервис.
          </p>
        </div>
        <Link to="/register" className="mt-6">
          <Button variant="primary" className="w-full">
            Начать бесплатно
          </Button>
        </Link>
      </div>
    </div>
  );
}
