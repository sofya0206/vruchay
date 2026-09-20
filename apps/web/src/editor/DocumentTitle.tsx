import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '../api/client';
import type { DocumentDetail } from '../api/types';
import { cn } from '../ui/cn';
import { useTooltip } from '../ui/Tooltip';

/** По нему пункт «Переименовать» из меню «…» ставит курсор в название. */
export const DOCUMENT_TITLE_ID = 'document-title';

/** Предел схемы на сервере: длиннее он не примет. */
const MAX_TITLE = 200;

/**
 * Название материала в шапке — его и правят на месте, как в Google Docs.
 *
 * Раньше это был просто текст: переименовать открытый материал можно было
 * только окном из меню, а в списке — системным `window.prompt`. Название
 * у всех на виду, и первое, что с ним пытаются сделать, — щёлкнуть по нему.
 *
 * Сохраняется по Enter и при уходе из поля, Esc возвращает прежнее.
 * Пустое название не отправляем: сервер его не примет, а пустая шапка
 * читается как потерянный материал — возвращаем то, что было.
 */
export function DocumentTitle({ documentId, title }: { documentId: string; title: string }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(title);
  const [editing, setEditing] = useState(false);

  const rename = useMutation({
    mutationFn: (value: string) =>
      api.patch<DocumentDetail>(`/documents/${documentId}`, { title: value }),
    onSuccess: (saved, value) => {
      // Шапка, вкладка браузера и соседние стороны материала читают один
      // запрос: кладём название в него сразу, не дожидаясь перечитывания.
      qc.setQueryData<DocumentDetail>(['document', documentId], (doc) =>
        doc ? { ...doc, title: saved?.title ?? value } : doc,
      );
      void qc.invalidateQueries({ queryKey: ['document', documentId] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  /*
   * Название сменили не здесь — в другой вкладке или после перечитывания.
   *
   * Следим за самим названием, а не за концом правки: иначе уход из поля
   * тут же возвращал бы старое имя — при отказе сервера набранное молча
   * пропадало, а при успехе старое название мелькало до ответа. Пока
   * человек печатает, его текст не перебиваем.
   */
  const [seen, setSeen] = useState(title);
  if (title !== seen) {
    setSeen(title);
    if (!editing) setDraft(title);
  }

  function commit() {
    const value = draft.trim();
    if (!value) {
      setDraft(title);
      return;
    }
    if (value !== draft) setDraft(value);
    if (value === title) return;
    rename.mutate(value);
  }

  const failed = rename.isError && draft.trim() !== title;
  const failure = failed ? `Не сохранилось: ${errorText(rename.error)}` : undefined;

  // Полное название — когда оно не влезло в шапку; причина — когда
  // не сохранилось. Пока человек печатает, плашка над полем только мешает.
  const tip = useTooltip(editing ? undefined : (failure ?? title), {
    onlyWhenTruncated: !failed,
    describes: failed,
    placement: 'bottom',
  });

  return (
    <span className="inline-grid min-w-0">
      {/* Невидимый двойник задаёт ширину: поле растёт по тексту, а не
          стоит пустой плашкой на всю ширину шапки. */}
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1 overflow-hidden px-1.5 whitespace-pre"
      >
        {draft || ' '}
      </span>
      <input
        ref={input}
        id={DOCUMENT_TITLE_ID}
        value={draft}
        // Без этого поле держит свою ширину по умолчанию, около двадцати
        // знаков, и короткое название стоит в широкой пустой плашке.
        size={1}
        maxLength={MAX_TITLE}
        aria-label="Название документа"
        aria-invalid={failed || undefined}
        spellCheck={false}
        {...tip.triggerProps}
        onChange={(e) => {
          setDraft(e.target.value);
          if (rename.isError) rename.reset();
        }}
        onFocus={(e) => {
          setEditing(true);
          e.currentTarget.select();
          tip.triggerProps.onBlur();
        }}
        onBlur={() => {
          setEditing(false);
          commit();
          tip.triggerProps.onBlur();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            input.current?.blur();
          } else if (e.key === 'Escape') {
            // Esc здесь — «передумал», а не «закрой что-нибудь ещё».
            e.stopPropagation();
            setDraft(title);
            rename.reset();
            // Отложено: blur прочитал бы черновик до того, как он вернулся.
            requestAnimationFrame(() => input.current?.blur());
          }
        }}
        className={cn(
          'col-start-1 row-start-1 h-7 w-full min-w-0 truncate rounded-control bg-transparent px-1.5',
          'text-sm font-medium text-ink outline-none transition-shadow',
          'hover:ring-1 hover:ring-line focus:ring-2 focus:ring-focus',
          failed && 'ring-1 ring-danger hover:ring-danger focus:ring-danger',
        )}
      />
      {failed && (
        <span role="alert" className="sr-only">
          {failure}
        </span>
      )}
      {tip.tooltip}
    </span>
  );
}
