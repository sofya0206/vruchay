import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, Plus } from 'lucide-react';
import { api, errorText } from '../api/client';
import type { DocumentDetail, DocumentList, DocumentSummary } from '../api/types';
import { useFolders } from '../api/folders';
import { protocolTitle } from '../overview/format';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ErrorBar } from '../ui/ErrorState';
import { Field, Input } from '../ui/Field';
import { OptionCard, OptionGroup } from '../ui/OptionCard';
import { Select } from '../ui/Select';
import { DocumentPreview } from './DocumentCard';
import { PageSizePicker, type PageSizeValue } from './PageSizePicker';

/** Список шаблонов организации — общий ключ для окна и раздела «Шаблоны». */
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
 * Название подставлено сразу — мероприятий за сезон десятки, и «Мероприятие
 * от 20.09.2026» отличит вчерашнее от прошлогоднего; переименовать можно
 * в шапке документа. Созданный документ сразу открывается.
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
  // Кнопка «Создать» стоит в подвале окна, вне формы, — связаны атрибутом.
  const formId = useId();

  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId);
  const [title, setTitle] = useState(() => protocolTitle());
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
    <Dialog
      title="Новый документ"
      description="Сначала основа, потом название"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            icon={<Plus size={16} />}
            loading={create.isPending}
            disabled={!title.trim()}
          >
            Создать
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-5">
        <OptionGroup
          label="Основа документа"
          className="[grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))]"
        >
          <OptionCard
            icon={FilePlus2}
            title="Чистый лист"
            description="Свой бланк и размер"
            selected={!chosen}
            onSelect={() => setTemplateId(null)}
          />
          {list.map((t) => (
            <TemplateTile
              key={t.id}
              doc={t}
              selected={chosen?.id === t.id}
              onSelect={() => setTemplateId(t.id)}
            />
          ))}
        </OptionGroup>

        {/* Размер выбирается до создания, а не после: поменять его у документа,
            на котором уже расставлен текст, значит сдвинуть весь макет. */}
        {!chosen && <PageSizePicker value={size} onChange={setSize} />}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <Field label="Название">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например, «Сертификат участника семинара»"
              maxLength={200}
            />
          </Field>
          {/* Внутри папки она и подставлена: человек нажал «Создать», стоя
              в своей папке, — документ ждут там же. Пока папок нет, выбирать
              не из чего — тогда поля нет вовсе. */}
          {(folders.data ?? []).length > 0 && (
            <Field label="Папка">
              <Select
                value={folderId}
                onChange={setFolderId}
                options={[
                  { value: '', label: 'Вне папок' },
                  ...(folders.data ?? []).map((f) => ({ value: f.id, label: f.name })),
                ]}
                aria-label="Папка нового документа"
              />
            </Field>
          )}
        </div>

        {create.isError && <ErrorBar>{errorText(create.error)}</ErrorBar>}
      </form>
    </Dialog>
  );
}

/**
 * Шаблон — плиткой с самим листом, сверху вниз: лист, под ним подпись.
 *
 * У `OptionCard` нет места под миниатюру, поэтому лист стоит в `title`
 * вместе с подписью, а внутренние поля карточки сняты. Имя для читалки —
 * отдельно: текст ужатого листа («%name») в него попадать не должен.
 */
function TemplateTile({
  doc,
  selected,
  onSelect,
}: {
  doc: DocumentSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <OptionCard
      selected={selected}
      onSelect={onSelect}
      aria-label={doc.title}
      className="gap-0 overflow-hidden p-0"
      title={
        <>
          <span className="block aspect-[4/3] overflow-hidden border-b border-line bg-sunken">
            <DocumentPreview doc={doc} />
          </span>
          <span className="block truncate px-3 py-2">{doc.title}</span>
        </>
      }
    />
  );
}
