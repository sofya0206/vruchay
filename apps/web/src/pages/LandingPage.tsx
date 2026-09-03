import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  FileText,
  Globe,
  Mail,
  QrCode,
  ShieldCheck,
  Table2,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Reviews } from '../landing/Reviews';
import { Faq } from '../landing/Faq';
import { Pricing } from '../landing/Pricing';
import { ForBusiness } from '../landing/ForBusiness';
import { Certificate } from '../landing/Certificate';
import { Scope } from '../landing/Scope';
import { SiteFooter, SiteHeader } from '../landing/Chrome';
import { Meta } from '../seo/Meta';
import { LANDING_JSON_LD } from '../seo/landing-schema';

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
      <Meta
        title="Вручай — подписать грамоты списком и разослать"
        description="Загрузите свой бланк грамоты и список участников: сервис впишет имена и разошлёт по адресам. Данные остаются в России. Первые 50 документов бесплатно."
        path="/"
        jsonLd={LANDING_JSON_LD}
      />
      <SiteHeader
        links={[
          { href: '#kak', label: 'Как это работает' },
          { href: '#ceny', label: 'Цены', compact: true },
        ]}
      />
      <Hero />
      <HowItWorks />
      <Scope />
      <Difference />
      <ForBusiness />
      {/* Отзывы до юридического блока: сперва «этим уже пользуются»,
          потом «и это законно». Раздел сам исчезает, пока отзывов нет. */}
      <Reviews />
      <Legal />
      <Pricing />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </div>
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
          {/* Акцент на подписывании, а не на создании: бланк у организатора
              обычно уже есть — свой, утверждённый, с гербом и подписями.
              Обещать «сделаем красиво» значит спорить с тем, что человеку
              и так нравится. Работа, которой он тяготится, — надписать
              триста грамот именами и разослать. */}
          <h1 className="font-serif text-4xl leading-[1.1] sm:text-5xl">
            Ваш бланк грамоты —{' '}
            <span className="text-[var(--accent)]">подписан всему списку</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-[var(--text-muted)]">
            Загрузите свой бланк и список участников. Сервис впишет имена, места
            и достижения — каждому своё — и разошлёт по адресам. Не по одному
            в Word, не вечером перед награждением.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/register">
              <Button variant="primary">Попробовать бесплатно</Button>
            </Link>
            <a href="#kak">
              <Button variant="secondary">Посмотреть, как это работает</Button>
            </a>
          </div>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Первые 50 документов — бесплатно и без водяных знаков.
          </p>

          {/* Два пути названы сразу: иначе организатор одного турнира решит,
              что сервис только для организаций с договорами, и уйдёт. */}
          <dl className="mt-8 grid gap-4 border-t border-[var(--line)] pt-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium">Организациям</dt>
              <dd className="mt-1 text-sm text-[var(--text-muted)]">
                Подписка на год, счёт и договор. Федерации, школы, вузы, клубы.
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium">Одному мероприятию</dt>
              <dd className="mt-1 text-sm text-[var(--text-muted)]">
                3 ₽ за документ, оплата картой. Без договоров и переговоров.
              </dd>
            </div>
          </dl>
        </div>

        <Certificate />
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="kak" className="scroll-mt-16 border-y border-[var(--line)] bg-[var(--surface)]">
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

function FinalCta() {
  return (
    <section className="border-t border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h2 className="font-serif text-3xl">Ближайшее награждение — уже спокойное</h2>
        <p className="mx-auto mt-3 max-w-md text-[var(--text-muted)]">
          Соберите макет, загрузите список, отправьте. Пятьдесят документов на пробу
          не стоят ничего.
        </p>
        <Link to="/register" className="mt-7 inline-block">
          <Button variant="primary">Попробовать бесплатно</Button>
        </Link>
      </div>
    </section>
  );
}
