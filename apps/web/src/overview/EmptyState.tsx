import { FormEvent, useState } from 'react';
import { ArrowRight, FileUp } from 'lucide-react';
import type { Overview } from '../api/overview';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { plural, protocolTitle } from './format';
import { useCreateMaterial } from './useCreateMaterial';

/** Что чаще всего выпускают первым — чтобы не выдумывать название с нуля. */
const SUGGESTIONS = ['Грамота за первое место', 'Сертификат участника', 'Благодарность тренеру'];

/**
 * Первый экран новой организации.
 *
 * Показываем не нули, а первый шаг: человек, только что зарегистрировавшийся,
 * ничего ещё не выпустил, и четыре ноля подряд говорят ему лишь то, что
 * сервис пуст. Здесь он видит, из чего складывается награждение, и может
 * начать прямо отсюда — поле с названием стоит на экране, а не за нажатием.
 *
 * Про расход сказано прямо: главный страх на этом шаге — «сейчас я нажму,
 * и спишется документ». Не спишется: считаются только созданные файлы.
 */
export function EmptyState({ data }: { data: Overview }) {
  const create = useCreateMaterial();
  const [title, setTitle] = useState(SUGGESTIONS[0]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (title.trim()) create.mutate(title.trim());
  }

  return (
    <div className="rounded-2xl bg-[var(--surface)] p-6 ring-1 ring-[var(--line)] sm:p-8">
      <h1 className="font-serif text-2xl">С чего начать</h1>
      <p className="mt-2 max-w-2xl text-[var(--text-muted)]">
        Награждение здесь собирается из трёх шагов. Всё, что нужно для первого, — название
        документа: бланк и список участников загрузите следом.
      </p>

      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        <Step n={1} title="Материал" about="Заготовка: бланк, на нём поля — фамилия, место, дата" />
        <Step
          n={2}
          title="Список участников"
          about="Excel, CSV или протокол соревнования. Колонки станут полями бланка"
        />
        <Step
          n={3}
          title="Выпуск и рассылка"
          about="Сервис сверяет список, делает файлы и отправляет их участникам"
        />
      </ol>

      <form onSubmit={onSubmit} className="mt-6 flex flex-wrap gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Название первого материала"
          placeholder="Например, «Грамота за первое место»"
          className="min-w-56 flex-1"
        />
        <Button
          type="submit"
          variant="primary"
          icon={<ArrowRight size={16} />}
          disabled={create.isPending || !title.trim()}
        >
          Начать награждение
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--text-muted)]">Часто выпускают:</span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTitle(s)}
            className="rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            {s}
          </button>
        ))}
      </div>

      <p className="mt-5 text-sm text-[var(--text-muted)]">
        {data.usage.limit !== null && (
          <>
            {data.usage.source === 'trial' ? 'В бесплатной пробе' : `По плану «${data.usage.planName}»`}{' '}
            {data.usage.limit} {plural(data.usage.limit, 'документ', 'документа', 'документов')}.{' '}
          </>
        )}
        Считаются только созданные файлы: черновики, правки макета и просмотры не расходуют ничего.
      </p>

      {create.isError && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          Не удалось создать материал. Попробуйте ещё раз.
        </p>
      )}

      {/* Отдельный вход для тех, кто пришёл с соревнования: у них список уже
          есть, и начинать с придумывания названия документа им незачем. */}
      <hr className="my-6 border-[var(--line)]" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">
          Уже есть протокол соревнований? Начните с него — места и группы сервис распознает сам.
        </p>
        <Button
          icon={<FileUp size={16} />}
          disabled={create.isPending}
          onClick={() => create.mutate(protocolTitle())}
        >
          Загрузить протокол
        </Button>
      </div>
    </div>
  );
}

function Step({ n, title, about }: { n: number; title: string; about: string }) {
  return (
    <li className="rounded-xl bg-[var(--surface-sunken)] p-4">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--accent)] text-sm font-medium text-[var(--accent-contrast)]">
        {n}
      </span>
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{about}</p>
    </li>
  );
}
