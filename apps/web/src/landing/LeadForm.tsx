import { FormEvent, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, Label, Textarea } from '../ui/Field';

/**
 * Заявка на счёт.
 *
 * Раньше здесь была ссылка на почту. Письмо на общий ящик живёт до первого
 * завала входящих, а это единственный вход для крупных клиентов — заявка
 * должна попадать в базу, а не в переписку.
 *
 * Обязательных полей три: организация, имя и почта. Каждое лишнее
 * обязательное поле стоит части заявок, а недостающее спросим в ответе.
 */

interface FieldError {
  field: string;
  message: string;
}

export function LeadForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [general, setGeneral] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    setGeneral('');

    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(form.entries());

    try {
      const res = await fetch('/api/v1/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        errors?: FieldError[];
      };
      if (!res.ok) {
        setErrors(data.errors ?? []);
        setGeneral(data.errors?.length ? '' : (data.message ?? 'Не удалось отправить заявку'));
        return;
      }
      setSent(true);
    } catch {
      setGeneral('Не удалось отправить заявку. Проверьте соединение и попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-[var(--accent-soft)] p-6">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <div>
          <h3 className="font-serif text-xl text-[var(--accent)]">Заявка принята</h3>
          <p className="mt-2 text-sm leading-relaxed">
            Ответим на указанную почту: пришлём договор, договор-поручение
            на обработку персональных данных и счёт. Их можно сразу передать
            юристу и в бухгалтерию.
          </p>
        </div>
      </div>
    );
  }

  const errorFor = (name: string) => errors.find((e) => e.field === name)?.message;

  return (
    <form onSubmit={onSubmit} className="rounded-xl bg-[var(--accent-soft)] p-6" noValidate>
      <h3 className="font-serif text-xl text-[var(--accent)]">Пришлём счёт и договор</h3>
      <p className="mt-2 max-w-xl text-sm leading-relaxed">
        Оставьте контакты — вышлем договор, договор-поручение и счёт. Ничего
        оплачивать сразу не нужно: сначала документы посмотрит ваш юрист.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field name="orgName" label="Организация" placeholder="ВФЛА" error={errorFor('orgName')} required />
        <Field name="contact" label="Как к вам обращаться" placeholder="Наталья Сергеевна" error={errorFor('contact')} required />
        <Field name="email" label="Почта для ответа" type="email" placeholder="secretary@example.ru" error={errorFor('email')} required />
        <Field name="phone" label="Телефон, если удобнее" placeholder="необязательно" error={errorFor('phone')} />
        <div className="sm:col-span-2">
          <Field
            name="volume"
            label="Сколько документов в год"
            placeholder="примерно, чтобы предложить подходящий тариф"
            error={errorFor('volume')}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Комментарий</Label>
          <Textarea
            name="comment"
            rows={3}
            placeholder="Что выдаёте, к какому мероприятию нужно успеть"
          />
        </div>
      </div>

      {/* Ловушка для автоматов: человек этого поля не видит. */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {general && <p className="mt-4 text-sm text-[var(--danger)]">{general}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Отправляем…' : 'Запросить счёт'}
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
  );
}

function Field({
  name,
  label,
  error,
  ...rest
}: {
  name: string;
  label: string;
  error?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input name={name} aria-invalid={Boolean(error)} {...rest} />
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
