import { FormEvent, useState } from 'react';
import { CheckCircle2, Phone } from 'lucide-react';
import {
  CALL_TIMES,
  CALL_TIME_LABELS,
  CONSENT_TEXT,
  EVENT_KINDS,
  EVENT_KIND_LABELS,
  VOLUME_BANDS,
  VOLUME_BAND_LABELS,
  type CallTime,
  type EventKind,
  type LeadRequest,
  type VolumeBand,
} from '@gramota/shared';
import { Button } from '../ui/Button';
import { Input, Label, Select, Textarea } from '../ui/Field';

/**
 * Заявка на разговор об условиях.
 *
 * Единственный вход для организации: цен на сайте нет, и посчитать себе
 * стоимость самостоятельно человек не может. Значит, форма обязана быть
 * короткой и говорить, что будет дальше, — иначе она читается как
 * «оставьте телефон, вам перезвонит менеджер».
 *
 * Спрашиваем ровно то, без чего разговор не подготовить: объём за год,
 * тип мероприятий и когда удобно звонить. Всё остальное выясняется
 * в самом разговоре, и каждое лишнее поле здесь стоит части заявок.
 *
 * Проверка настоящая — на сервере: здесь только браузерная, чтобы человек
 * увидел пропущенное поле сразу, а не после отправки.
 */
export function DiscussTerms() {
  const [kinds, setKinds] = useState<EventKind[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  function toggle(kind: EventKind) {
    setKinds((cur) => (cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind]));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const text = (name: string) => (form.get(name) as string) || undefined;
    // Галочка обязательна и по разметке, но проверяем и здесь: без согласия
    // отправлять персональные данные нам нельзя, а разметку можно обойти.
    if (form.get('consent') !== 'on') {
      setError('Без согласия на обработку данных заявку принять нельзя');
      setBusy(false);
      return;
    }
    // Тип общий с серверной схемой: разъедутся имена полей — встанет сборка.
    const body: LeadRequest = {
      orgName: text('orgName') ?? '',
      contact: text('contact') ?? '',
      email: text('email') ?? '',
      phone: text('phone'),
      volume: text('volume') as VolumeBand | undefined,
      callTime: text('callTime') as CallTime | undefined,
      comment: text('comment'),
      eventKinds: kinds,
      consent: true,
      website: text('website'),
    };
    try {
      const res = await fetch('/api/v1/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? 'Не удалось отправить заявку');
        return;
      }
      setSent(true);
    } catch {
      setError('Не удалось отправить. Проверьте соединение');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="obsudit"
      className="scroll-mt-16 border-y border-[var(--line)] bg-[var(--surface)]"
    >
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="font-serif text-3xl">Обсудить условия</h2>
        <p className="mt-2 text-[var(--text-muted)]">
          Расскажите, что и в каком объёме вы выдаёте, — вернёмся с условиями
          и ответим на вопросы юридического отдела и бухгалтерии. Если пробовать
          сервис ещё не начали, начните: первые 50 документов бесплатны и
          разговора не требуют.
        </p>

        {sent ? <Thanks /> : (
          <form onSubmit={submit} className="mt-8 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Организация</Label>
              <Input name="orgName" required maxLength={200} placeholder="Федерация лёгкой атлетики области" />
            </div>

            <div>
              <Label>Сколько документов в год</Label>
              <Select name="volume" defaultValue="">
                <option value="" disabled>
                  Выберите примерный объём
                </option>
                {VOLUME_BANDS.map((band) => (
                  <option key={band} value={band}>
                    {VOLUME_BAND_LABELS[band]}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Когда удобно позвонить</Label>
              <Select name="callTime" defaultValue="">
                <option value="" disabled>
                  Выберите время
                </option>
                {CALL_TIMES.map((time) => (
                  <option key={time} value={time}>
                    {CALL_TIME_LABELS[time]}
                  </option>
                ))}
              </Select>
            </div>

            <fieldset className="sm:col-span-2">
              <Label>Тип мероприятий</Label>
              <div className="flex flex-wrap gap-2">
                {EVENT_KINDS.map((kind) => {
                  const on = kinds.includes(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(kind)}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors duration-150 ${
                        on
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'bg-[var(--surface-sunken)] text-[var(--text)] hover:bg-[var(--accent-soft)]'
                      }`}
                    >
                      {on && <CheckCircle2 size={14} />}
                      {EVENT_KIND_LABELS[kind]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <Label>Как к вам обращаться</Label>
              <Input name="contact" required maxLength={120} placeholder="Наталья Сергеевна" />
            </div>
            <div>
              <Label>Почта</Label>
              <Input name="email" type="email" required maxLength={254} placeholder="secretary@example.ru" />
            </div>
            <div className="sm:col-span-2">
              <Label>Телефон</Label>
              <Input name="phone" type="tel" maxLength={40} placeholder="Необязательно — можем ответить письмом" />
            </div>

            <div className="sm:col-span-2">
              <Label>Что важно учесть</Label>
              <Textarea
                name="comment"
                rows={3}
                maxLength={2000}
                placeholder="К какому мероприятию нужно успеть, какие документы выдаёте, что спрашивает юридический отдел"
              />
            </div>

            {/* Поле-ловушка: человек его не видит и не заполняет, автомат
                заполняет всё подряд. Заявку с ним сервер тихо отбрасывает. */}
            <div className="absolute -left-[9999px]" aria-hidden="true">
              <input name="website" tabIndex={-1} autoComplete="off" />
            </div>

            <label className="flex cursor-pointer gap-3 text-sm leading-relaxed sm:col-span-2">
              <input
                type="checkbox"
                name="consent"
                required
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              {/* Текст берётся из общего справочника: сервер записывает
                  в заявку его редакцию, и они обязаны совпадать. */}
              <span>
                {CONSENT_TEXT}{' '}
                <a href="/privacy" className="underline underline-offset-2">
                  Политика обработки данных
                </a>
              </span>
            </label>

            {error && <p className="text-sm text-[var(--danger)] sm:col-span-2">{error}</p>}

            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <Button type="submit" variant="primary" disabled={busy} icon={<Phone size={16} />}>
                {busy ? 'Отправляем…' : 'Отправить заявку'}
              </Button>
              <p className="text-xs text-[var(--text-muted)]">
                Отвечаем в рабочий день. Ничего не подключаем и не списываем
                без вашего слова.
              </p>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function Thanks() {
  return (
    <div className="mt-8 flex items-start gap-3 rounded-xl bg-[var(--accent-soft)] p-6">
      <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[var(--accent)]" />
      <div>
        <h3 className="font-serif text-xl text-[var(--accent)]">Заявка у нас</h3>
        <p className="mt-2 text-sm leading-relaxed">
          Свяжемся в рабочий день, в указанное время. А пока можно завести
          кабинет и выпустить первые 50 документов бесплатно — к разговору
          будет о чём говорить предметно.
        </p>
      </div>
    </div>
  );
}
