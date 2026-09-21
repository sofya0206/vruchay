import { useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, Plus } from 'lucide-react';
import { api, errorText } from '../api/client';
import type { DocumentDetail, DocumentList, DocumentSummary } from '../api/types';
import { useFolders } from '../api/folders';
import { fitPageToImage, readImageSize } from '../editor/fit-page';
import { backgroundDpi, POOR_DPI, PRINT_DPI } from '../editor/page-fit';
import { protocolTitle } from '../overview/format';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ErrorBar } from '../ui/ErrorState';
import { Field, Input } from '../ui/Field';
import { OptionCard, OptionGroup } from '../ui/OptionCard';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toast';
import { BlankTile } from './BlankTile';
import { DocumentPreview } from './DocumentCard';
import { stepsSentence } from './material-steps';
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
 * выбирается размер и бланк: макет шаблона свёрстан под свой лист и уже
 * несёт свой бланк, если он был.
 *
 * Про бланк спрашиваем ровно один раз, здесь: раньше тот же вопрос
 * повторялся ещё раз на холсте, только другими словами («Свой бланк» /
 * «С нуля» поверх пустого листа) — теперь EditorPage эту плитку для
 * только что созданного документа не показывает (см. `skipStartPicker`
 * в `navigate` ниже), а для листа, добавленного позже кнопкой «+ Лист»
 * к уже существующему документу, показывает по-прежнему: там это
 * решение действительно не принято.
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
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundNote, setBackgroundNote] = useState<string | null>(null);
  const backgroundInput = useRef<HTMLInputElement>(null);

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
  });

  const uploadBackground = useMutation({
    mutationFn: (v: { documentId: string; sheetId: string; file: File }) =>
      api.upload<{ fileId: string; url: string }>(
        `/documents/${v.documentId}/sheets/${v.sheetId}/background`,
        v.file,
      ),
  });

  /**
   * Файл брошен на плитку или выбран через диалог — считаем то же самое,
   * что EditorPage считает при загрузке бланка на уже открытый холст.
   */
  async function onBackgroundFile(file: File) {
    setBackgroundFile(file);
    setBackgroundNote(null);
    const imgSize = await readImageSize(file).catch(() => null);
    if (!imgSize) return;
    const fit = fitPageToImage(size, imgSize);
    // Несовпадение пропорций тут же и правим — блоков на листе ещё нет
    // и двигать нечего, поэтому отдельным окном спрашивать незачем
    // (в отличие от замены бланка у уже нарисованного листа в EditorPage).
    if (fit.mismatched) setSize(fit.suggested);
    const dpi = backgroundDpi(imgSize, { w: size.widthMm, h: size.heightMm });
    setBackgroundNote(
      dpi < POOR_DPI
        ? `Бланк ${dpi} dpi — для печати мало, будет мыло. Нужно ${PRINT_DPI}.`
        : dpi < PRINT_DPI
          ? `Бланк ${dpi} dpi — для экрана хватит, для типографии нужно ${PRINT_DPI}.`
          : null,
    );
  }

  /*
   * Создание и загрузка бланка — по порядку, а не одним запросом: эндпоинт
   * бланка требует уже существующих id документа и листа, иначе ему
   * некуда сохранять. Если бланк не загрузился, документ всё равно
   * остаётся созданным и открывается — то же самое можно загрузить потом
   * той же кнопкой в редакторе, откатывать создание документа не за что.
   */
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    let created: DocumentDetail;
    try {
      created = await create.mutateAsync();
    } catch {
      return; // create.isError уже развернул ErrorBar ниже, дальше не идём
    }

    if (backgroundFile) {
      try {
        await uploadBackground.mutateAsync({
          documentId: created.id,
          sheetId: created.sheets[0].id,
          file: backgroundFile,
        });
      } catch (err) {
        toast({
          title: 'Бланк не загрузился',
          description: `${errorText(err)} Документ создан — загрузите бланк из редактора, там та же кнопка.`,
          tone: 'danger',
        });
      }
    }

    void qc.invalidateQueries({ queryKey: ['documents'] });
    // Вопрос «с чего начать лист» на холсте больше не задаём: он уже
    // решён здесь — либо бланком, либо явным «начну с пустого».
    navigate(`/documents/${created.id}`, { state: { skipStartPicker: true } });
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
            loading={create.isPending || uploadBackground.isPending}
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
              onSelect={() => {
                setTemplateId(t.id);
                // Бланк выбирали для чистого листа — у шаблона уже есть свой.
                setBackgroundFile(null);
                setBackgroundNote(null);
              }}
            />
          ))}
        </OptionGroup>

        {/* Размер и бланк — до создания, а не после: поменять их у документа,
            на котором уже расставлен текст, значит сдвинуть весь макет.
            Оба вопроса здесь и только здесь. */}
        {!chosen && (
          <>
            <PageSizePicker value={size} onChange={setSize} />

            <OptionGroup label="Бланк" columns={2}>
              <BlankTile
                disabled={uploadBackground.isPending}
                selected={!!backgroundFile}
                onPick={() => backgroundInput.current?.click()}
                onFile={(file) => void onBackgroundFile(file)}
              />
              <OptionCard
                icon={FilePlus2}
                title="Начну с пустого"
                description="Бланк добавите потом, из редактора"
                selected={!backgroundFile}
                onSelect={() => {
                  setBackgroundFile(null);
                  setBackgroundNote(null);
                }}
              />
            </OptionGroup>
            {backgroundFile && (
              <p className="text-sm text-muted">
                {backgroundFile.name}
                {backgroundNote ? ` — ${backgroundNote}` : ''}
              </p>
            )}
            <input
              ref={backgroundInput}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onBackgroundFile(file);
                e.target.value = '';
              }}
            />
          </>
        )}

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

        <p className="text-xs text-muted">Дальше по шагам: {stepsSentence()}.</p>
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
