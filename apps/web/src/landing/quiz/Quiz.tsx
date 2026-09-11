import { FormEvent, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Input, Label, Textarea } from '../../ui/Field';
import { recommend, type Answers, type Delivery, type Payer, type Sender, type Volume } from './logic';

/**
 * Подбор тарифа вопросами.
 *
 * Каждый вопрос здесь меняет итог — иначе это анкета, а не подбор, и человек
 * это чувствует. Поэтому вопросов пять, а не пятнадцать: объём, способ выдачи,
 * отправитель, плательщик и что именно выдают.
 *
 * Одиночный выбор переключает шаг сразу: подтверждать очевидное лишним
 * нажатием — способ потерять половину дошедших. Множественный требует
 * кнопки, потому что система не знает, закончил человек выбирать или нет.
 *
 * В конце показывается не только тариф, но и почему он такой: рекомендация
 * без объяснения выглядит как попытка продать подороже.
 */

const KINDS = [
  'Грамоты и дипломы',
  'Сертификаты участника',
  'Сертификаты об обучении',
  'Благодарности',
  'Аккредитации и бейджи',
  'Другое',
];

const VOLUMES: { value: Volume; label: string; hint: string }[] = [
  { value: 'to5k', label: 'До 5 000', hint: 'несколько мероприятий в год' },
  { value: 'to20k', label: 'До 20 000', hint: 'регулярные мероприятия или курсы' },
  { value: 'to60k', label: 'До 60 000', hint: 'календарь крупной организации' },
  { value: 'more', label: 'Больше 60 000', hint: 'посчитаем отдельно' },
];

const DELIVERIES: { value: Delivery; label: string; hint: string }[] = [
  { value: 'weSend', label: 'Рассылаем сами по списку', hint: 'загружаем таблицу и отправляем' },
  { value: 'selfService', label: 'Участник забирает сам', hint: 'форма на нашем сайте' },
  { value: 'api', label: 'Из нашей системы', hint: 'выдача по API после регистрации или оплаты' },
];

const SENDERS: { value: Sender; label: string; hint: string }[] = [
  { value: 'ourDomain', label: 'С нашего домена', hint: 'участник видит письмо от нас' },
  { value: 'serviceDomain', label: 'Можно с адреса сервиса', hint: 'настраивать ничего не нужно' },
];

const PAYERS: { value: Payer; label: string; hint: string }[] = [
  { value: 'company', label: 'Организация по счёту', hint: 'нужны договор и закрывающие документы' },
  { value: 'person', label: 'Частное лицо картой', hint: 'без договоров, чек на почту' },
];

const STEPS = ['Что выдаёте', 'Сколько в год', 'Как получают', 'От кого письма', 'Кто платит'] as const;

export function Quiz() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [done, setDone] = useState(false);

  const result = recommend(answers);
  const atResult = step >= STEPS.length;

  function pick<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setStep((s) => s + 1);
  }

  if (done) return <Thanks answers={answers} />;

  return (
    <div className="rounded-xl bg-[var(--surface)] p-6 ring-1 ring-[var(--line)] sm:p-8">
      <Progress step={Math.min(step, STEPS.length)} />

      {step > 0 && !atResult && (
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          <ArrowLeft size={15} /> Назад
        </button>
      )}

      <div className="mt-5" key={step}>
        {step === 0 && (
          <MultiChoice
            title="Какие документы выдаёте?"
            hint="Можно выбрать несколько"
            options={KINDS}
            selected={answers.kinds ?? []}
            onToggle={(k) =>
              setAnswers((a) => {
                const cur = a.kinds ?? [];
                return { ...a, kinds: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] };
              })
            }
            onNext={() => setStep(1)}
          />
        )}

        {step === 1 && (
          <Choice
            title="Сколько документов в год?"
            hint="Примерно — от этого зависит тариф"
            options={VOLUMES}
            onPick={(v) => pick('volume', v)}
          />
        )}

        {step === 2 && (
          <Choice
            title="Как участники получают документы?"
            options={DELIVERIES}
            onPick={(v) => pick('delivery', v)}
          />
        )}

        {step === 3 && (
          <Choice
            title="От кого приходят письма?"
            options={SENDERS}
            onPick={(v) => pick('sender', v)}
          />
        )}

        {step === 4 && (
          <Choice title="Кто будет оплачивать?" options={PAYERS} onPick={(v) => pick('payer', v)} />
        )}

        {atResult && result && (
          <Result
            answers={answers}
            reasons={result.reasons}
            tariffName={result.tariff.name}
            priceRub={result.tariff.priceRub}
            note={result.tariff.note}
            isCompany={answers.payer === 'company'}
            onBack={() => setStep(STEPS.length - 1)}
            onSent={() => setDone(true)}
          />
        )}
      </div>
    </div>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div>
      <div className="flex gap-1.5">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
              i < step ? 'bg-[var(--accent)]' : 'bg-[var(--surface-sunken)]'
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        {step >= STEPS.length ? 'Готово' : `Шаг ${step + 1} из ${STEPS.length} · ${STEPS[step]}`}
      </p>
    </div>
  );
}

function Choice<T extends string>({
  title,
  hint,
  options,
  onPick,
}: {
  title: string;
  hint?: string;
  options: { value: T; label: string; hint: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div className="vru-enter">
      <h3 className="font-serif text-2xl">{title}</h3>
      {hint && <p className="mt-1 text-sm text-[var(--text-muted)]">{hint}</p>}
      <div className="mt-5 grid gap-2.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onPick(o.value)}
            className="rounded-lg bg-[var(--surface-sunken)] px-4 py-3.5 text-left transition-colors duration-150 hover:bg-[var(--accent-soft)]"
          >
            <span className="block font-medium">{o.label}</span>
            <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{o.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiChoice({
  title,
  hint,
  options,
  selected,
  onToggle,
  onNext,
}: {
  title: string;
  hint: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="vru-enter">
      <h3 className="font-serif text-2xl">{title}</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{hint}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors duration-150 ${
                on
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'bg-[var(--surface-sunken)] text-[var(--text)] hover:bg-[var(--accent-soft)]'
              }`}
            >
              {on && <Check size={14} />}
              {o}
            </button>
          );
        })}
      </div>
      <Button variant="primary" className="mt-6" onClick={onNext}>
        Дальше
      </Button>
    </div>
  );
}

function Result({
  answers,
  reasons,
  tariffName,
  priceRub,
  note,
  isCompany,
  onBack,
  onSent,
}: {
  answers: Answers;
  reasons: string[];
  tariffName: string;
  priceRub: number | null;
  note: string;
  isCompany: boolean;
  onBack: () => void;
  onSent: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch('/api/v1/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          tariff: tariffName,
          volume: note,
          comment: [form.comment, `Выдают: ${(answers.kinds ?? []).join(', ') || 'не указано'}`]
            .filter(Boolean)
            .join('\n'),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? 'Не удалось отправить заявку');
        return;
      }
      onSent();
    } catch {
      setError('Не удалось отправить. Проверьте соединение');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vru-enter">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
      >
        <ArrowLeft size={15} /> Изменить ответы
      </button>

      <div className="mt-4 rounded-xl bg-[var(--accent-soft)] p-5">
        <p className="text-xs tracking-wide text-[var(--accent)] uppercase">Вам подходит</p>
        <p className="mt-1 font-serif text-2xl">
          {tariffName}
          {priceRub !== null && (
            <span className="ml-2 text-lg">
              {priceRub.toLocaleString('ru-RU')} ₽ <span className="text-sm">в год</span>
            </span>
          )}
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{note}</p>

        {/* Почему именно этот: рекомендация без объяснения выглядит как
            попытка продать подороже. */}
        <ul className="mt-4 space-y-1.5">
          {reasons.map((r) => (
            <li key={r} className="flex gap-2 text-sm">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" />
              {r}
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2" noValidate>
        {isCompany ? (
          <>
            <div>
              <Label>Организация</Label>
              <Input name="orgName" required placeholder="ВФЛА" />
            </div>
            <div>
              <Label>ИНН</Label>
              <Input name="inn" required placeholder="для счёта" inputMode="numeric" />
            </div>
          </>
        ) : (
          <div className="sm:col-span-2">
            <Label>Название мероприятия или организатора</Label>
            <Input name="orgName" required placeholder="Конкурс «Мастер года»" />
          </div>
        )}
        <div>
          <Label>Как к вам обращаться</Label>
          <Input name="contact" required placeholder="Наталья Сергеевна" />
        </div>
        <div>
          <Label>Почта</Label>
          <Input name="email" type="email" required placeholder="secretary@example.ru" />
        </div>
        <div className="sm:col-span-2">
          <Label>Комментарий</Label>
          <Textarea name="comment" rows={2} placeholder="К какому мероприятию нужно успеть" />
        </div>

        <div className="absolute -left-[9999px]" aria-hidden="true">
          <input name="website" tabIndex={-1} autoComplete="off" />
        </div>

        {error && <p className="text-sm text-[var(--danger)] sm:col-span-2">{error}</p>}

        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Отправляем…' : isCompany ? 'Выставить счёт' : 'Получить доступ'}
          </Button>
          <p className="text-xs text-[var(--text-muted)]">
            Отправляя, вы соглашаетесь с{' '}
            <a href="/privacy" className="underline underline-offset-2">
              политикой обработки данных
            </a>
            .
          </p>
        </div>
      </form>
    </div>
  );
}

function Thanks({ answers }: { answers: Answers }) {
  const company = answers.payer === 'company';
  return (
    <div className="flex items-start gap-3 rounded-xl bg-[var(--accent-soft)] p-6">
      <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[var(--accent)]" />
      <div>
        <h3 className="font-serif text-xl text-[var(--accent)]">Готово</h3>
        <p className="mt-2 text-sm leading-relaxed">
          {company
            ? 'Счёт и договор придут на указанную почту. Оплачивать сразу не нужно — сначала документы посмотрит ваш юрист.'
            : 'Ссылка на оплату придёт на указанную почту. Первые 50 документов можно выпустить бесплатно уже сейчас.'}
        </p>
      </div>
    </div>
  );
}
