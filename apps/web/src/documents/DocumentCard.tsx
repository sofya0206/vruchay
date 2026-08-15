import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, FileText, MoreVertical, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { daysLeftInTrash, TRASH_DAYS } from '@gramota/shared';
import type { DocumentSummary } from '../api/types';
import { SheetRenderer } from '../render/SheetRenderer';

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
  onDuplicate,
  onDelete,
  onRestore,
  onPurge,
}: {
  doc: DocumentSummary;
  onRename: (doc: DocumentSummary) => void;
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
    <li className="group relative overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--line)] transition-shadow hover:shadow-md">
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
            <Thumbnail doc={doc} />
          )}
          {(doc.sheetCount ?? 1) > 1 && (
            <span className="absolute right-2 top-2 rounded-md bg-[var(--surface)]/90 px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
              {doc.sheetCount} листа
            </span>
          )}
        </div>
        <div className="p-4 pr-12">
          <h2 className="truncate font-sans text-base font-medium">{doc.title}</h2>
          <p className="tabular mt-1 text-sm text-[var(--text-muted)]">
            {Math.round(doc.pageWidthMm)}×{Math.round(doc.pageHeightMm)} мм ·{' '}
            {new Date(doc.updatedAt).toLocaleDateString('ru-RU')}
          </p>
        </div>
      </Link>

      <ActionsMenu
        title={doc.title}
        onRename={() => onRename(doc)}
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
    <li className="overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--line)]">
      <div className="relative aspect-[4/3] overflow-hidden border-b border-[var(--line)] bg-[var(--surface-sunken)] opacity-45">
        {empty ? (
          <div className="grid h-full place-items-center">
            <FileText size={26} className="text-[var(--line-strong)]" strokeWidth={1.5} />
          </div>
        ) : (
          <Thumbnail doc={doc} />
        )}
      </div>

      <div className="p-4">
        <h2 className="truncate font-sans text-base font-medium">{doc.title}</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {left === 0 ? 'Будет стёрт сегодня ночью' : `Будет стёрт через ${left} ${dayWord(left)}`}
        </p>

        <div className="mt-3 flex gap-2">
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

/**
 * Лист в натуральную величину, ужатый до ширины карточки.
 *
 * Масштабируем через transform, а не пересчётом размеров: макет задан
 * в миллиметрах, и любой пересчёт «на глаз» разошёлся бы с тем, что
 * человек видит в редакторе и получает в PDF.
 */
function Thumbnail({ doc }: { doc: DocumentSummary }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;

    // Размер листа в пикселях при текущем масштабе экрана: меряем реальным
    // элементом, потому что соотношение миллиметра к пикселю зависит
    // от устройства, а не от нашего представления о нём.
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;width:${doc.pageWidthMm}mm;height:${doc.pageHeightMm}mm`;
    el.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || rect.width <= 0) return;
      // Вписываем целиком, по меньшей из сторон: иначе альбомный лист
      // вылезал бы за рамку по горизонтали, а книжный — по вертикали,
      // и в обоих случаях обрезался бы край макета.
      setScale(Math.min(width / rect.width, height / rect.height));
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc.pageWidthMm, doc.pageHeightMm]);

  return (
    // Отступ на внешнем слое, измеряем внутренний: иначе поля вошли бы
    // в измеренный прямоугольник, и лист вылез бы ровно на их величину.
    <div className="h-full w-full p-3">
      <div ref={box} className="grid h-full w-full place-items-center">
      {scale > 0 && (
        <div
          className="overflow-hidden bg-white shadow-sm"
          style={{ width: `${doc.pageWidthMm * scale}mm`, height: `${doc.pageHeightMm * scale}mm` }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <SheetRenderer
              layout={doc.preview?.layout ?? []}
              pageWidthMm={doc.pageWidthMm}
              pageHeightMm={doc.pageHeightMm}
              backgroundUrl={doc.preview?.backgroundUrl}
              // Показываем «%name», а не пустоту: в списке нет получателя,
              // и подставлять нечего — пустые места читались бы как ошибка макета.
              showRawVariables
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/** Меню действий — то же, что человек привык видеть в проводнике и на диске. */
function ActionsMenu({
  title,
  onRename,
  onDuplicate,
  onDelete,
}: {
  title: string;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
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

  const item =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-sunken)]';

  return (
    <div ref={wrap} className="absolute bottom-3 right-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Действия с документом «${title}»`}
        aria-expanded={open}
        className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-9 right-0 z-10 w-48 overflow-hidden rounded-xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-[var(--line)]"
        >
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onRename(); }}>
            <Pencil size={14} /> Переименовать
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onDuplicate(); }}>
            <Copy size={14} /> Сделать копию
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${item} text-[var(--danger)]`}
            onClick={() => { setOpen(false); onDelete(); }}
          >
            <Trash2 size={14} /> В корзину
          </button>
        </div>
      )}
    </div>
  );
}
