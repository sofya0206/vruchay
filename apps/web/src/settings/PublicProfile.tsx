import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Globe, ImagePlus, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import {
  usePublicProfile,
  useUpdatePublicProfile,
  type PublicProfile as Profile,
  type VerifyNameMode,
} from '../api/org';
import { Button } from '../ui/Button';
import { Checkbox, Radio } from '../ui/Checkbox';
import { Input, Label, Textarea } from '../ui/Field';

/**
 * Текст согласия на распространение ПД — ЧЕРНОВИК ДЛЯ ЮРИСТА.
 *
 * Поиск по ФИО в публичном реестре — это распространение персональных
 * данных, разрешённых субъектом для распространения (ст. 10.1 152-ФЗ).
 * Такое согласие оформляется отдельно от согласия на обработку, и собирает
 * его эмитент как оператор — мы даём инструмент и галочку-подтверждение.
 * Формулировка ниже — заготовка; до включения поиска по ФИО для настоящих
 * клиентов её должен посмотреть юрист.
 */
const CONSENT_DRAFT =
  'Подтверждаю, что от каждого участника, чьи документы будут находиться по ФИО, ' +
  'получено отдельное согласие на распространение персональных данных ' +
  '(ст. 10.1 Федерального закона № 152-ФЗ) с указанием фамилии, имени, отчества ' +
  'и сведений о выданном документе, и организация хранит эти согласия.';

const NAME_MODES: { value: VerifyNameMode; label: string; hint: string }[] = [
  {
    value: 'full',
    label: 'Как отмечено в материале',
    hint: 'обычно полное ФИО — оно и так напечатано на бумаге',
  },
  {
    value: 'initials',
    label: 'Фамилия и инициалы',
    hint: 'Иванов П. И. — остальные отмеченные поля показываются',
  },
  {
    value: 'none',
    label: 'Только факт подлинности',
    hint: '«документ подлинный, выдан организацией» — без данных о человеке',
  },
];

/**
 * Публичное лицо организации.
 *
 * Два разных решения в одном разделе, и оба принимает организация как
 * оператор персональных данных: сколько показывать о получателе на
 * странице проверки и показываться ли самой наружу — страницей
 * с реестром, поиском и индексацией.
 */
export function PublicProfile() {
  const { data } = usePublicProfile();
  const update = useUpdatePublicProfile();
  const [form, setForm] = useState<Profile | null>(null);
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState(false);
  const qc = useQueryClient();
  const logoInput = useRef<HTMLInputElement>(null);
  const uploadLogo = useMutation({
    mutationFn: (file: File) => api.upload<Profile>('/org/public-profile/logo', file),
    onSuccess: (profile) => qc.setQueryData(['org-public-profile'], profile),
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!form) return null;

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const needsConsent = form.publicSearchByName && !data?.publicSearchByName;
  const canSave = !update.isPending && (!needsConsent || consent);

  function save() {
    if (!form) return;
    update.mutate(
      {
        slug: form.slug?.trim() ? form.slug.trim() : null,
        description: form.description,
        inn: form.inn,
        website: form.website,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        publicPageEnabled: form.publicPageEnabled,
        publicSearchByName: form.publicSearchByName,
        consentConfirmed: form.publicSearchByName ? consent || !needsConsent : undefined,
        publicIndexable: form.publicIndexable,
        verifyNameMode: form.verifyNameMode,
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 4000);
        },
      },
    );
  }

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Globe size={18} className="text-[var(--accent)]" />
        Страница проверки и публичный реестр
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
        Страницу проверки открывает любой, кто знает код с документа. Что на ней показывать о
        человеке — решаете вы как оператор персональных данных.
      </p>

      <div className="mt-4 max-w-2xl space-y-6 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
        <div>
          <Label>Кого показывать на странице проверки</Label>
          <div className="space-y-2">
            {NAME_MODES.map((mode) => (
              <Radio
                key={mode.value}
                name="verify-name-mode"
                checked={form.verifyNameMode === mode.value}
                onChange={() => set('verifyNameMode', mode.value)}
                label={mode.label}
                hint={mode.hint}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Адрес почты, телефон и дата рождения не показываются никогда, что бы ни было отмечено в
            материале.
          </p>
        </div>

        <hr className="border-[var(--line)]" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Почта для вопросов по документам</Label>
            <Input
              type="email"
              value={form.contactEmail}
              onChange={(e) => set('contactEmail', e.target.value)}
              placeholder="docs@federation.ru"
            />
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
              Туда уходит «сообщить о проблеме» со страницы проверки.
            </p>
          </div>
          <div>
            <Label>Сайт</Label>
            <Input
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
              placeholder="https://federation.ru"
            />
          </div>
        </div>

        <hr className="border-[var(--line)]" />

        <div className="space-y-3">
          <Checkbox
            checked={form.publicPageEnabled}
            onChange={(checked) => set('publicPageEnabled', checked)}
            label="Публичная страница организации"
            hint="Логотип, описание, ИНН, список программ и поиск документа по номеру — то, что первым спрашивают HR и приёмные комиссии."
          />

          {form.publicPageEnabled && (
            <div className="space-y-4 pl-6">
              <div className="flex items-center gap-4">
                {data?.logoUrl ? (
                  <img
                    src={data.logoUrl}
                    alt=""
                    className="h-16 w-16 rounded-xl bg-[var(--surface-sunken)] object-contain p-1"
                  />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-muted)]">
                    <ImagePlus size={20} />
                  </div>
                )}
                <div>
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadLogo.mutate(file);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={uploadLogo.isPending}
                    onClick={() => logoInput.current?.click()}
                  >
                    {uploadLogo.isPending
                      ? 'Загружаем…'
                      : data?.logoUrl
                        ? 'Заменить логотип'
                        : 'Загрузить логотип'}
                  </Button>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">PNG или JPEG до 2 МБ.</p>
                  {uploadLogo.isError && (
                    <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
                      {(uploadLogo.error as Error).message}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <Label>Адрес страницы</Label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-[var(--text-muted)]">vruchay.ru/org/</span>
                  <Input
                    value={form.slug ?? ''}
                    onChange={(e) => set('slug', e.target.value)}
                    placeholder="federation"
                    maxLength={50}
                  />
                </div>
                <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                  Латиница, цифры и дефис. Без адреса страница не откроется.
                </p>
              </div>
              <div>
                <Label>Описание</Label>
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  maxLength={2000}
                  placeholder="Кто вы и какие документы выдаёте"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>ИНН</Label>
                  <Input
                    value={form.inn}
                    onChange={(e) => set('inn', e.target.value)}
                    placeholder="7700000000"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <Label>Телефон</Label>
                  <Input
                    value={form.contactPhone}
                    onChange={(e) => set('contactPhone', e.target.value)}
                    placeholder="+7 900 000-00-00"
                  />
                </div>
              </div>

              <Checkbox
                checked={form.publicIndexable}
                onChange={(checked) => set('publicIndexable', checked)}
                label="Разрешить поисковикам индексировать страницу организации и страницы проверки"
                hint="Выключено — на всех страницах стоит noindex, и в поиске их нет."
              />

              <Checkbox
                checked={form.publicSearchByName}
                onChange={(checked) => {
                  set('publicSearchByName', checked);
                  if (!checked) setConsent(false);
                }}
                label="Поиск документов по ФИО в публичном реестре"
                hint="Поиск по номеру документа есть всегда. Поиск по фамилии — распространение персональных данных (ст. 10.1 152-ФЗ): нужно отдельное согласие каждого участника, его собираете вы."
              />

              {needsConsent && (
                /* Черновик формулировки — до показа настоящим клиентам её смотрит юрист. */
                <Checkbox
                  checked={consent}
                  onChange={setConsent}
                  label={CONSENT_DRAFT}
                  className="ml-6 rounded-xl bg-[var(--award-soft)] p-3"
                />
              )}
            </div>
          )}

          <p className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <ShieldCheck size={13} />
            {form.verifiedIssuer
              ? 'Значок «Верифицированный эмитент» получен.'
              : 'Значок «Верифицированный эмитент» ставит сервис после проверки домена и ИНН — напишите в поддержку.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" variant="primary" disabled={!canSave} onClick={save}>
            {update.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-[var(--accent)]">
              <Check size={15} /> Сохранено
            </span>
          )}
        </div>
        {update.isError && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {(update.error as Error).message}
          </p>
        )}
      </div>
    </section>
  );
}
