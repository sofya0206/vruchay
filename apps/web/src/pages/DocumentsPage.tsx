import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, FileText, LogOut, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { DocumentDetail, DocumentList } from '../api/types';
import { useLogout, useMe } from '../auth/useAuth';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { InstallHint } from '../ui/InstallHint';

export function DocumentsPage() {
  const qc = useQueryClient();
  const me = useMe();
  const logout = useLogout();
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');

  const documents = useQuery({
    queryKey: ['documents', search],
    queryFn: () =>
      api.get<DocumentList>(
        `/documents?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const create = useMutation({
    mutationFn: (t: string) => api.post<DocumentDetail>('/documents', { title: t }),
    onSuccess: () => {
      setTitle('');
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (title.trim()) create.mutate(title.trim());
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)]">
            <Award size={17} strokeWidth={1.75} />
          </span>
          <span className="font-serif text-lg">Лауреат</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-[var(--text-muted)] sm:inline">
              {me.data?.email}
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon={<LogOut size={15} />}
              onClick={() => logout.mutate()}
            >
              Выйти
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Документы</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Шаблоны сертификатов, грамот и дипломов
              {documents.data ? ` · ${documents.data.total}` : ''}
            </p>
          </div>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию"
              className="w-56 pl-9"
            />
          </div>
        </div>

        <form onSubmit={onCreate} className="mb-6 flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название нового документа, например «Сертификат участника семинара»"
          />
          <Button
            type="submit"
            variant="primary"
            icon={<Plus size={16} />}
            disabled={create.isPending || !title.trim()}
          >
            Создать
          </Button>
        </form>

        {documents.isPending && <p className="text-[var(--text-muted)]">Загрузка…</p>}

        {documents.data?.items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-16 text-center">
            <FileText size={28} className="mx-auto mb-3 text-[var(--text-muted)]" strokeWidth={1.5} />
            <p className="font-medium">
              {search ? 'Ничего не нашлось' : 'Пока ни одного документа'}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {search
                ? 'Попробуйте изменить запрос'
                : 'Создайте шаблон, загрузите фон и разместите на нём текст с переменными'}
            </p>
          </div>
        )}

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.data?.items.map((doc) => (
            <li
              key={doc.id}
              className="group overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--line)] transition-shadow hover:shadow-md"
            >
              <Link to={`/documents/${doc.id}`} className="block">
                <div
                  className="grid place-items-center border-b border-[var(--line)] bg-[var(--surface-sunken)]"
                  style={{ aspectRatio: `${doc.pageWidthMm} / ${doc.pageHeightMm}` }}
                >
                  <FileText size={26} className="text-[var(--line-strong)]" strokeWidth={1.5} />
                </div>
                <div className="p-4">
                  <h2 className="truncate font-sans text-base font-medium">{doc.title}</h2>
                  <p className="tabular mt-1 text-sm text-[var(--text-muted)]">
                    {Math.round(doc.pageWidthMm)}×{Math.round(doc.pageHeightMm)} мм ·{' '}
                    {new Date(doc.updatedAt).toLocaleDateString('ru-RU')}
                  </p>
                </div>
              </Link>
              <div className="px-4 pb-3">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={14} />}
                  onClick={() => remove.mutate(doc.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  В корзину
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </main>

      <InstallHint />
    </div>
  );
}
