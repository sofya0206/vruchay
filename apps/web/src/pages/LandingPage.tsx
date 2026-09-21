import type { CSSProperties, ComponentType } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Braces,
  Check,
  FileCheck2,
  FileSignature,
  Lock,
  QrCode,
  Receipt,
  Scale,
  Search,
  Server,
  ShieldCheck,
  Timer,
  Trophy,
} from 'lucide-react';
import { Certificate } from '../landing/Certificate';
import { Button } from '../ui/Button';
import { SiteHeader, SiteFooter } from '../landing/Chrome';
import { Faq } from '../landing/Faq';
import {
  AwardsMock,
  EditorMock,
  IssueMock,
  LetterMock,
  RecipientsMock,
  RegistryMock,
  ValidationMock,
  VerifyMock,
} from '../landing/Mocks';
import { useReveal } from '../landing/fullpage';
import { Meta } from '../seo/Meta';
import { LANDING_JSON_LD } from '../seo/landing-schema';

/**
 * Посадочная страница до входа.
 *
 * Делает одно: подробно рассказывает о сервисе и показывает его настоящие
 * экраны — пять шагов кабинета один за другим, а не абстрактную иллюстрацию.
 * Цен здесь нет: объём и стоимость обсуждаются лично, единственный публичный
 * вход — бесплатные первые 50 документов.
 */

const HEADER_LINKS = [
  { href: '#kak', label: 'Как это работает' },
  { href: '#vnutri', label: 'Возможности', compact: true },
  { href: '/pricing', label: 'Оплата' },
];

export function LandingPage() {
  useReveal();

  return (
    <div className="vru-landing relative isolate bg-[var(--ground)]">
      <Meta
        title="Вручай — именные дипломы и сертификаты по списку участников"
        description="Загрузите свой бланк и список участников: сервис впишет имена, разошлёт письма и даст каждому документу страницу проверки подлинности. Данные остаются в России. Первые 50 документов бесплатно."
        path="/"
        jsonLd={LANDING_JSON_LD}
      />

      <div className="vru-aura" aria-hidden="true">
        <span className="vru-aura__blob vru-aura__blob--a" />
        <span className="vru-aura__blob vru-aura__blob--b" />
        <span className="vru-aura__blob vru-aura__blob--c" />
      </div>

      <SiteHeader links={HEADER_LINKS} />
      <Hero />
      <Walkthrough />
      <Deeper />
      <ForOrganisations />
      <CheckYourself />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative pt-10 lg:pt-14">
      <div className="mx-auto grid max-w-[var(--width-page)] items-center gap-12 px-6 py-10 lg:grid-cols-[1.1fr_1fr] lg:py-16">
        <div>
          <p className="vru-eyebrow vru-enter">
            <ShieldCheck size={14} /> Данные участников остаются в России
          </p>
          <h1 className="vru-display vru-enter mt-6 max-w-[720px]">
            Загрузите список — у каждого будет свой именной документ
          </h1>
          <p className="vru-enter vru-delay mt-5 max-w-[560px] text-lg text-[var(--text-muted)]">
            Сервис впишет имена в ваш бланк, разошлёт письма и даст каждому документу ссылку для
            проверки подлинности. Процесс один и тот же — что на сотне участников, что на пяти
            тысячах.
          </p>
          <div className="vru-enter vru-delay mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="w-full sm:w-auto">
              <Button variant="primary" size="lg" className="w-full">
                Попробовать бесплатно
              </Button>
            </Link>
            <a href="#kak" className="w-full sm:w-auto">
              <Button variant="secondary" size="lg" className="w-full">
                Посмотреть, как это работает
              </Button>
            </a>
          </div>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Первые 50 документов — бесплатно и без водяных знаков
          </p>
        </div>
        <div className="vru-enter vru-delay min-w-0">
          <Certificate />
        </div>
      </div>
    </section>
  );
}

interface WalkStep {
  n: number;
  id: string;
  title: string;
  text: string;
  note: string;
  Mock: ComponentType;
}

const STEPS: WalkStep[] = [
  {
    n: 1,
    id: 'list',
    title: 'Лист: соберите бланк один раз',
    text: 'Загрузите свой бланк или начните с чистого листа. Расставьте поля — фамилия, место, номинация, дата — перетаскиванием. Слишком длинная фамилия не вылезет за рамку: текст сам уменьшится, чтобы поместиться. На экране данные показаны не плейсхолдерами, а настоящей строкой — тем же компонентом, что потом печатает PDF, так что на экране ровно то, что уйдёт на печать.',
    note: 'Автомасштаб текста в поле',
    Mock: EditorMock,
  },
  {
    n: 2,
    id: 'recipients',
    title: 'Получатели: список становится таблицей',
    text: 'Вставьте список из Excel сочетанием Ctrl+V прямо на странице или загрузите файл — .xlsx, .csv, протокол соревнования. Столбцы сами становятся полями бланка: раскладывать их вручную не нужно. Сервис предлагает безопасные исправления — например, привести ФИО из ЗАГЛАВНЫХ к обычному виду — и показывает, что изменится, до того как вы согласитесь.',
    note: 'Импорт списков и спортивных протоколов',
    Mock: RecipientsMock,
  },
  {
    n: 3,
    id: 'check',
    title: 'Проверка: ошибки видно до печати, а не после',
    text: 'Сервис проходит по каждой отмеченной строке и показывает, что случится при выпуске: не пустое ли обязательное поле, нет ли повторов, дойдёт ли письмо. Там, где падеж имени нельзя подобрать однозначно, система честно скажет «не уверена», а не подставит наугад — лучше проверить одну строку из двухсот вручную, чем напечатать неверный падеж на дипломе.',
    note: 'Линтер по всему списку одной кнопкой',
    Mock: ValidationMock,
  },
  {
    n: 4,
    id: 'letter',
    title: 'Письмо: свой текст, свой адрес отправителя',
    text: 'Тема и текст письма — свои для каждого документа, с той же вставкой полей, что и на бланке. Форматирование нарочно простое — жирный и курсив, — потому что почтовые клиенты рисуют сложную вёрстку по-разному. Перед отправкой видно, как письмо получит именно этот человек, и можно отправить пробное письмо себе.',
    note: 'Отправка с вашего домена, не с адреса сервиса',
    Mock: LetterMock,
  },
  {
    n: 5,
    id: 'issue',
    title: 'Выпуск: пачкой, с прогрессом и без риска нажать дважды',
    text: 'Короткий чек-лист перед кнопкой — получатели отмечены, проверка пройдена, письмо готово — а дальше выбор: только создать файлы или создать и сразу разослать. Генерация идёт на сервере: вкладку можно закрыть, процесс не остановится. Если что-то прервалось на середине, сервис продолжит с того же места, а не начнёт список заново.',
    note: 'Пачками — как на пять, так и на пять тысяч',
    Mock: IssueMock,
  },
];

function Walkthrough() {
  return (
    <section id="kak" className="scroll-mt-16">
      <div className="mx-auto max-w-[var(--width-page)] px-6 py-16 lg:py-20">
        <p className="vru-reveal vru-eyebrow">Как это работает</p>
        <h2 className="vru-reveal vru-h2 mt-4 max-w-[640px]" style={{ '--reveal-i': 1 } as CSSProperties}>
          Пять шагов — то же самое, что вы увидите в кабинете
        </h2>
        <p
          className="vru-reveal mt-4 max-w-[560px] text-[var(--text-muted)]"
          style={{ '--reveal-i': 2 } as CSSProperties}
        >
          Один и тот же путь для любого документа: лист, получатели, проверка, письмо, выпуск.
          Ниже — по порядку, с настоящими экранами кабинета.
        </p>
        <div className="mt-14 flex flex-col gap-16 lg:mt-20 lg:gap-24">
          {STEPS.map((step, i) => (
            <div
              key={step.id}
              id={step.id}
              className="vru-reveal grid items-center gap-8 lg:grid-cols-[1fr_1.35fr]"
              style={{ '--reveal-i': i % 3 } as CSSProperties}
            >
              <div className={`min-w-0 ${i % 2 === 1 ? 'lg:order-2' : ''}`}>
                <span className="vru-tag">Шаг {step.n} из 5</span>
                <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                <p className="mt-4 text-[var(--text-muted)]">{step.text}</p>
                <p className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
                  <Check size={15} /> {step.note}
                </p>
              </div>
              {/* min-w-0: элемент сетки по умолчанию не сжимается уже своего
                  содержимого (таблица внутри экрана продукта шире телефона) —
                  без этого сетка раздвигает всю страницу за край окна. */}
              <div className={`min-w-0 ${i % 2 === 1 ? 'lg:order-1' : ''}`}>
                <step.Mock />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface DeepCard {
  icon: LucideIcon;
  title: string;
  text: string;
  Mock: ComponentType;
}

const DEEP: DeepCard[] = [
  {
    icon: Trophy,
    title: 'Разные документы по одному протоколу',
    text: 'Один загруженный протокол — и сервис сам решает, кому какой документ: победителю диплом, призёрам другой, остальным сертификат участника. Правило сохраняется и переиспользуется на следующем мероприятии того же типа.',
    Mock: AwardsMock,
  },
  {
    icon: QrCode,
    title: 'Страница, которая подтверждает, что документ настоящий',
    text: 'QR на документе ведёт на открытую страницу с вердиктом: подлинный, просрочен, заменён или отозван. Получатель может перетащить сам PDF в браузер — файл сверяется по отпечатку прямо на устройстве, ничего никуда не загружается.',
    Mock: VerifyMock,
  },
  {
    icon: Search,
    title: 'Найти и переслать через три месяца после мероприятия',
    text: 'Каждый выданный документ остаётся в реестре: искать по фамилии, почте или коду, пересылать, перевыпускать при опечатке, отзывать при ошибке — по одному или сразу по результату поиска.',
    Mock: RegistryMock,
  },
];

function Deeper() {
  return (
    <section id="vnutri" className="scroll-mt-16 border-y border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto max-w-[var(--width-page)] px-6 py-16 lg:py-20">
        <h2 className="vru-reveal vru-h2 max-w-[640px]">Что происходит после того, как документ ушёл</h2>
        <div className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
          {DEEP.map((d, i) => (
            <div key={d.title} className="vru-reveal min-w-0" style={{ '--reveal-i': i + 1 } as CSSProperties}>
              <span className="vru-feature__icon">
                <d.icon size={20} strokeWidth={1.75} />
              </span>
              <h3 className="mt-5 font-medium">{d.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">{d.text}</p>
              <div className="mt-5">
                <d.Mock />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const ROLES: {
  icon: LucideIcon;
  role: string;
  title: string;
  items: string[];
  link: [string, string];
}[] = [
  {
    icon: Scale,
    role: 'Юристу',
    title: 'Юридический отдел пропустит',
    items: [
      'Данные в России — ч. 5 ст. 18 152-ФЗ',
      'Договор-поручение приложением к договору',
      'Оператор в реестре Роскомнадзора',
      'Служебные сведения стираются через 90 дней',
    ],
    link: ['Договор-поручение', '/dpa'],
  },
  {
    icon: FileCheck2,
    role: 'Бухгалтерии',
    title: 'Период закроется без вопросов',
    items: [
      'Договор, счёт, акт оказанных услуг',
      'Безналичный расчёт, авансом',
      'Без НДС — упрощённая система',
      'Договор с российским ИП',
    ],
    link: ['Лицензионный договор', '/oferta'],
  },
  {
    icon: Braces,
    role: 'Разработчику',
    title: 'Встанет в ваши процессы',
    items: [
      'Форма на сайте, Тильда, свой сайт',
      'Доступ по API с примерами',
      'Импорт списков и протоколов',
      'Письма с вашего домена — три записи в DNS',
    ],
    link: ['Документация и API', '/docs'],
  },
];

function ForOrganisations() {
  return (
    <section id="organizatsiyam" className="scroll-mt-16">
      <div className="mx-auto w-full max-w-[var(--width-page)] px-6 py-16 lg:py-20">
        <h2 className="vru-h2 vru-reveal">Для организаций</h2>
        <p
          className="vru-reveal mt-4 max-w-[560px] text-[var(--text-muted)]"
          style={{ '--reveal-i': 1 } as CSSProperties}
        >
          Закон, договор и подключение — всё готово до первого награждения. Каждому в организации —
          свой ответ.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3 lg:mt-10 lg:gap-5">
          {ROLES.map((r, i) => (
            <div key={r.role} className="vru-reveal" style={{ '--reveal-i': i + 2 } as CSSProperties}>
              <RoleCard {...r} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RoleCard({
  icon: Icon,
  role,
  title,
  items,
  link,
}: {
  icon: LucideIcon;
  role: string;
  title: string;
  items: string[];
  link: [string, string];
}) {
  return (
    <div className="vru-role">
      <div className="flex items-center gap-3">
        <span className="vru-feature__icon">
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <span className="text-sm font-medium text-[var(--text-muted)]">{role}</span>
      </div>
      <h3 className="mt-5">{title}</h3>
      <ul className="mt-5 grid gap-3">
        {items.map((it) => (
          <li key={it} className="flex gap-2.5 text-sm leading-snug">
            <span className="mt-0.5 shrink-0 text-[var(--accent-line)]">
              <Check size={16} />
            </span>
            {it}
          </li>
        ))}
      </ul>
      <Link
        to={link[1]}
        className="mt-auto inline-flex items-center gap-1 pt-6 text-sm font-medium text-[var(--accent)]"
      >
        {link[0]} <ArrowRight size={14} />
      </Link>
    </div>
  );
}

const FACTS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Server,
    title: 'Серверы в России',
    text: 'Данные участников не покидают страну — ч. 5 ст. 18 152-ФЗ.',
  },
  {
    icon: FileSignature,
    title: 'Договор-поручение',
    text: 'Со всеми обязательными условиями — приложение к договору.',
  },
  { icon: ShieldCheck, title: 'Оператор в реестре', text: 'Уведомление подано в Роскомнадзор.' },
  {
    icon: Timer,
    title: 'Стирание через 90 дней',
    text: 'Служебные сведения не хранятся дольше, чем нужно.',
  },
  {
    icon: Receipt,
    title: 'Счёт, акт, договор',
    text: 'Закрывающие документы для бухгалтерии, без НДС.',
  },
  {
    icon: Lock,
    title: 'Копии зашифрованы',
    text: 'Резервные копии шифруются до выгрузки в хранилище.',
  },
];

/**
 * Утверждения только о себе и только проверяемые: сравнивать конкурентов
 * по имени — риск по закону о рекламе, а предложение проверить любой сервис,
 * включая наш, работает лучше любого сравнения.
 *
 * Личная история — не про конкурента, а про нас: почему вообще решили
 * это проверять. Имени в ней нет намеренно.
 */
function CheckYourself() {
  return (
    <section id="proverka" className="scroll-mt-16 relative">
      <div className="mx-auto grid w-full max-w-[var(--width-page)] items-center gap-10 px-6 py-16 lg:gap-12 lg:py-20 lg:grid-cols-[1fr_1.15fr]">
        <div className="vru-reveal">
          <h2 className="vru-h2">Проверьте, куда уходят фамилии участников</h2>
          <p className="mt-5 text-[var(--text-muted)]">
            Мы сами раньше рассылали грамоты через похожий сервис — и однажды посмотрели, через
            какую страну на самом деле уходит почта с данными участников. С тех пор не верим на
            слово и другим не предлагаем: проверьте за десять секунд — у любого сервиса, включая
            наш:
          </p>
          <Terminal />
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {FACTS.map((f, i) => (
            <li key={f.title} className="vru-reveal vru-fact" style={{ '--reveal-i': i + 1 } as CSSProperties}>
              <span className="vru-feature__icon shrink-0">
                <f.icon size={18} strokeWidth={1.75} />
              </span>
              <div className="sm:mt-3">
                <p className="font-medium">{f.title}</p>
                <p className="mt-1 text-sm leading-snug text-[var(--text-muted)]">{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Окно терминала: команда и ответ. Значения условные — витрина, не документация. */
function Terminal() {
  return (
    <div className="vru-terminal mt-6">
      <div className="vru-frame__bar">
        <span className="vru-frame__dot" />
        <span className="vru-frame__dot" />
        <span className="vru-frame__dot" />
        <span className="vru-frame__url">терминал</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-sm leading-relaxed">
        <span className="text-[var(--text-muted)]">$ </span>
        <span className="text-[var(--text)]">dig TXT vruchay.ru +short</span>
        {'\n'}
        <span className="text-[var(--accent)]">&quot;v=spf1 … -all&quot;</span>
        {'\n'}
        <span className="text-[var(--text-muted)]">$ </span>
        <span className="text-[var(--text)]">dig A vruchay.ru +short</span>
        {'\n'}
        <span className="text-[var(--accent)]">…</span>
        <span className="text-[var(--text-muted)]"> # адрес из российского диапазона</span>
      </pre>
    </div>
  );
}

const NUMBERS: [string, string][] = [
  ['50', 'документов бесплатно'],
  ['90 дней', 'и служебные данные стёрты'],
];

function FinalCta() {
  return (
    <section className="border-t border-[var(--line)]">
      <div className="mx-auto max-w-[var(--width-page)] px-6 py-16 text-center lg:py-20">
        <h2 className="vru-h2 vru-reveal">Ближайшее мероприятие — без завала в последний день</h2>
        <p
          className="vru-reveal mx-auto mt-5 max-w-[480px] text-[var(--text-muted)]"
          style={{ '--reveal-i': 1 } as CSSProperties}
        >
          Соберите бланк, загрузите список, отправьте. Первые пятьдесят документов — бесплатно, без
          разговора и без карты.
        </p>
        <div
          className="vru-reveal mt-8 flex flex-wrap justify-center gap-3"
          style={{ '--reveal-i': 2 } as CSSProperties}
        >
          <Link to="/register" className="w-full sm:w-auto">
            <Button variant="primary" size="lg" className="w-full">
              Попробовать бесплатно
            </Button>
          </Link>
          <Link to="/obsudit" className="w-full sm:w-auto">
            <Button variant="secondary" size="lg" className="w-full">
              Обсудить условия
            </Button>
          </Link>
        </div>
        <dl
          className="vru-reveal mx-auto mt-10 grid max-w-md grid-cols-2 gap-6 border-t border-[var(--line)] pt-6 lg:mt-12 lg:pt-8"
          style={{ '--reveal-i': 3 } as CSSProperties}
        >
          {NUMBERS.map(([value, label]) => (
            <div key={label}>
              <dt className="font-serif text-2xl sm:text-3xl">{value}</dt>
              <dd className="mt-1 text-sm text-[var(--text-muted)]">{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
