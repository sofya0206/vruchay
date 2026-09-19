import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, GraduationCap, Mail, Paperclip, X } from 'lucide-react';
import { GUIDE_SLIDES, type GuideSlide } from '@gramota/shared';
import { IconButton } from '../ui/IconButton';
import { cn } from '../ui/cn';
import { onboarding, useOnboarding } from './store';
import { track } from './track';

/**
 * Полноэкранное обучение: семь слайдов — как устроен выпуск.
 *
 * Не тур по настоящему кабинету и не пример в библиотеке: ничего не
 * создаётся. Каждый слайд — живой мини-экран, в котором пульсирует одно
 * место; нажали — экран показывает, что будет в кабинете. Слов — заголовок
 * и строка, остальное видно. Стрелки, точки сверху, клавиши ← → и Esc.
 */

export const SLIDE_TITLES: Record<GuideSlide, string> = {
  document: 'Всё начинается с документа',
  table: 'Загрузите список получателей',
  fields: 'Подставьте данные в макет',
  check: 'Проверьте список перед выпуском',
  issue: 'Выпустите документы',
  qr: 'Подлинность — по QR-коду',
  mail: 'Разошлите по почте',
};

const SLIDE_TEXT: Record<GuideSlide, string> = {
  document:
    'Документ — это макет грамоты и список людей, которым её выдать. Под каждое мероприятие — свой документ.',
  table:
    'Excel или CSV. Каждая строка станет отдельной грамотой. Шапку и пустые строки уберём сами.',
  fields:
    'Поставьте на бланк поле «ФИО» — в каждой грамоте в нём окажется имя из своей строки. Так же с местом, датой, номинацией.',
  check:
    'До выпуска покажем пустые ФИО, ошибки в адресах и текст, который не влезает. Исправить можно в один клик.',
  issue:
    'Одна кнопка — и через минуту у каждого получателя готов свой PDF с уникальным номером.',
  qr:
    'На каждом документе QR-код. Отсканируйте — откроется страница: кому, кем и когда выдан. Подделать нельзя.',
  mail:
    'Каждый получит письмо со своим PDF во вложении. Сначала отправьте тестовое себе — увидите, как это выглядит.',
};

export function Guide() {
  const { slide } = useOnboarding();
  const open = slide !== null;
  const i = slide ?? 0;
  const id = GUIDE_SLIDES[i];
  const [done, setDone] = useState(false);
  const last = i === GUIDE_SLIDES.length - 1;

  // Новый слайд — сцена с начала.
  useEffect(() => setDone(false), [i]);

  const counted = useRef<string | null>(null);
  useEffect(() => {
    if (!open || counted.current === id) return;
    counted.current = id;
    track({ flow: 'guide', step: id, action: 'shown' });
  }, [open, id]);

  useEffect(() => {
    if (!open) {
      counted.current = null;
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(i + 1);
      if (e.key === 'ArrowLeft') go(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;

  function go(n: number) {
    if (n < 0) return;
    if (n >= GUIDE_SLIDES.length) return close();
    onboarding.open(n);
  }
  function close() {
    if (!done) track({ flow: 'guide', step: id, action: 'closed' });
    onboarding.close();
  }
  function act() {
    if (done) return;
    setDone(true);
    track({ flow: 'guide', step: id, action: 'done' });
  }

  const Scene = SCENES[id];

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Обучение" className="vru-guide fixed inset-0 z-[80] flex flex-col bg-[var(--ground)]">
      <header className="flex h-16 shrink-0 items-center gap-4 px-4 sm:px-6">
        <span className="flex items-center gap-2 font-medium">
          <GraduationCap size={20} strokeWidth={1.75} className="text-[var(--accent)]" />
          <span className="hidden sm:inline">Обучение</span>
        </span>
        <nav aria-label="Слайды" className="mx-auto flex gap-1.5">
          {GUIDE_SLIDES.map((s, j) => (
            <button
              key={s}
              type="button"
              aria-label={SLIDE_TITLES[s]}
              aria-current={j === i ? 'step' : undefined}
              onClick={() => go(j)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                j === i ? 'w-8 bg-[var(--accent)]' : j < i ? 'w-4 bg-[var(--accent)]/40' : 'w-4 bg-[var(--line-strong)]',
              )}
            />
          ))}
        </nav>
        <IconButton label="Закрыть" onClick={close}>
          <X size={20} />
        </IconButton>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 pb-4 sm:px-8">
        <div key={id} className="vru-guide-slide grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <div className="order-2 lg:order-1">
            <p className="text-sm tabular-nums text-[var(--text-muted)]">
              {i + 1} / {GUIDE_SLIDES.length}
            </p>
            <h1 className="mt-2 text-3xl font-medium leading-tight text-balance sm:text-4xl">{SLIDE_TITLES[id]}</h1>
            <p className="mt-3 max-w-md text-lg text-[var(--text-muted)]">{SLIDE_TEXT[id]}</p>
            <div className="mt-8 flex items-center gap-3">
              <button
                type="button"
                aria-label="Назад"
                disabled={i === 0}
                onClick={() => go(i - 1)}
                className="grid size-12 place-items-center rounded-full bg-[var(--surface)] shadow-[var(--ring-line)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-30"
              >
                <ArrowLeft size={20} />
              </button>
              <button
                type="button"
                aria-label={last ? 'Готово' : 'Дальше'}
                onClick={() => go(i + 1)}
                className={cn(
                  'grid size-12 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] transition-transform hover:bg-[var(--accent-hover)]',
                  done && 'vru-guide-next',
                )}
              >
                {last ? <Check size={20} /> : <ArrowRight size={20} />}
              </button>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="relative mx-auto aspect-[16/11] w-full max-w-[680px] overflow-hidden rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-sheet)] ring-1 ring-[var(--line)]">
              <Scene done={done} onAct={act} />
            </div>
          </div>
        </div>
      </main>
    </div>,
    document.body,
  );
}

/* ───────────── сцены ───────────── */

interface SceneProps {
  done: boolean;
  onAct: () => void;
}

/** Нажимаемое место сцены: пока не нажали — пульсирующая точка в углу. */
function Tap({ done, onAct, className, children }: SceneProps & { className?: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onAct} className={cn('relative', className)}>
      {children}
      {!done && <span aria-hidden className="vru-hotspot absolute -right-1.5 -top-1.5 size-3 rounded-full bg-[var(--accent)]" />}
    </button>
  );
}

/** Рамка мини-кабинета: полоска заголовка и вкладки. */
function Frame({ title, tabs, action, children }: { title: string; tabs?: string[]; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col text-[13px]">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--line)] px-4">
        <span className="size-5 rounded-md bg-[var(--accent)]" />
        <span className="truncate font-medium">{title}</span>
        {tabs && (
          <span className="ml-auto hidden gap-3 text-[var(--text-muted)] sm:flex">
            {tabs.map((t, k) => (
              <span key={t} className={k === 0 ? 'font-medium text-[var(--accent)]' : ''}>{t}</span>
            ))}
          </span>
        )}
        {action && <span className={tabs ? '' : 'ml-auto'}>{action}</span>}
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

/** Лист грамоты в миниатюре; `name` — что стоит в строке имени. */
function Sheet({ name, stamp, className }: { name?: ReactNode; stamp?: boolean; className?: string }) {
  return (
    <div className={cn('relative flex aspect-[297/210] flex-col items-center justify-center gap-[3%] bg-[var(--sheet-paper)] px-[8%] text-center font-serif text-[var(--sheet-ink)] shadow-[var(--shadow-sheet)]', className)}>
      <span className="absolute inset-[4%] rounded-[2px] border border-[#8B2020]/45" />
      <span className="text-[1.25em] font-bold uppercase tracking-[.16em] text-[#8B2020]">Грамота</span>
      <span className="text-[.55em] uppercase tracking-[.2em] text-[#8B2020]/70">награждается</span>
      <span className="min-h-[1.3em] text-[1.05em]">{name ?? 'Кузьмина Анна Сергеевна'}</span>
      <span className="text-[.7em]">за первое место</span>
      {stamp !== false && <span className="vru-qr-glyph absolute bottom-[9%] right-[7%] w-[11%]" style={{ aspectRatio: 1 }} />}
    </div>
  );
}

const PEOPLE = ['Кузьмина Анна', 'Орлов Михаил', 'Белова Дарья', 'Соколов Илья', 'Смирнова Ольга'];

const SCENES: Record<GuideSlide, (p: SceneProps) => ReactNode> = {
  document: ({ done, onAct }) => (
    <Frame title="Документы">
      <div className="grid grid-cols-3 gap-4 p-5">
        {['Конкурс «Мастер года»', 'Форум «Развитие»'].map((t) => (
          <div key={t} className="rounded-xl bg-[var(--surface)] p-2 ring-1 ring-[var(--line)]">
            <Sheet className="text-[5px]" />
            <p className="mt-2 truncate text-xs">{t}</p>
          </div>
        ))}
        {done ? (
          <div className="vru-guide-pop rounded-xl bg-[var(--accent-soft)] p-2 ring-2 ring-[var(--accent)]">
            <Sheet className="text-[5px]" name="Имя получателя" />
            <p className="mt-2 truncate text-xs font-medium text-[var(--accent)]">Новый документ</p>
          </div>
        ) : (
          <Tap done={done} onAct={onAct} className="grid place-items-center rounded-xl border-2 border-dashed border-[var(--line-strong)] text-[var(--accent)] hover:bg-[var(--accent-soft)]">
            <span className="text-2xl">＋</span>
          </Tap>
        )}
      </div>
    </Frame>
  ),

  table: ({ done, onAct }) => (
    <Frame title="Конкурс «Мастер года»" tabs={['Получатели', 'Лист', 'Проверка']}>
      <div className="p-5">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-[var(--surface-sunken)]">
              {['№', 'ФИО', 'Почта', 'Место'].map((h) => (
                <th key={h} className="border border-[var(--line)] px-2 py-1.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PEOPLE.map((p, k) => (
              <tr key={p} className={done ? 'vru-guide-row' : 'opacity-0'} style={{ animationDelay: `${k * 90}ms` }}>
                <td className="border border-[var(--line)] px-2 py-1.5 text-[var(--text-muted)]">{k + 1}</td>
                <td className="border border-[var(--line)] px-2 py-1.5">{p}</td>
                <td className="border border-[var(--line)] px-2 py-1.5 text-[var(--text-muted)]">{p.split(' ')[0].toLowerCase()}@mail.ru</td>
                <td className="border border-[var(--line)] px-2 py-1.5">{(k % 3) + 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!done && (
          <div className="absolute inset-x-0 bottom-10 grid place-items-center">
            <Tap done={done} onAct={onAct} className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)]">
              Загрузить файл
            </Tap>
          </div>
        )}
      </div>
    </Frame>
  ),

  fields: ({ done, onAct }) => (
    <Frame title="Конкурс «Мастер года»" tabs={['Лист', 'Получатели', 'Проверка']}>
      <div className="grid h-full grid-cols-[1fr_150px]">
        <div className="grid place-items-center bg-[var(--ground)] p-5">
          <Sheet
            className="w-full text-[9px]"
            name={
              done ? (
                <span className="vru-guide-pop rounded bg-[var(--accent-soft)] px-1 text-[var(--accent)]">Кузьмина Анна Сергеевна</span>
              ) : (
                <span className="inline-block h-[1.2em] w-[12em] rounded border border-dashed border-[var(--accent)]" />
              )
            }
          />
        </div>
        <div className="border-l border-[var(--line)] p-3">
          <p className="mb-2 text-xs font-medium">Данные</p>
          <Tap done={done} onAct={onAct} className="mb-1 flex w-full items-center justify-between rounded-md bg-[var(--accent-soft)] px-2 py-1.5 text-xs text-[var(--accent)]">
            ФИО {done && <Check size={12} />}
          </Tap>
          {['Место', 'Номинация', 'Почта'].map((f) => (
            <p key={f} className="rounded-md px-2 py-1.5 text-xs text-[var(--text-muted)]">{f}</p>
          ))}
        </div>
      </div>
    </Frame>
  ),

  check: ({ done, onAct }) => <CheckScene done={done} onAct={onAct} />,

  issue: ({ done, onAct }) => <IssueScene done={done} onAct={onAct} />,

  qr: ({ done, onAct }) => (
    <div className="grid h-full grid-cols-[1fr_auto] items-center gap-6 bg-[var(--ground)] p-6">
      <div className="relative">
        <Sheet className="w-full text-[9px]" stamp={false} />
        <Tap done={done} onAct={onAct} className="vru-qr-glyph absolute bottom-[9%] right-[7%] w-[11%]">
          <span className="block" style={{ aspectRatio: 1 }} />
        </Tap>
      </div>
      <div
        className={cn(
          'w-40 rounded-[22px] border-4 border-[var(--text)] bg-[var(--surface)] p-3 transition-all duration-500',
          done ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0',
        )}
      >
        <div className="rounded-xl border-2 border-[var(--ok)] p-2 text-center text-xs">
          <Check size={18} className="mx-auto text-[var(--ok)]" />
          <p className="mt-1 font-medium">Документ подлинный</p>
          <p className="mt-1 text-[var(--text-muted)]">Кузьмина Анна Сергеевна</p>
          <p className="text-[var(--text-muted)]">19.09.2026</p>
        </div>
      </div>
    </div>
  ),

  mail: ({ done, onAct }) => (
    <div className="grid h-full grid-cols-2">
      <div className="border-r border-[var(--line)] p-5 text-xs">
        <p className="text-[var(--text-muted)]">Тема</p>
        <p className="mt-1 rounded-md bg-[var(--surface-sunken)] px-2 py-1.5">
          Ваш документ, <span className="rounded bg-[var(--accent-soft)] px-1 text-[var(--accent)]">ФИО</span>
        </p>
        <p className="mt-3 text-[var(--text-muted)]">Текст</p>
        <p className="mt-1 rounded-md bg-[var(--surface-sunken)] p-2 leading-relaxed">
          Здравствуйте, <span className="rounded bg-[var(--accent-soft)] px-1 text-[var(--accent)]">ФИО</span>! Документ во вложении.
        </p>
        <Tap done={done} onAct={onAct} className="mt-4 rounded-lg px-3 py-1.5 font-medium ring-1 ring-[var(--line)] hover:bg-[var(--surface-sunken)]">
          Отправить себе
        </Tap>
      </div>
      <div className="bg-[var(--ground)] p-5 text-xs">
        <p className="mb-2 flex items-center gap-1.5 text-[var(--text-muted)]">
          <Mail size={14} /> Входящие
        </p>
        <div className={cn('rounded-xl bg-[var(--surface)] p-3 ring-1 ring-[var(--line)] transition-all duration-500', done ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0')}>
          <p className="font-medium">Ваш документ, Анна</p>
          <p className="mt-1 text-[var(--text-muted)]">Здравствуйте, Анна! Документ во вложении.</p>
          <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-[var(--surface-sunken)] px-2 py-1">
            <Paperclip size={12} /> gramota.pdf
          </span>
        </div>
      </div>
    </div>
  ),
};

function CheckScene({ done, onAct }: SceneProps) {
  // Два шага: «Проверить» зажигает строки, «Исправить» чинит найденное.
  const [ran, setRan] = useState(false);
  return (
    <Frame
      title="Проверка"
      action={
        !ran && (
          <Tap done={false} onAct={() => setRan(true)} className="rounded-lg bg-[var(--accent)] px-3 py-1 text-xs font-medium text-[var(--accent-contrast)]">
            Проверить
          </Tap>
        )
      }
    >
      <div className="p-5">
        {PEOPLE.map((p, k) => {
          const bad = k === 4;
          const upper = bad && !done;
          return (
            <div key={p} className="flex items-center gap-3 border-b border-[var(--line)] py-2.5">
              <span
                className={cn(
                  'size-2.5 rounded-full transition-colors duration-300',
                  !ran ? 'bg-[var(--line-strong)]' : bad && !done ? 'bg-[var(--warn)]' : 'bg-[var(--ok)]',
                )}
                style={{ transitionDelay: ran ? `${k * 120}ms` : '0ms' }}
              />
              <span className={upper ? 'uppercase' : ''}>{p}</span>
              {ran && bad && !done && (
                <Tap done={false} onAct={onAct} className="vru-guide-pop ml-auto rounded-md bg-[var(--warn-soft)] px-2 py-1 text-xs text-[var(--warn)]">
                  Исправить
                </Tap>
              )}
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

function IssueScene({ done, onAct }: SceneProps) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!done) return setN(0);
    const t = setInterval(() => setN((v) => (v >= 10 ? 10 : v + 1)), 120);
    return () => clearInterval(t);
  }, [done]);
  return (
    <Frame
      title="Конкурс «Мастер года»"
      tabs={['Получатели', 'Лист']}
      action={
        <Tap done={done} onAct={onAct} className="rounded-lg bg-[var(--accent)] px-3 py-1 text-xs font-medium text-[var(--accent-contrast)]">
          Выпустить 10
        </Tap>
      }
    >
      <div className="grid h-full place-items-center bg-[var(--ground)] p-6">
        <div className="relative w-[58%]">
          <div className={cn('absolute inset-0 transition-transform duration-700', done && 'translate-x-6 -translate-y-3 rotate-3')}>
            <Sheet className="w-full text-[8px]" stamp={false} name={PEOPLE[2]} />
          </div>
          <div className={cn('absolute inset-0 transition-transform duration-700', done && 'translate-x-12 -translate-y-6 rotate-6')}>
            <Sheet className="w-full text-[8px]" stamp={false} name={PEOPLE[1]} />
          </div>
          <Sheet className="relative w-full text-[8px]" />
        </div>
        <div className={cn('w-[58%] transition-opacity duration-300', done ? 'opacity-100' : 'opacity-0')}>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div className="h-full rounded-full bg-[var(--ok)] transition-all duration-150" style={{ width: `${n * 10}%` }} />
          </div>
          <p className="mt-2 text-center text-sm tabular-nums">
            {n} из 10 PDF {n === 10 && <Check size={14} className="inline text-[var(--ok)]" />}
          </p>
        </div>
      </div>
    </Frame>
  );
}
