import { FormEvent, useEffect, useState } from 'react';
import { Check, ReceiptText } from 'lucide-react';
import { useBilling, useUpdateBilling, type BillingKind, type BillingPatch } from '../api/org';
import { ApiError } from '../api/client';
import { Button } from '../ui/Button';
import { Input, Label, Select } from '../ui/Field';
import { formatDate } from './preferences';

const KINDS: { value: BillingKind; title: string }[] = [
  { value: 'legal', title: 'Юридическое лицо' },
  { value: 'ie', title: 'Индивидуальный предприниматель' },
  { value: 'self_employed', title: 'Самозанятый' },
  { value: 'individual', title: 'Физическое лицо' },
];

const empty: BillingPatch = {
  kind: 'legal',
  name: '',
  inn: '',
  kpp: '',
  ogrn: '',
  address: '',
  email: '',
};

/**
 * Реквизиты для счетов и закрывающих.
 *
 * Поля меняются вместе с видом плательщика: у самозанятого нет ни КПП,
 * ни ОГРН, и показывать их пустыми — приглашение вписать туда что попало.
 * Первое заполнение подставляется из последнего счёта: он уже содержит
 * копию реквизитов покупателя, и переписывать их с бумажки незачем.
 */
export function Billing() {
  const { data } = useBilling();
  const save = useUpdateBilling();
  const [form, setForm] = useState<BillingPatch>(empty);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!data) return;
    setForm({
      kind: data.kind ?? 'legal',
      name: data.name || (data.kind ? '' : data.suggested.name),
      inn: data.inn || (data.kind ? '' : data.suggested.inn),
      kpp: data.kpp,
      ogrn: data.ogrn,
      address: data.address,
      email: data.email || (data.kind ? '' : data.suggested.email),
    });
  }, [data]);

  const set = (patch: Partial<BillingPatch>) => setForm((f) => ({ ...f, ...patch }));
  const isLegal = form.kind === 'legal';
  const hasOgrn = form.kind === 'legal' || form.kind === 'ie';
  const person = form.kind === 'legal';

  function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    save.mutate(
      // Лишние поля обнуляем, а не прячем: иначе КПП, введённый до смены
      // вида плательщика, уехал бы в счёт самозанятого.
      { ...form, kpp: isLegal ? form.kpp : '', ogrn: hasOgrn ? form.ogrn : '' },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 4000);
        },
        onError: (e2: unknown) =>
          setError(e2 instanceof ApiError ? e2.message : 'Не получилось сохранить'),
      },
    );
  }

  return (
    <section>
      <h2 className="flex items-center gap-2 font-serif text-xl">
        <ReceiptText size={18} className="text-[var(--accent)]" />
        Реквизиты
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
        По ним выставляется счёт и оформляются закрывающие документы. Бухгалтерия проверит их до
        копейки, поэтому лучше заполнить один раз и точно.
      </p>

      {data && !data.kind && data.suggested.name && (
        <p className="mt-3 max-w-2xl rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-muted)]">
          {data.suggested.from === 'invoice' ? (
            <>
              Подставили из счёта{data.suggested.at ? ` от ${formatDate(data.suggested.at)}` : ''} —
              проверьте и сохраните.
            </>
          ) : (
            <>Подставили из профиля организации — проверьте и дополните.</>
          )}
        </p>
      )}

      <form
        onSubmit={submit}
        className="mt-4 max-w-xl space-y-4 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]"
      >
        <div>
          <Label>Кто платит</Label>
          <Select value={form.kind} onChange={(e) => set({ kind: e.target.value as BillingKind })}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.title}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>{person ? 'Полное название' : 'Фамилия, имя, отчество'}</Label>
          <Input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            maxLength={300}
            placeholder={person ? 'ООО «Развитие»' : 'Новикова Мария Сергеевна'}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-40 flex-1">
            <Label>ИНН</Label>
            <Input
              value={form.inn}
              onChange={(e) => set({ inn: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              maxLength={12}
              placeholder={isLegal ? '7707083893' : '770708389312'}
            />
          </div>
          {isLegal && (
            <div className="min-w-40 flex-1">
              <Label>КПП</Label>
              <Input
                value={form.kpp}
                onChange={(e) => set({ kpp: e.target.value.replace(/\D/g, '') })}
                inputMode="numeric"
                maxLength={9}
                placeholder="770701001"
              />
            </div>
          )}
          {hasOgrn && (
            <div className="min-w-40 flex-1">
              <Label>{isLegal ? 'ОГРН' : 'ОГРНИП'}</Label>
              <Input
                value={form.ogrn}
                onChange={(e) => set({ ogrn: e.target.value.replace(/\D/g, '') })}
                inputMode="numeric"
                maxLength={15}
                placeholder={isLegal ? '1027700132195' : '304500116000157'}
              />
            </div>
          )}
        </div>

        <div>
          <Label>Адрес</Label>
          <Input
            value={form.address}
            onChange={(e) => set({ address: e.target.value })}
            maxLength={500}
            placeholder="119991, Москва, Ленинский проспект, 1"
          />
        </div>

        <div>
          <Label hint="Сюда придут счёт и закрывающие">Почта бухгалтерии</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            maxLength={254}
            placeholder="buh@example.com"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Сохраняем…' : 'Сохранить реквизиты'}
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
