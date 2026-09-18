import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Trash2 } from 'lucide-react';
import type { Editor } from '@tiptap/core';
import type { MergeFieldFormat, MergeFieldNode } from '@gramota/shared';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { Input } from '../../ui/Field';
import { Select } from '../../ui/Select';
import { fieldVariants } from '../field-meta';
import type { FieldInfo } from '../fields';
import { FieldContext } from './MergeFieldView';

const WIDTH = 320;
const small = 'mb-1 block text-xs font-medium text-[var(--text-muted)]';
const GAP = 6;
const EDGE = 8;

/**
 * Настройки поля — по клику или правой кнопкой по фишке.
 *
 * Первым — вид записи, если он есть: ФИО в падеже или латиницей, дата
 * словами, место словом. Раньше каждый вид был отдельным полем в панели,
 * и список из двадцати почти одинаковых строк резал глаз; здесь вид
 * выбирают по живому примеру, глядя на тот текст, куда он встанет.
 *
 * Дальше два вопроса без синтаксиса: «если пусто, показать что?» и «в каком
 * регистре?». Условия и фильтры сюда не ставим намеренно: это уже язык,
 * а нетехнический человек не должен уметь сломать шаблон опечаткой.
 */
export function FieldPopover({
  editor,
  pos,
  fields,
  onClose,
}: {
  editor: Editor;
  pos: number;
  fields: FieldInfo[];
  onClose: () => void;
}) {
  const ctx = useContext(FieldContext);
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  const node = editor.state.doc.nodeAt(pos);
  const attrs = node?.type.name === 'mergeField' ? (node.attrs as MergeFieldNode['attrs']) : null;

  /*
   * Под фишкой; не помещается — над ней; не помещается нигде — туда, где
   * места больше, и с прокруткой внутри, а не поверх шапки кабинета.
   * И не за правым краем окна. Меряем после отрисовки: высота зависит
   * от того, есть ли у поля виды записи.
   */
  useLayoutEffect(() => {
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    const rect = dom?.getBoundingClientRect();
    const height = box.current?.scrollHeight ?? 0;
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom - GAP - EDGE;
    const spaceAbove = rect.top - GAP - EDGE;
    const below = height <= spaceBelow || spaceBelow >= spaceAbove;
    const maxHeight = Math.floor(below ? spaceBelow : spaceAbove);
    const top = below ? rect.bottom + GAP : rect.top - GAP - Math.min(height, maxHeight);
    const left = Math.min(Math.max(EDGE, rect.left), window.innerWidth - WIDTH - EDGE);
    setPlace((prev) =>
      prev && prev.left === left && prev.top === top && prev.maxHeight === maxHeight ? prev : { left, top, maxHeight },
    );
  });

  if (!attrs) return null;

  const family = fieldVariants(attrs.source, fields);
  const title = family?.title ?? ctx.labels[attrs.source] ?? attrs.source;

  const update = (patch: Partial<MergeFieldNode['attrs']>) => {
    editor.chain().setNodeSelection(pos).updateAttributes('mergeField', patch).run();
  };

  return createPortal(
    <div
      ref={box}
      /* Метка нужна сторожу в InlineTextEditor: он по ней отличает «человек
         щёлкнул в поповер» от «человек ушёл из блока». Раньше она висела
         на обёртке в дереве React, а поповер уходит порталом в body — и
         closest() до неё не доставал: щелчок в это поле закрывал правку
         блока целиком. */
      data-rich-popover
      role="dialog"
      aria-label={`Настройки поля «${title}»`}
      className="fixed z-50 space-y-3 overflow-y-auto overscroll-contain rounded-xl bg-[var(--surface)] p-3 shadow-lg ring-1 ring-[var(--line)]"
      style={{ width: WIDTH, left: place?.left ?? -9999, top: place?.top ?? 0, maxHeight: place?.maxHeight }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p className="text-sm font-medium">{title}</p>

      {family && (
        <div>
          <p className={small}>Вид</p>
          <div role="radiogroup" aria-label="Вид" className="-mx-1 space-y-0.5">
            {family.variants.map((variant) => {
              const active = variant.field.source === attrs.source;
              const sample = ctx.data[variant.field.source]?.trim();
              return (
                <button
                  key={variant.field.source}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => update({ source: variant.field.source, fieldId: variant.field.fieldId })}
                  className={cn(
                    'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors',
                    active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--row-hover)]',
                  )}
                >
                  <Check
                    size={14}
                    strokeWidth={2.25}
                    className={cn('shrink-0 text-[var(--accent)]', !active && 'invisible')}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">{sample || variant.label}</span>
                  {sample && (
                    <span className="shrink-0 text-xs text-[color-mix(in_srgb,var(--text-muted)_70%,transparent)]">
                      {variant.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Два редких вопроса — в одну строку: окно и так вытягивается
          списком видов, и на небольшом экране упиралось в шапку. */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className={small}>Регистр</p>
          <Select
            value={attrs.format}
            onChange={(format) => update({ format })}
            aria-label="Регистр"
            className="h-8 py-0 text-[13px]"
            options={[
              { value: 'none' as MergeFieldFormat, label: 'как есть' },
              { value: 'upper' as MergeFieldFormat, label: 'ПРОПИСНЫМИ' },
              { value: 'lower' as MergeFieldFormat, label: 'строчными' },
              { value: 'title' as MergeFieldFormat, label: 'Каждое С Заглавной' },
            ]}
          />
        </div>
        <label className="block">
          <span className={small}>Если пусто</span>
          <Input
            key={attrs.source}
            defaultValue={attrs.fallback ?? ''}
            placeholder="ничего"
            maxLength={200}
            className="h-8 py-0 text-[13px]"
            onBlur={(e) => update({ fallback: e.target.value.trim() || null })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </label>
      </div>

      <div className="flex justify-between">
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 size={14} />}
          onClick={() => {
            editor.chain().setNodeSelection(pos).deleteSelection().focus().run();
            onClose();
          }}
        >
          Убрать поле
        </Button>
        <Button size="sm" variant="primary" onClick={onClose}>
          Готово
        </Button>
      </div>
    </div>,
    document.body,
  );
}
