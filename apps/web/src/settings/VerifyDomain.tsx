import { FormEvent, useEffect, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { usePublicProfile, useSetVerifyDomain } from '../api/org';
import { ApiError } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';

/**
 * Домен страницы проверки.
 *
 * На него ведут QR-код и ссылка в документе: проверяющий видит адрес
 * организации, а не наш. Само обслуживание чужого домена — сертификат
 * и маршрутизация — делается отдельно; здесь домен только задаётся,
 * и об этом честно написано на экране: обещать работающую ссылку,
 * которая ещё не работает, хуже, чем не обещать ничего.
 */
export function VerifyDomain() {
  const { data } = usePublicProfile();
  const save = useSetVerifyDomain();
  const [domain, setDomain] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (data) setDomain(data.verifyDomain);
  }, [data]);

  const changed = data ? domain.trim().toLowerCase() !== data.verifyDomain : false;

  function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    save.mutate(domain.trim().toLowerCase(), {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 4000);
      },
      onError: (e2: unknown) =>
        setError(e2 instanceof ApiError ? e2.message : 'Не получилось сохранить'),
    });
  }

  const shown = domain.trim() || 'vruchay.ru';

  return (
    <section>
      <h2 className="flex items-center gap-2 font-serif text-xl">
        <Globe size={18} className="text-[var(--accent)]" />
        Домен страницы проверки
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
        Адрес, который проверяющий видит в ссылке и в QR-коде. Пусто — общий адрес сервиса; он
        работает всегда и настройки не требует.
      </p>

      <form
        onSubmit={submit}
        className="mt-4 max-w-xl space-y-3 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]"
      >
        <div>
          <Label>Домен</Label>
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            maxLength={253}
            autoComplete="off"
            placeholder="diplom.sca-swimming.com"
          />
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            Ссылка будет выглядеть так:{' '}
            <code className="font-mono break-all text-[var(--text)]">
              https://{shown}/c/K7M2-9QXR-4TVB
            </code>
          </p>
        </div>

        <div className="rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-muted)]">
          Домен сохраняется, но пока не обслуживается: чтобы ссылка открывалась, на него нужен
          сертификат и маршрут до нас — напишите в поддержку, включим вручную.
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={!changed || save.isPending}>
            {save.isPending ? 'Сохраняем…' : 'Сохранить домен'}
          </Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-[var(--accent)]">
              <Check size={15} /> Сохранено
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
