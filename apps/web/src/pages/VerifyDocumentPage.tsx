import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { BadgeCheck, RefreshCw, ShieldX } from 'lucide-react';
import { api } from '../api/client';
import { Meta } from '../seo/Meta';

interface VerifyResult {
  valid: boolean;
  /** Документ заменён перевыпущенным — это не то же самое, что отозван. */
  replaced: boolean;
  title: string;
  issuedAt: string;
  fields: Record<string, string>;
  /** Код, напечатанный на бумаге, — по нему человек сверяет страницу с листом. */
  code: string;
  /** Куда смотреть вместо этого. Пусто, если замена сама недействительна. */
  replacedBy?: { code: string; path: string; issuedAt: string } | null;
}

/**
 * Страница проверки подлинности документа.
 *
 * Открывается по QR-коду с грамоты. Смотрит её посторонний человек —
 * работодатель, приёмная комиссия, судья, — у которого нет и не будет
 * учётной записи, поэтому вход не требуется.
 *
 * Ответ намеренно скупой: подлинность, название и те поля, которые
 * организация сама разрешила показывать. Адрес почты и прочие колонки
 * таблицы сюда не попадают — иначе перебор ссылок стал бы способом
 * выгрузить список участников.
 */
export function VerifyDocumentPage() {
  const { publicId = '' } = useParams();

  const check = useQuery({
    queryKey: ['verify', publicId],
    queryFn: () => api.get<VerifyResult>(`/v1/verify/${publicId}`),
    retry: false,
  });

  return (
    <>
      <Meta
        title="Проверка подлинности документа — Вручай"
        description="Проверка подлинности наградного документа по коду с бланка."
        path={`/verify/${publicId}`}
        noindex
      />
      <div className="grid min-h-full place-items-center bg-[var(--ground)] px-6 py-16">
        <main className="w-full max-w-md text-center">
          {check.isPending && <p className="text-[var(--text-muted)]">Проверяем…</p>}

          {check.isError && (
            <div className="rounded-2xl bg-[var(--surface)] p-8 ring-1 ring-[var(--line)]">
              <ShieldX size={40} className="mx-auto text-[var(--danger)]" strokeWidth={1.5} />
              <h1 className="mt-4 font-serif text-2xl">Документ не найден</h1>
              <p className="mt-2 text-[var(--text-muted)]">
                Такого документа нет, либо он отозван выдавшей организацией.
                Проверьте код на бланке — возможно, при вводе вкралась опечатка.
              </p>
            </div>
          )}

          {check.data && (
            <div className="rounded-2xl bg-[var(--surface)] p-8 ring-1 ring-[var(--line)]">
              {check.data.replaced ? (
                <>
                  <RefreshCw size={40} className="mx-auto text-[var(--award)]" strokeWidth={1.5} />
                  <h1 className="mt-4 font-serif text-2xl">Этот документ заменён</h1>
                  {/*
                    Замена — не отзыв, и говорить о ней надо иначе. Отозванный
                    документ признан недействительным, и предъявителю остаётся
                    идти в организацию. Заменённый же означает исправленную
                    ошибку — в фамилии, в разряде, в дате: действующий документ
                    существует, и человеку нужно всего лишь показать, где он.
                  */}
                  <p className="mt-2 text-[var(--text-muted)]">
                    Организация выпустила вместо него новый — обычно так исправляют опечатку
                    в имени или в звании. Действителен новый документ.
                  </p>
                  {check.data.replacedBy ? (
                    <Link
                      to={check.data.replacedBy.path}
                      className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
                    >
                      Проверить действующий документ
                    </Link>
                  ) : (
                    <p className="mt-3 text-sm text-[var(--text-muted)]">
                      Проверить новый документ здесь пока нельзя — обратитесь в выдавшую
                      организацию.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <BadgeCheck size={40} className="mx-auto text-[var(--accent)]" strokeWidth={1.5} />
                  <h1 className="mt-4 font-serif text-2xl">Документ подлинный</h1>
                </>
              )}
              <p className="mt-1 text-[var(--text-muted)]">{check.data.title}</p>

              <dl className="mt-6 space-y-2 border-t border-[var(--line)] pt-6 text-left text-sm">
                {Object.entries(check.data.fields).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4">
                    <dt className="text-[var(--text-muted)]">{fieldLabel(key)}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Выдан</dt>
                  <dd className="tabular text-right font-medium">
                    {new Date(check.data.issuedAt).toLocaleDateString('ru-RU', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          <p className="mt-6 text-sm text-[var(--text-muted)]">
            Проверка выполнена сервисом{' '}
            <Link to="/" className="text-[var(--accent)] hover:underline">
              Вручай
            </Link>
          </p>
        </main>
      </div>
    </>
  );
}

/**
 * Человеческая подпись поля.
 *
 * Колонки таблицы называет сама организация, и в них латиница: «name»,
 * «place». Показывать их постороннему, который проверяет грамоту, нельзя —
 * страница выглядит недоделанной, а слова эти ему ничего не говорят.
 *
 * Известные переводим, остальные показываем с заглавной буквы: придумывать
 * описания чужим словам мы не можем, но и оставлять их в исходном виде
 * незачем.
 */
function fieldLabel(key: string): string {
  const known: Record<string, string> = {
    name: 'Кому выдан',
    fio: 'Кому выдан',
    place: 'Результат',
    result: 'Результат',
    club: 'Клуб',
    team: 'Команда',
    city: 'Город',
    event: 'Мероприятие',
    course: 'Программа',
    date: 'Дата',
    hours: 'Часов',
  };
  if (known[key]) return known[key];
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}
