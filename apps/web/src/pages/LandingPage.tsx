import { Link } from 'react-router-dom';
import {
  Award,
  CheckCircle2,
  FileText,
  Globe,
  Mail,
  QrCode,
  ShieldCheck,
  Table2,
} from 'lucide-react';
import { Button } from '../ui/Button';

/**
 * Посадочная страница.
 *
 * Тексты держатся на проверяемых утверждениях, а не на прилагательных:
 * каждое несёт либо число, либо факт, который читатель может проверить сам.
 * «Удобный сервис» подписал бы любой конкурент — такие строки здесь не живут.
 *
 * Движение выдержано в правилах скила emil-design-eng: собственные кривые
 * вместо встроенных, появление через @starting-style, длительность
 * интерфейсных переходов до 300 мс, полное отключение при
 * prefers-reduced-motion.
 */

const TARIFFS = [
  {
    name: 'Старт',
    price: '29 000 ₽',
    period: 'в год',
    volume: 'до 5 000 документов',
    perDoc: '5,80 ₽ за документ',
    features: ['Редактор макетов', 'Списки и импорт из Excel', 'Рассылка с нашего домена', 'Один пользователь'],
  },
  {
    name: 'Про',
    price: '69 000 ₽',
    period: 'в год',
    volume: 'до 20 000 документов',
    perDoc: '3,45 ₽ за документ',
    features: ['Всё из «Старта»', 'Отправка с вашего домена', 'Форма на сайте и Тильда', 'До пяти пользователей', 'Доступ по API'],
    highlight: true,
  },
  {
    name: 'Федерация',
    price: '149 000 ₽',
    period: 'в год',
    volume: 'до 60 000 документов',
    perDoc: '2,48 ₽ за документ',
    features: ['Всё из «Про»', 'Импорт протоколов соревнований', 'Правила награждения по местам', 'Пользователи без ограничений', 'Приоритетная поддержка'],
  },
];

const STEPS = [
  {
    icon: FileText,
    title: 'Соберите макет',
    text: 'Загрузите фон, расставьте блоки, укажите переменные — фамилию, дистанцию, место, дату. Как в конструкторе, без вёрстки.',
  },
  {
    icon: Table2,
    title: 'Загрузите список',
    text: 'Excel или CSV — колонки сами станут переменными. Отметьте, кому создавать документы.',
  },
  {
    icon: Mail,
    title: 'Отправьте',
    text: 'Файлы создаются пачкой и уходят письмами с вашего адреса. В журнале видно, кому доставлено.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-full bg-[var(--ground)]">
      <Header />
      <Hero />
      <HowItWorks />
      <Difference />
      <Legal />
      <Pricing />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)]/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)]">
          <Award size={17} strokeWidth={1.75} />
        </span>
        <span className="font-serif text-lg">Вручай</span>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <a href="#kak" className="rounded-lg px-3 py-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]">
            Как это работает
          </a>
          <a href="#ceny" className="hidden rounded-lg px-3 py-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)] sm:inline">
            Цены
          </a>
          <Link to="/login">
            <Button size="sm" variant="primary">
              Войти
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 pt-16 pb-12 sm:pt-24">
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="vru-enter">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
            <ShieldCheck size={13} /> Данные участников остаются в России
          </p>
          <h1 className="font-serif text-4xl leading-[1.1] sm:text-5xl">
            Именные грамоты
            <br />
            на весь список — <span className="text-[var(--accent)]">за одно нажатие</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-[var(--text-muted)]">
            Загружаете список участников — получаете готовые документы и письма
            с вашего собственного адреса. Не по одному в Word, не вечером перед
            награждением.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/login">
              <Button variant="primary">Попробовать бесплатно</Button>
            </Link>
            <a href="#kak">
              <Button variant="secondary">Посмотреть, как это работает</Button>
            </a>
          </div>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Первые 50 документов — бесплатно и без водяных знаков.
          </p>
        </div>

        <CertificatePreview />
      </div>
    </section>
  );
}

/** Показать результат нагляднее, чем описать словами. */
function CertificatePreview() {
  return (
    <div className="vru-enter vru-delay relative mx-auto w-full max-w-md">
      <div className="rotate-[-1.5deg] rounded-xl bg-[var(--surface)] p-8 shadow-[0_20px_60px_-20px_rgba(20,32,26,0.35)] ring-1 ring-[var(--line)] transition-transform duration-300 hover:rotate-0">
        <div className="rounded-lg border border-[var(--award)]/30 p-6 text-center">
          <p className="text-[10px] tracking-[0.25em] text-[var(--text-muted)] uppercase">
            Ассоциация тренеров
          </p>
          <p className="mt-6 font-serif text-2xl">Грамота</p>
          <p className="mt-4 text-sm text-[var(--text-muted)]">награждается</p>
          <p className="mt-1 font-serif text-xl">Кузьмина-Караваева Анна</p>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            за первое место на дистанции 200 м
          </p>
          <div className="mt-6 flex items-end justify-between">
            <span className="text-[10px] text-[var(--text-muted)]">2 августа 2026</span>
            <span className="grid h-10 w-10 place-items-center rounded bg-[var(--surface-sunken)] text-[var(--text-muted)]">
              <QrCode size={20} />
            </span>
          </div>
        </div>
      </div>
      <div className="absolute -right-3 -bottom-3 -z-10 h-full w-full rotate-[2deg] rounded-xl bg-[var(--surface-sunken)] ring-1 ring-[var(--line)]" />
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="kak" className="border-y border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="font-serif text-3xl">Три шага</h2>
        <p className="mt-2 max-w-xl text-[var(--text-muted)]">
          От пустого листа до писем в почтовых ящиках участников.
        </p>
        <ol className="mt-10 grid gap-8 sm:grid-cols-3">
          {STEPS.map((step, n) => (
            <li key={step.title}>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <step.icon size={19} strokeWidth={1.75} />
              </span>
              <h3 className="mt-4 font-medium">
                <span className="mr-2 text-[var(--text-muted)]">{n + 1}.</span>
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Difference() {
  const items = [
    {
      icon: Globe,
      title: 'Письма с вашего домена',
      text: 'Участник получает письмо от вашей федерации, а не от неизвестного сервиса. Подключение — три записи в DNS, проверка нажатием кнопки.',
    },
    {
      icon: QrCode,
      title: 'Проверка подлинности по QR',
      text: 'На документе — код, ведущий на страницу проверки. Работодатель или судейская коллегия видит, что документ настоящий, и кем он выдан.',
    },
    {
      icon: FileText,
      title: 'Форма на вашем сайте',
      text: 'Участник заполняет форму и получает документ сам — без вашего участия. Работает с Тильдой и с обычной формой.',
    },
    {
      icon: ShieldCheck,
      title: 'Российское размещение',
      text: 'Серверы, база и резервные копии — в дата-центрах на территории России, в облаке с аттестацией ФСТЭК.',
    },
  ];

  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <h2 className="font-serif text-3xl">Чем отличается</h2>
      <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.title} className="flex gap-4">
            <span className="mt-0.5 shrink-0 text-[var(--accent)]">
              <item.icon size={20} strokeWidth={1.75} />
            </span>
            <div>
              <h3 className="font-medium">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Раздел о законе. Формулировки только про себя и проверяемые: сравнивать
 * себя с конкурентами по имени — отдельный риск по закону о рекламе,
 * а предложение проверить любой сервис работает лучше любого сравнения.
 */
function Legal() {
  return (
    <section className="border-y border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-16 lg:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="font-serif text-3xl">Проверьте, куда уходят фамилии участников</h2>
          <p className="mt-4 leading-relaxed text-[var(--text-muted)]">
            Сервис рассылки писем видит фамилии, адреса и достижения ваших спортсменов.
            Закон требует, чтобы персональные данные граждан России хранились в России
            (часть 5 статьи 18 152-ФЗ), — а многие сервисы рассылки размещены за рубежом,
            и по внешнему виду это не определить.
          </p>
          <p className="mt-4 leading-relaxed text-[var(--text-muted)]">
            Проверить можно за десять секунд, у любого сервиса — включая наш. Домен
            отправителя расскажет, чей почтовый шлюз стоит за письмами:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-[var(--surface-sunken)] p-4 font-mono text-xs">
            dig TXT vruchay.ru +short
          </pre>
        </div>

        <ul className="space-y-4 self-center">
          {[
            'Договор-поручение на обработку персональных данных — по требованию юридического отдела',
            'Уведомление оператора персональных данных подано в Роскомнадзор',
            'Сроки хранения ограничены: служебные сведения стираются через 90 дней',
            'Закрывающие документы для бухгалтерии: счёт, акт, договор с российским ИП',
          ].map((line) => (
            <li key={line} className="flex gap-3">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
              <span className="text-sm leading-relaxed">{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="ceny" className="mx-auto max-w-5xl px-6 py-16">
      <h2 className="font-serif text-3xl">Цены</h2>
      <p className="mt-2 max-w-xl text-[var(--text-muted)]">
        Организациям выгоднее годовая подписка, разовым мероприятиям — оплата по факту.
      </p>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {TARIFFS.map((t) => (
          <div
            key={t.name}
            className={`flex flex-col rounded-xl p-6 ring-1 transition-shadow duration-200 hover:shadow-[0_12px_32px_-16px_rgba(20,32,26,0.3)] ${
              t.highlight
                ? 'bg-[var(--surface)] ring-2 ring-[var(--accent)]'
                : 'bg-[var(--surface)] ring-[var(--line)]'
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
              {t.price} <span className="text-sm text-[var(--text-muted)]">{t.period}</span>
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
            <Link to="/login" className="mt-6">
              <Button variant={t.highlight ? 'primary' : 'secondary'} className="w-full">
                Начать
              </Button>
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 rounded-xl bg-[var(--surface-sunken)] p-6 sm:grid-cols-2">
        <div>
          <h3 className="font-medium">Разовое мероприятие</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
            3 ₽ за выданный документ: создание, письмо и страница проверки.
            Пакеты со скидкой — 1 000 документов за 2 500 ₽, 5 000 за 11 000 ₽.
            Пакеты без срока действия.
          </p>
        </div>
        <div>
          <h3 className="font-medium">Первые 50 — бесплатно</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
            Без водяных знаков и без карты. Пятидесяти документов хватает,
            чтобы провести настоящее награждение и понять, подходит ли сервис.
          </p>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h2 className="font-serif text-3xl">Ближайшее награждение — уже спокойное</h2>
        <p className="mx-auto mt-3 max-w-md text-[var(--text-muted)]">
          Соберите макет, загрузите список, отправьте. Пятьдесят документов на пробу
          не стоят ничего.
        </p>
        <Link to="/login" className="mt-7 inline-block">
          <Button variant="primary">Попробовать бесплатно</Button>
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--line)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-8 text-sm text-[var(--text-muted)]">
        <span className="font-serif text-[var(--text)]">Вручай</span>
        <a href="/privacy" className="transition-colors hover:text-[var(--text)]">
          Политика обработки данных
        </a>
        <a href="/oferta" className="transition-colors hover:text-[var(--text)]">
          Оферта
        </a>
        <span className="ml-auto">© 2026</span>
      </div>
    </footer>
  );
}
