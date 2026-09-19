import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  FileText,
  Folder,
  FolderMinus,
  LayoutTemplate,
  MoreVertical,
  Pencil,
  PencilRuler,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { daysLeftInTrash, TRASH_DAYS } from '@gramota/shared';
import type { DocumentSummary } from '../api/types';
import { useFolders } from '../api/folders';
import { formatWhen } from '../overview/format';
import { SheetRenderer } from '../render/SheetRenderer';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/Dialog';
import { Menu, MenuDivider, MenuItem } from '../ui/Menu';
import { SheetThumbnail } from './SheetThumbnail';

/**
 * Карточка документа в списке.
 *
 * Показывает сам документ, а не значок: список из названий не даёт понять,
 * где какая грамота, и человеку приходится открывать их по очереди.
 *
 * Отрисовываем тем же компонентом, что редактор и печать, — уменьшенным.
 * Картинки-миниатюры не делаем намеренно: их пришлось бы где-то хранить,
 * пересоздавать после каждой правки макета и ловить рассогласование, когда
 * пересоздать не вышло. Браузер рисует лист сам, и он всегда свежий.
 */
export function DocumentCard({
  doc,
  onRename,
  onMove,
  onDuplicate,
  onDelete,
  onRestore,
  onPurge,
  onSaveAsTemplate,
}: {
  doc: DocumentSummary;
  onRename: (doc: DocumentSummary) => void;
  /** Переложить в папку; `null` — вынуть из папок совсем. */
  onMove: (doc: DocumentSummary, folderId: string | null) => void;
  onDuplicate: (doc: DocumentSummary) => void;
  onDelete: (doc: DocumentSummary) => void;
  /** Заданы только в корзине: там карточка ведёт себя иначе. */
  onRestore?: (doc: DocumentSummary) => void;
  onPurge?: (doc: DocumentSummary) => void;
  /** Только у документа: у шаблона вместо него «Изменить шаблон». */
  onSaveAsTemplate?: (doc: DocumentSummary) => void;
}) {
  const layout = doc.preview?.layout ?? [];
  const empty = layout.length === 0 && !doc.preview?.backgroundUrl;
  const trashed = Boolean(doc.deletedAt);

  if (trashed) {
    return (
      <TrashedCard
        doc={doc}
        empty={empty}
        onRestore={() => onRestore?.(doc)}
        onPurge={() => onPurge?.(doc)}
      />
    );
  }

  return (
    <li className="card group relative overflow-hidden transition-shadow hover:shadow-lg">
      {/* Шаблон по нажатию даёт новый документ, а не открывает себя: его
          выбирают, чтобы начать работу, и правка самого шаблона в ответ на
          это читалась как «ничего не произошло». Править — из меню. */}
      <Link
        to={doc.isTemplate ? `/documents?new=1&template=${doc.id}` : `/documents/${doc.id}`}
        className="block"
      >
        {/* Рамка одинаковая у всех карточек, а лист вписывается внутрь.
            Пропорции самого документа задавать рамке нельзя: A5 книжная
            рядом с A4 альбомной рвёт сетку, названия оказываются на разной
            высоте, и список перестаёт читаться как список. */}
        <div className="relative aspect-[4/3] overflow-hidden border-b border-[var(--line)] bg-[var(--surface-sunken)]">
          {empty ? (
            <div className="grid h-full place-items-center">
              <FileText size={26} className="text-[var(--line-strong)]" strokeWidth={1.5} />
            </div>
          ) : (
            <DocumentPreview doc={doc} />
          )}
          {/* Слева внизу: справа вверху стоит меню действий. */}
          {(doc.sheetCount ?? 1) > 1 && (
            <span className="absolute bottom-2 left-2 rounded-lg bg-[var(--surface)]/90 px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
              {doc.sheetCount} листа
            </span>
          )}
        </div>
        <div className="px-3 py-3 text-center">
          <h3 className="truncate text-base font-medium">{doc.title}</h3>
          <p className="tabular mt-0.5 text-sm text-[var(--text-muted)]">
            {formatWhen(doc.updatedAt)}
          </p>
        </div>
      </Link>

      {/* Связь с исходным бланком — вне ссылки на сам материал: это отдельный
          переход, и вложенные ссылки браузер всё равно не разрешает. */}
      {doc.source && !doc.isTemplate && (
        <div className="-mt-1 px-3 pb-3 text-center">
          <Link
            to={`/documents/${doc.source.id}`}
            className="inline-flex max-w-full items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <CornerUpLeft size={13} className="shrink-0" />
            <span className="truncate">на основе «{doc.source.title}»</span>
          </Link>
        </div>
      )}

      <ActionsMenu
        title={doc.title}
        template={doc.isTemplate ? doc.id : null}
        onSaveAsTemplate={onSaveAsTemplate && (() => onSaveAsTemplate(doc))}
        folderId={doc.folderId ?? null}
        onRename={() => onRename(doc)}
        onMove={(to) => onMove(doc, to)}
        onDuplicate={() => onDuplicate(doc)}
        onDelete={() => onDelete(doc)}
      />
    </li>
  );
}

/**
 * Та же карточка в корзине.
 *
 * Открыть удалённый документ нельзя — ссылки нет намеренно: редактировать
 * то, что выброшено, значит потом удивляться, куда делись правки. Сначала
 * восстановить, потом править.
 */
function TrashedCard({
  doc,
  empty,
  onRestore,
  onPurge,
}: {
  doc: DocumentSummary;
  empty: boolean;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const left = doc.deletedAt ? daysLeftInTrash(doc.deletedAt) : TRASH_DAYS;
  const [purging, setPurging] = useState(false);

  return (
    <li className="card overflow-hidden">
      <div className="relative aspect-[4/3] overflow-hidden border-b border-[var(--line)] bg-[var(--surface-sunken)] opacity-45">
        {empty ? (
          <div className="grid h-full place-items-center">
            <FileText size={26} className="text-[var(--line-strong)]" strokeWidth={1.5} />
          </div>
        ) : (
          <DocumentPreview doc={doc} />
        )}
      </div>

      <div className="px-3 py-3 text-center">
        <h3 className="truncate text-base font-medium">{doc.title}</h3>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          {left === 0 ? 'Будет стёрт сегодня ночью' : `Будет стёрт через ${left} ${dayWord(left)}`}
        </p>

        <div className="mt-3 flex justify-center gap-2">
          <Button size="sm" icon={<RotateCcw size={14} />} onClick={onRestore}>
            Восстановить
          </Button>
          {/* Подтверждение: отменить это нечем, а кнопка стоит рядом
              с безобидным «Восстановить». */}
          <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setPurging(true)}>
            Стереть
          </Button>
        </div>
      </div>

      {purging && (
        <ConfirmDialog
          title={`Стереть «${doc.title}» насовсем?`}
          confirmLabel="Стереть"
          danger
          onClose={() => setPurging(false)}
          onConfirm={() => {
            setPurging(false);
            onPurge();
          }}
        >
          Вместе с ним будут стёрты выпущенные документы и перестанут работать ссылки
          проверки. Отменить нельзя.
        </ConfirmDialog>
      )}
    </li>
  );
}

/** «5 дней», «2 дня», «1 день» — иначе подпись читается как машинная. */
function dayWord(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return 'дней';
  const ones = n % 10;
  if (ones === 1) return 'день';
  if (ones >= 2 && ones <= 4) return 'дня';
  return 'дней';
}

/** Первый лист материала, ужатый до рамки карточки. */
export function DocumentPreview({ doc }: { doc: DocumentSummary }) {
  return (
    <SheetThumbnail widthMm={doc.pageWidthMm} heightMm={doc.pageHeightMm}>
      <SheetRenderer
        layout={doc.preview?.layout ?? []}
        pageWidthMm={doc.pageWidthMm}
        pageHeightMm={doc.pageHeightMm}
        backgroundUrl={doc.preview?.backgroundUrl}
        // Показываем «%name», а не пустоту: в списке нет получателя,
        // и подставлять нечего — пустые места читались бы как ошибка макета.
        unfilled="token"
      />
    </SheetThumbnail>
  );
}

/**
 * Меню действий — то же, что человек привык видеть в проводнике и на диске.
 *
 * Список папок открывается вместо меню, а не рядом с ним: папок бывает
 * шесть, и вложенное меню сбоку на карточке шириной в лист не поместится.
 */
function ActionsMenu({
  title,
  template,
  onSaveAsTemplate,
  folderId,
  onRename,
  onMove,
  onDuplicate,
  onDelete,
}: {
  title: string;
  /** Идентификатор, если это шаблон: у него своё меню. */
  template: string | null;
  onSaveAsTemplate?: () => void;
  folderId: string | null;
  onRename: () => void;
  onMove: (folderId: string | null) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const folders = useFolders();
  const navigate = useNavigate();
  const [moving, setMoving] = useState(false);

  return (
    <div className="absolute top-2 right-2">
      <Menu
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={() => {
              if (open) setMoving(false);
              toggle();
            }}
            aria-label={`Действия с документом «${title}»`}
            aria-expanded={open}
            /* На мыши кнопка проступает при наведении, чтобы не спорить с самим
               листом; на телефоне наведения нет — там она видна всегда. */
            className={
              'hairline grid h-9 w-9 place-items-center rounded-lg bg-[var(--surface)]/90 text-[var(--text-muted)] ' +
              'transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)] ' +
              (open ? '' : 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100')
            }
          >
            <MoreVertical size={16} />
          </button>
        )}
      >
        {moving ? (
          <>
            <MenuItem
              icon={<ChevronLeft size={16} />}
              className="text-[var(--text-muted)]"
              onClick={(e) => {
                e.stopPropagation();
                setMoving(false);
              }}
            >
              Назад
            </MenuItem>
            <MenuDivider />
            {(folders.data ?? []).map((f) => (
              <MenuItem key={f.id} icon={<Folder size={16} />} onClick={() => onMove(f.id)}>
                <span className="flex-1 truncate">{f.name}</span>
                {folderId === f.id && <Check size={16} className="text-[var(--accent)]" />}
              </MenuItem>
            ))}
            {(folders.data ?? []).length === 0 && (
              <p className="px-2.5 py-2 text-sm text-[var(--text-muted)]">
                Папок пока нет — заведите слева в колонке
              </p>
            )}
            <MenuDivider />
            <MenuItem icon={<FolderMinus size={16} />} onClick={() => onMove(null)}>
              <span className="flex-1">Вне папок</span>
              {folderId === null && <Check size={16} className="text-[var(--accent)]" />}
            </MenuItem>
          </>
        ) : (
          <>
            {template ? (
              <MenuItem icon={<PencilRuler size={16} />} onClick={() => navigate(`/documents/${template}`)}>
                Изменить шаблон
              </MenuItem>
            ) : (
              <>
                {/* Первым пунктом и глаголом: ради него меню открывают чаще
                    всего — бланк один на сезон, а мероприятий десятки. */}
                <MenuItem icon={<CalendarPlus size={16} />} onClick={onDuplicate}>
                  Скопировать под новое мероприятие
                </MenuItem>
                {onSaveAsTemplate && (
                  <MenuItem icon={<LayoutTemplate size={16} />} onClick={onSaveAsTemplate}>
                    Сохранить как шаблон
                  </MenuItem>
                )}
              </>
            )}
            <MenuItem icon={<Pencil size={16} />} onClick={onRename}>
              Переименовать
            </MenuItem>
            {template && (
              <MenuItem icon={<CalendarPlus size={16} />} onClick={onDuplicate}>
                Копия шаблона
              </MenuItem>
            )}
            {/* Открывает список папок вместо меню, поэтому окно не закрываем:
                это не пункт меню для обработчика закрытия. Шаблоны общие
                на организацию и по папкам не раскладываются. */}
            {!template && <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[15px] transition-colors hover:bg-[var(--surface-sunken)]"
              onClick={() => setMoving(true)}
            >
              <Folder size={16} />
              <span className="flex-1">Переложить в папку</span>
              <ChevronRight size={16} className="text-[var(--text-muted)]" />
            </button>}
            <MenuDivider />
            <MenuItem icon={<Trash2 size={16} />} danger onClick={onDelete}>
              В корзину
            </MenuItem>
          </>
        )}
      </Menu>
    </div>
  );
}
