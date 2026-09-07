import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Building2, Check, FileCheck2, Scale, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { EditorMock, FilesMock, LettersMock, TableMock } from '../landing/Mocks';
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

const TABS = [
  {
    id: 'doc',
    label: 'Документ',
    title: 'Соберите документ',
    text: 'Загрузите свой бланк, поставьте поля — фамилия, место, дистанция, дата. Текст сам уменьшится, если фамилия окажется длинной: имя не вылезет за поле и не обрежется.',
    note: 'Автомасштабирование текста в поле',
    Mock: EditorMock,
  },
  {
    id: 'table',
    label: 'Таблица',
    title: 'Загрузите список',
    text: 'Excel, CSV или протокол соревнований. Колонки становятся полями бланка сами — сверять руками нечего. Места и группы сервис распознаёт из протокола.',
    note: 'Импорт протоколов соревнований',
    Mock: TableMock,
  },
  {
    id: 'files',
    label: 'Файлы',
    title: 'Получите файлы пачкой',
    text: 'Документы создаются сразу на весь список, каждому своё. Готовые PDF лежат в реестре: их можно скачать архивом, перевыпустить или отозвать.',
    note: 'Реестр выданного с поиском по фамилии',
    Mock: FilesMock,
  },
  {
    id: 'mail',
    label: 'Письма',
    title: 'Разошлите письма',
    text: 'Письма уходят с вашего домена, а не от неизвестного сервиса. В журнале видно судьбу каждого: доставлено, открыто, ящик не существует.',
    note: 'Отправка с домена организации',
    Mock: LettersMock,
  },
];

const FACTS = [
  'Данные и серверы — в России, 152-ФЗ',
  'Договор-поручение — по требованию юридического отдела',
  'Уведомление оператора подано в Роскомнадзор',
  'Служебные сведения стираются через 90 дней',
  'Счёт, акт и договор для бухгалтерии',
];

export function LandingPage() {
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
      <Hero />
      <HowItWorks />
      <ForOrganisations />
      <CheckYourself />
      <FinalCta />
      <SiteFooter />
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
    <section className="relative pt-14">
      <div className="mx-auto max-w-[var(--width-page)] px-6 pt-16 text-center">
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

/** Путь из четырёх шагов: закладки соединены стрелками, под ними — экран продукта. */
function HowItWorks() {
  const [tab, setTab] = useState(TABS[0].id);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const Mock = active.Mock;

  return (
    <section id="kak" className="mx-auto max-w-[var(--width-page)] scroll-mt-16 px-6 pt-20 pb-16">
      <div className="vru-tabbar" role="tablist">
        {TABS.map((t, i) => (
          <div key={t.id} className="contents">
            {i > 0 && (
              <span className="vru-tabbar__arrow" aria-hidden="true">
                <ArrowRight size={16} />
              </span>
            )}
            <button role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 grid items-center gap-8 lg:grid-cols-[1fr_1.35fr]">
        <div>
          <h3>{active.title}</h3>
          <p className="mt-4 text-[var(--text-muted)]">{active.text}</p>
          <p className="vru-tag mt-6 text-[var(--text)]">{active.note}</p>
        </div>
        <Mock />
      </div>
    </section>
  );
}

function ForOrganisations() {
  return (
    <section className="mx-auto max-w-[var(--width-page)] px-6 py-16">
      <h2 className="vru-h2">Для организаций</h2>
      <p className="mt-4 text-[var(--text-muted)]">
        Закон, договор и подключение — всё готово до первого награждения.
      </p>
      {/* items-start обязателен: иначе карточки тянутся до высоты раскрытой
          соседки, и на наведение по одной кажется, будто открылись все три. */}
      <div className="mt-8 grid items-start gap-5 md:grid-cols-3">
        <ExpandCard
          icon={Scale}
          title="Юристу"
          lead="152-ФЗ и договор-поручение"
          items={[
            'Данные в России — ч. 5 ст. 18 152-ФЗ',
            'Договор-поручение приложением к договору',
            'Оператор в реестре Роскомнадзора',
            'Служебные сведения стираются через 90 дней',
          ]}
        />
        <ExpandCard
          icon={FileCheck2}
          title="Бухгалтерии"
          lead="Закрывающие документы"
          items={[
            'Договор, счёт, акт',
            'Безналичный расчёт, аванс',
            'Без НДС — УСН',
            'Договор с российским ИП',
          ]}
        />
        <ExpandCard
          icon={Building2}
          title="Разработчику"
          lead="Документация и API"
          items={[
            'Документация по продукту',
            'API-документация с примерами',
            'Форма на сайте и Тильда',
            'Импорт протоколов соревнований',
          ]}
          links={[
            ['Документация', '/docs'],
            ['API', '/docs/api'],
          ]}
        />
      </div>
    </section>
  );
}

/**
 * Карточка свёрнута до заголовка и одной строки, список раскрывается
 * на наведение и на фокус с клавиатуры — иначе содержимое было бы
 * недоступно тому, кто не пользуется мышью.
 */
function ExpandCard({
  icon: Icon,
  title,
  lead,
  items,
  links,
}: {
  icon: LucideIcon;
  title: string;
  lead: string;
  items: string[];
  links?: [string, string][];
}) {
  return (
    <div className="vru-expand" tabIndex={0}>
      <span className="vru-feature__icon">
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <h3 className="mt-4">{title}</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{lead}</p>
      <div className="vru-expand__body">
        <div>
          <ul className="mt-4 grid gap-2">
            {items.map((it) => (
              <li key={it} className="flex gap-2 text-sm">
                <span className="mt-px shrink-0 text-[var(--accent-line)]">
                  <Check size={16} />
                </span>
                {it}
              </li>
            ))}
          </ul>
          {links && (
            <div className="mt-4 flex gap-4">
              {links.map(([label, href]) => (
                <Link
                  key={label}
                  to={href}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)]"
                >
                  {label} <ArrowRight size={14} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Утверждения только о себе и только проверяемые: сравнивать конкурентов
 * по имени — риск по закону о рекламе, а предложение проверить любой сервис,
 * включая наш, работает лучше любого сравнения.
 */
function CheckYourself() {
  return (
    <section className="relative">
      <div className="mx-auto grid max-w-[var(--width-page)] items-center gap-12 px-6 py-16 lg:grid-cols-2">
        <div>
          <h2 className="vru-h2">Проверьте, куда уходят фамилии участников</h2>
          <p className="mt-5 text-[var(--text-muted)]">
            Многие сервисы рассылки стоят за рубежом, и по виду это не определить. Проверьте
            за десять секунд — у любого, включая наш:
          </p>
          <pre className="mt-5 overflow-x-auto rounded-[var(--radius-control)] bg-[var(--surface)] p-4 font-mono text-sm shadow-[var(--ring-line)]">
            dig TXT vruchay.ru +short
          </pre>
        </div>
        <ul className="grid gap-4">
          {FACTS.map((line) => (
            <li key={line} className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-[var(--accent-line)]">
                <Check size={18} />
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-[var(--width-page)] px-6 py-16 text-center">
      <h2 className="vru-h2">Ближайшее награждение — уже спокойное</h2>
      <p className="mx-auto mt-5 max-w-[520px] text-[var(--text-muted)]">
        Соберите документ, загрузите список, отправьте. Пятьдесят документов на пробу не
        стоят ничего.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/register">
          <Button variant="primary">Попробовать бесплатно</Button>
        </Link>
        <Link to="/obsudit">
          <Button variant="secondary">Написать нам</Button>
        </Link>
      </div>
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
