import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  FileText,
  Folder,
  FolderMinus,
  MoreVertical,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { daysLeftInTrash, TRASH_DAYS } from '@gramota/shared';
import type { DocumentSummary } from '../api/types';
import { useFolders } from '../api/folders';
import { formatWhen } from '../overview/format';
import { SheetRenderer } from '../render/SheetRenderer';
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
 *
 * Подпись под листом — название и когда правили, по центру и в две строки.
 * Раздел и размер листа отсюда убраны: размер виден по самой миниатюре,
 * а третья строка мелкого текста под каждой карточкой превращала ровную
 * сетку в кашу из подписей.
 */
export function DocumentCard({
  doc,
  onRename,
  onMove,
  onDuplicate,
  onDelete,
  onRestore,
  onPurge,
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
    <li className="group relative overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-[var(--line)] transition-shadow hover:shadow-md">
      <Link to={`/documents/${doc.id}`} className="block">
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
            <Preview doc={doc} />
          )}
          {/* Слева внизу: справа вверху стоит меню действий. */}
          {(doc.sheetCount ?? 1) > 1 && (
            <span className="absolute bottom-2 left-2 rounded-md bg-[var(--surface)]/90 px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
              {doc.sheetCount} листа
            </span>
          )}
        </div>
        <div className="px-3 py-3 text-center">
          <h3 className="truncate font-sans text-base font-medium">{doc.title}</h3>
          <p className="tabular mt-0.5 text-sm text-[var(--text-muted)]">
            {formatWhen(doc.updatedAt)}
          </p>
        </div>
      </Link>

      {/* Связь с исходным бланком — вне ссылки на сам материал: это отдельный
          переход, и вложенные ссылки браузер всё равно не разрешает. */}
      {doc.source && (
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
 *
 * Миниатюра приглушена, чтобы корзину нельзя было спутать со списком:
 * оба экрана — сетка одинаковых карточек, и заголовка мало.
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

  return (
    <li className="overflow-hidden rounded-xl bg-[var(--surface)] ring-1 ring-[var(--line)]">
      <div className="relative aspect-[4/3] overflow-hidden border-b border-[var(--line)] bg-[var(--surface-sunken)] opacity-45">
        {empty ? (
          <div className="grid h-full place-items-center">
            <FileText size={26} className="text-[var(--line-strong)]" strokeWidth={1.5} />
          </div>
        ) : (
          <Preview doc={doc} />
        )}
      </div>

      <div className="px-3 py-3 text-center">
        <h3 className="truncate font-sans text-base font-medium">{doc.title}</h3>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          {left === 0 ? 'Будет стёрт сегодня ночью' : `Будет стёрт через ${left} ${dayWord(left)}`}
        </p>

        <div className="mt-3 flex justify-center gap-2">
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ring-1 ring-[var(--line-strong)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <RotateCcw size={14} /> Восстановить
          </button>
          <button
            type="button"
            /* Спрашиваем подтверждение: отменить это нечем, а кнопка стоит
               рядом с безобидным «Восстановить». */
            onClick={() => {
              if (
                window.confirm(
                  `Удалить «${doc.title}» насовсем? Вместе с ним будут стёрты выпущенные ` +
                    `документы и перестанут работать ссылки проверки. Отменить нельзя.`,
                )
              ) {
                onPurge();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)]"
          >
            <Trash2 size={14} /> Стереть
          </button>
        </div>
      </div>
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
function Preview({ doc }: { doc: DocumentSummary }) {
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

/** Меню действий — то же, что человек привык видеть в проводнике и на диске. */
function ActionsMenu({
  title,
  folderId,
  onRename,
  onMove,
  onDuplicate,
  onDelete,
}: {
  title: string;
  folderId: string | null;
  onRename: () => void;
  onMove: (folderId: string | null) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const folders = useFolders();
  const [open, setOpen] = useState(false);
  /* Список папок открывается вместо меню, а не рядом с ним: папок шесть,
     и вложенное меню сбоку на карточке шириной в лист попросту не помещается
     на экран. */
  const [moving, setMoving] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  // Закрытое меню всегда открывается со своего начала, а не со списка папок.
  useEffect(() => {
    if (!open) setMoving(false);
  }, [open]);

  const item =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-sunken)] [&>svg]:shrink-0';

  return (
    <div ref={wrap} className="absolute top-2 right-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Действия с документом «${title}»`}
        aria-expanded={open}
        /* На мыши кнопка проступает при наведении, чтобы не спорить с самим
           листом; на телефоне наведения нет — там она видна всегда, иначе
           до действий не добраться вовсе. Открытое меню держит кнопку
           видимой: иначе уведённая мышь прячет кнопку из-под своего же меню. */
        className={
          'grid h-8 w-8 place-items-center rounded-lg bg-[var(--surface)]/90 text-[var(--text-muted)] ' +
          'ring-1 ring-[var(--line)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)] ' +
          (open ? '' : 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100')
        }
      >
        <MoreVertical size={16} />
      </button>

      {open && moving && (
        <div
          role="menu"
          className="absolute top-9 right-0 z-10 w-64 overflow-hidden rounded-xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-[var(--line)]"
        >
          <button
            type="button"
            role="menuitem"
            className={`${item} text-[var(--text-muted)]`}
            onClick={() => setMoving(false)}
          >
            <ChevronLeft size={14} /> Назад
          </button>
          <div className="my-1 border-t border-[var(--line)]" />
          {(folders.data ?? []).map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                setOpen(false);
                onMove(f.id);
              }}
            >
              <Folder size={14} />
              <span className="flex-1 truncate">{f.name}</span>
              {folderId === f.id && <Check size={14} className="text-[var(--accent)]" />}
            </button>
          ))}
          {/* Папок нет — говорим об этом прямо: пустое меню читается
              как сломанное. */}
          {(folders.data ?? []).length === 0 && (
            <p className="px-3 py-2 text-sm text-[var(--text-muted)]">
              Папок пока нет — заведите слева в колонке
            </p>
          )}
          <div className="my-1 border-t border-[var(--line)]" />
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onMove(null);
            }}
          >
            <FolderMinus size={14} />
            <span className="flex-1">Вне папок</span>
            {folderId === null && <Check size={14} className="text-[var(--accent)]" />}
          </button>
        </div>
      )}

      {open && !moving && (
        <div
          role="menu"
          className="absolute top-9 right-0 z-10 w-64 overflow-hidden rounded-xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-[var(--line)]"
        >
          {/*
            Первым пунктом, и глаголом.
            Ради этого действия меню и открывают чаще всего: бланк у федерации
            один на сезон, а соревнований за сезон десятки. «Копия под новое
            мероприятие» стояло вторым и читалось как название чего-то, а не
            как предложение сделать, — на приёмке его просто не нашли.
            Название по-прежнему говорит, что именно получится: макет тот же,
            а список получателей и сведения о мероприятии — чистые.
            «Сделать копию» обещало бы копию целиком.
          */}
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onDuplicate();
            }}
          >
            <CalendarPlus size={14} /> Скопировать под новое мероприятие
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onRename();
            }}
          >
            <Pencil size={14} /> Переименовать
          </button>
          {/* Папка материала — здесь же, где переименование: и то и другое
              про то, где его потом искать. Открывает список папок вместо
              меню, поэтому окно не закрываем. */}
          <button type="button" role="menuitem" className={item} onClick={() => setMoving(true)}>
            <Folder size={14} />
            <span className="flex-1">Переложить в папку</span>
            <ChevronRight size={14} className="text-[var(--text-muted)]" />
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${item} text-[var(--danger)]`}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <Trash2 size={14} /> В корзину
          </button>
        </div>
      )}
    </div>
  );
}
