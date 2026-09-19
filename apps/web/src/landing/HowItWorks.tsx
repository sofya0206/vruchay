import { useState, type ComponentType, type CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
import { EditorMock, FilesMock, LettersMock, TableMock } from './Mocks';

/**
 * Путь из четырёх шагов: закладки соединены стрелками, рядом — экран продукта.
 *
 * Лежит отдельно от посадочной, потому что показывается в двух местах: на
 * самой посадочной и на входе в кабинет, пока организация ещё ничего не
 * выпускала. Источник один намеренно — иначе рассказ о сервисе снаружи
 * и рассказ внутри сервиса однажды разойдутся, и человек решит, что
 * попал не туда, куда его звали.
 *
 * Собран из отдельных частей, а не одним куском: на посадочной закладки
 * стоят над рассказом и служат оглавлением, в кабинете — под ним и служат
 * указателем пройденного. Порядок задаёт тот, кто показывает.
 */

export interface Step {
  id: string;
  label: string;
  title: string;
  text: string;
  note: string;
  Mock: ComponentType;
}

export const WALKTHROUGH: Step[] = [
  {
    id: 'doc',
    label: 'Документ',
    title: 'Соберите документ',
    text: 'Загрузите свой бланк, поставьте поля — фамилия, место, номинация, дата. Текст сам уменьшится, если фамилия окажется длинной: имя не вылезет за поле и не обрежется.',
    note: 'Автомасштабирование текста в поле',
    Mock: EditorMock,
  },
  {
    id: 'table',
    label: 'Таблица',
    title: 'Загрузите список',
    text: 'Excel, CSV или протокол мероприятия. Колонки становятся полями бланка сами — сверять руками нечего. Места и группы сервис распознаёт из протокола.',
    note: 'Импорт списков и протоколов',
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

/**
 * Закладки как путь: текущий шаг — синий с линией.
 *
 * Стрелки между шагами рисуются не всегда. На посадочной они и есть
 * «путь»: человек ещё не знает, что за чем идёт. В кабинете рядом стоит
 * своя стрелка «дальше», и две стрелки в одной строке спорят друг с другом.
 */
export function WalkthroughTabs({
  value,
  onChange,
  arrows = true,
  className = '',
}: {
  value: string;
  onChange: (id: string) => void;
  arrows?: boolean;
  className?: string;
}) {
  return (
    <div className={`vru-tabbar ${className}`} role="tablist">
      {WALKTHROUGH.map((t, i) => (
        <div key={t.id} className="contents">
          {arrows && i > 0 && (
            <span className="vru-tabbar__arrow" aria-hidden="true">
              <ArrowRight size={16} />
            </span>
          )}
          <button role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
            {t.label}
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Рассказ об одном шаге и экран продукта рядом.
 *
 * Уровень заголовка задаётся снаружи: на посадочной над этим блоком уже
 * стоят h1 и h2, а в кабинете он на странице первый. Начертание и кегль
 * при этом одни и те же — их держат классы, а не правило `.vru-landing h3`,
 * которого в кабинете нет.
 */
export function WalkthroughPanel({ step, as: Heading = 'h3' }: { step: Step; as?: 'h1' | 'h3' }) {
  const Mock = step.Mock;

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.35fr]">
      <div>
        <Heading className="font-sans text-lg font-semibold">{step.title}</Heading>
        <p className="mt-4 text-[var(--text-muted)]">{step.text}</p>
        <p className="vru-tag mt-6 text-[var(--text)]">{step.note}</p>
      </div>
      <Mock />
    </div>
  );
}

/**
 * Тот же рассказ на посадочной: секция с якорем, на который ведёт кнопка первого экрана.
 *
 * Все четыре шага лежат в одной ячейке сетки друг под другом: высота блока —
 * по самому высокому, и при переключении закладки и текст не прыгают
 * (экраны продукта разной высоты, а секция центрируется по вертикали).
 * Невидимые шаги скрыты для читалки и клавиатуры.
 */
export function HowItWorks() {
  const [tab, setTab] = useState(WALKTHROUGH[0].id);

  return (
    <section id="kak" className="vru-screen">
      <div className="mx-auto w-full max-w-[var(--width-page)] px-6 py-16">
        <WalkthroughTabs value={tab} onChange={setTab} className="vru-reveal" />
        <div className="vru-reveal mt-8 grid" style={{ '--reveal-i': 1 } as CSSProperties}>
          {WALKTHROUGH.map((step) => {
            const active = step.id === tab;
            return (
              <div
                key={step.id}
                className={`[grid-area:1/1] transition-opacity duration-300 ${
                  active ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
                aria-hidden={!active}
                // inert: скрытый шаг не ловит фокус с клавиатуры.
                inert={!active}
              >
                <WalkthroughPanel step={step} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
