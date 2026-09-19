import { FormEvent, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FilePlus2, Plus } from 'lucide-react';
import { api, errorText } from '../api/client';
import type { DocumentDetail, DocumentList } from '../api/types';
import { useFolders } from '../api/folders';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { Select } from '../ui/Select';
import { cn } from '../ui/cn';
import { DocumentPreview } from './DocumentCard';
import { PageSizePicker, type PageSizeValue } from './PageSizePicker';

/** Список шаблонов организации — общий ключ для панели и раздела «Шаблоны». */
export function useTemplates() {
  return useQuery({
    queryKey: ['documents', 'templates'],
    queryFn: () => api.get<DocumentList>('/documents?limit=50&templates=true'),
  });
}

/**
 * Создание документа: сначала основа, потом название.
 *
 * Основа — плитками с самим листом, а не выпадающим списком названий:
 * шаблоны различают по виду, «Грамота 2» и «Грамота 2 (новая)» в списке
 * не говорят ничего. Первая плитка — чистый лист, у него и только у него
 * выбирается размер: макет шаблона свёрстан под свой лист.
 *
 * Созданный документ сразу открывается. Раньше он молча появлялся в списке,
 * и человек оставался перед той же страницей, будто ничего не произошло.
 */
export function CreateDocumentPanel({
  initialTemplateId,
  initialFolderId,
  onClose,
}: {
  initialTemplateId: string | null;
  initialFolderId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const folders = useFolders();
  const templates = useTemplates();

  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId);
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState<string>(initialFolderId ?? '');
  // A4 альбомная — то, на чём печатают грамоты чаще всего.
  const [size, setSize] = useState<PageSizeValue>({ widthMm: 297, heightMm: 210 });

  const list = templates.data?.items ?? [];
  // Шаблон из ссылки мог уйти в корзину — тогда основа молча чистый лист.
  const chosen = list.find((t) => t.id === templateId) ?? null;

  const create = useMutation({
    mutationFn: () =>
      api.post<DocumentDetail>('/documents', {
        title: title.trim(),
        ...(chosen
          ? { templateId: chosen.id }
          : { pageWidthMm: size.widthMm, pageHeightMm: size.heightMm }),
        ...(folderId ? { folderId } : {}),
      }),
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      navigate(`/documents/${doc.id}`);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (title.trim()) create.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="card mb-6 space-y-4 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">Новый документ</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text)]"
        >
          Отмена
        </button>
      </div>

      <div
        role="radiogroup"
        aria-label="Основа документа"
        className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3"
      >
        <BasisTile selected={!chosen} onSelect={() => setTemplateId(null)} label="Чистый лист">
          <div className="grid h-full place-items-center">
            <FilePlus2 size={26} strokeWidth={1.5} className="text-[var(--text-muted)]" />
          </div>
        </BasisTile>
        {list.map((t) => (
          <BasisTile
            key={t.id}
            selected={chosen?.id === t.id}
            onSelect={() => setTemplateId(t.id)}
            label={t.title}
          >
            <DocumentPreview doc={t} />
          </BasisTile>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название, например «Сертификат участника семинара»"
          aria-label="Название документа"
          className="min-w-64 flex-1"
          autoFocus
        />
        {/* Внутри папки она и подставлена: человек нажал «Создать», стоя
            в своей папке, — документ ждут там же. Пока папок нет, выбирать
            не из чего — тогда поля нет вовсе. */}
        {(folders.data ?? []).length > 0 && (
          <Select
            value={folderId}
            onChange={setFolderId}
            options={[
              { value: '', label: 'Вне папок' },
              ...(folders.data ?? []).map((f) => ({ value: f.id, label: f.name })),
            ]}
            aria-label="Папка нового документа"
            className="w-56"
          />
        )}
        <Button
          type="submit"
          variant="primary"
          icon={<Plus size={16} />}
          disabled={create.isPending || !title.trim()}
        >
          Создать
        </Button>
      </div>

      {/* Размер выбирается до создания, а не после: поменять его у документа,
          на котором уже расставлен текст, значит сдвинуть весь макет. */}
      {!chosen && <PageSizePicker value={size} onChange={setSize} />}

      {create.isError && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {errorText(create.error)}
        </p>
      )}
    </form>
  );
}

/** Плитка основы: лист сверху, подпись снизу, выбранная — в рамке акцента. */
function BasisTile({
  selected,
  onSelect,
  label,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'relative overflow-hidden rounded-xl text-left ring-1 transition-shadow',
        selected
          ? 'ring-2 ring-[var(--accent)]'
          : 'ring-[var(--line)] hover:ring-[var(--line-strong)]',
      )}
    >
      <div className="aspect-[4/3] overflow-hidden border-b border-[var(--line)] bg-[var(--surface-sunken)]">
        {children}
      </div>
      <p className="truncate px-2 py-1.5 text-sm">{label}</p>
      {selected && (
        <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
