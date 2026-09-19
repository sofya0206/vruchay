import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Braces,
  Check,
  FileCheck2,
  FileSignature,
  Lock,
  Receipt,
  Scale,
  Server,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { Certificate } from '../landing/Certificate';
import { Button } from '../ui/Button';
import { HowItWorks } from '../landing/HowItWorks';
import { ScreenDots, useReveal, useSnapScroll, type Screen } from '../landing/fullpage';
import { Meta } from '../seo/Meta';
import { LANDING_JSON_LD } from '../seo/landing-schema';

/**
 * Посадочная страница до входа.
 *
 * Делает одно: рассказывает о сервисе. Цен здесь нет намеренно — разговор
 * о деньгах начинается на отдельной странице, когда человек уже понял,
 * что именно покупает.
 *
 * Главная картинка страницы — сам продукт: каждый шаг показывает настоящий
 * фрагмент кабинета в рамке браузера, а не абстрактную иллюстрацию.
 */

/** Экраны по порядку — для точек у правого края. */
const SCREENS: Screen[] = [
  { id: 'top', label: 'Начало' },
  { id: 'kak', label: 'Как это работает' },
  { id: 'organizatsiyam', label: 'Для организаций' },
  { id: 'proverka', label: 'Проверьте сами' },
  { id: 'start', label: 'Попробовать' },
];

/** Факты о данных — плитками: каждый с иконкой, заголовком и одной строкой. */
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

export function LandingPage() {
  useSnapScroll();
  useReveal();

  return (
    <div className="vru-landing relative isolate bg-[var(--ground)]">
      <Meta
        title="Вручай — подписать грамоты списком и разослать"
        description="Загрузите свой бланк грамоты и список участников: сервис впишет имена и разошлёт по адресам. Данные остаются в России. Первые 50 документов бесплатно."
        path="/"
        jsonLd={LANDING_JSON_LD}
      />

      {/* Аура одна на всю страницу: лежит за содержимым и потому не обрезается
          границами секций. Из-за этого ни одна секция ниже не имеет своего
          фона — иначе вместо свечения получилась бы жёсткая полоса. */}
      <div className="vru-aura" aria-hidden="true">
        <span className="vru-aura__blob vru-aura__blob--a" />
        <span className="vru-aura__blob vru-aura__blob--b" />
        <span className="vru-aura__blob vru-aura__blob--c" />
      </div>

      <SiteHeader />
      <ScreenDots screens={SCREENS} />
      <Hero />
      <HowItWorks />
      <ForOrganisations />
      <CheckYourself />
      <FinalScreen />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-[var(--width-page)] items-center px-6 py-2">
        <Link to="/" className="inline-flex items-center gap-2 text-[var(--text)] no-underline">
          <span className="text-lg font-semibold">Вручай</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/login">
            <Button variant="secondary">Войти</Button>
          </Link>
          <Link to="/register">
            <Button variant="primary">Зарегистрироваться</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="vru-screen relative pt-14">
      <div className="mx-auto max-w-[var(--width-page)] px-6 text-center">
        <p className="vru-eyebrow vru-enter">
          <ShieldCheck size={14} /> Данные участников остаются в России
        </p>
        <h1 className="vru-display vru-enter mx-auto mt-6 max-w-[900px]">
          Сервис массовой выдачи документов
        </h1>
        <p className="vru-enter vru-delay mx-auto mt-5 max-w-[640px] text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] text-[var(--text-muted)]">
          Сопровождаем весь процесс от создания документов до отправки адресантам и контроля
          верификации
        </p>
        <div className="vru-enter vru-delay mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/register">
            <Button variant="primary">Попробовать бесплатно</Button>
          </Link>
          <a href="#kak">
            <Button variant="secondary">Посмотреть, как это работает</Button>
          </a>
        </div>
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Первые 50 документов — бесплатно и без водяных знаков
        </p>
      </div>
    </section>
  );
}

/**
 * Три покупателя внутри организации — юрист, бухгалтерия, разработчик —
 * и у каждого свой вопрос. Карточка отвечает целиком и сразу: роль,
 * выгода одной фразой, четыре факта и документ, который можно открыть.
 * Прятать список под наведение нельзя: закрытая карточка выглядит пустой,
 * а человек с клавиатуры или с телефона до списка не доберётся.
 */
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
    <section id="organizatsiyam" className="vru-screen">
      <div className="mx-auto w-full max-w-[var(--width-page)] px-6 py-16">
        <h2 className="vru-h2 vru-reveal">Для организаций</h2>
        <p
          className="vru-reveal mt-4 max-w-[560px] text-[var(--text-muted)]"
          style={{ '--reveal-i': 1 } as CSSProperties}
        >
          Закон, договор и подключение — всё готово до первого награждения. Каждому в организации —
          свой ответ.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {ROLES.map((r, i) => (
            <div
              key={r.role}
              className="vru-reveal"
              style={{ '--reveal-i': i + 2 } as CSSProperties}
            >
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

/**
 * Утверждения только о себе и только проверяемые: сравнивать конкурентов
 * по имени — риск по закону о рекламе, а предложение проверить любой сервис,
 * включая наш, работает лучше любого сравнения.
 *
 * Команда показана в окне терминала с ответом: так видно, что это не
 * абстрактный совет, а десять секунд настоящей проверки.
 */
function CheckYourself() {
  return (
    <section id="proverka" className="vru-screen relative">
      <div className="mx-auto grid w-full max-w-[var(--width-page)] items-center gap-12 px-6 py-16 lg:grid-cols-[1fr_1.15fr]">
        <div className="vru-reveal">
          <h2 className="vru-h2">Проверьте, куда уходят фамилии участников</h2>
          <p className="mt-5 text-[var(--text-muted)]">
            Многие сервисы рассылки стоят за рубежом, и по виду это не определить. Проверьте за
            десять секунд — у любого, включая наш:
          </p>
          <Terminal />
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {FACTS.map((f, i) => (
            <li
              key={f.title}
              className="vru-reveal vru-fact"
              style={{ '--reveal-i': i + 1 } as CSSProperties}
            >
              <span className="vru-feature__icon">
                <f.icon size={18} strokeWidth={1.75} />
              </span>
              <p className="mt-3 font-medium">{f.title}</p>
              <p className="mt-1 text-sm leading-snug text-[var(--text-muted)]">{f.text}</p>
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

/** Три числа под кнопками: что получит человек, если нажмёт. */
const NUMBERS: [string, string][] = [
  ['50', 'документов бесплатно'],
  ['3 ₽', 'за документ дальше'],
  ['90 дней', 'и служебные данные стёрты'],
];

/** Последний экран: призыв и подвал вместе — подвалу отдельный экран не нужен. */
function FinalScreen() {
  return (
    <section id="start" className="vru-screen">
      <div className="mx-auto grid w-full max-w-[var(--width-page)] flex-1 items-center gap-12 px-6 py-16 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <h2 className="vru-h2 vru-reveal">Ближайшее мероприятие — уже спокойное</h2>
          <p
            className="vru-reveal mt-5 max-w-[520px] text-[var(--text-muted)]"
            style={{ '--reveal-i': 1 } as CSSProperties}
          >
            Соберите документ, загрузите список, отправьте. Пятьдесят документов на пробу не стоят
            ничего.
          </p>
          <div
            className="vru-reveal mt-8 flex flex-wrap gap-3"
            style={{ '--reveal-i': 2 } as CSSProperties}
          >
            <Link to="/register">
              <Button variant="primary" size="lg">
                Попробовать бесплатно
              </Button>
            </Link>
            <Link to="/obsudit">
              <Button variant="secondary" size="lg">
                Написать нам
              </Button>
            </Link>
          </div>
          <dl
            className="vru-reveal mt-12 grid grid-cols-3 gap-6 border-t border-[var(--line)] pt-8"
            style={{ '--reveal-i': 3 } as CSSProperties}
          >
            {NUMBERS.map(([value, label]) => (
              <div key={label}>
                <dt className="font-serif text-3xl">{value}</dt>
                <dd className="mt-1 text-sm text-[var(--text-muted)]">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="hidden lg:block">
          <Certificate />
        </div>
      </div>
      <SiteFooter />
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-[var(--line)]">
      <div className="mx-auto grid max-w-[var(--width-page)] gap-5 px-6 py-8 text-sm text-[var(--text-muted)]">
        <div className="flex flex-wrap items-center gap-5">
          <span className="mr-auto text-[var(--text)]">Вручай</span>
          <Link to="/privacy" className="text-inherit">
            Политика обработки данных
          </Link>
          <Link to="/oferta" className="text-inherit">
            Лицензионный договор
          </Link>
          <Link to="/dpa" className="text-inherit">
            Договор-поручение
          </Link>
        </div>
        <p>© 2026 · Данные участников хранятся в России</p>
      </div>
    </footer>
  );
}
