import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import type { Editor } from '@tiptap/core';
import type { MergeFieldFormat, MergeFieldNode } from '@gramota/shared';
import { Button } from '../../ui/Button';
import { Input, Label } from '../../ui/Field';
import { Select } from '../../ui/Select';

/**
 * Настройки поля — по клику на фишку.
 *
 * Два вопроса, оба без синтаксиса: «если пусто, показать что?» и «в каком
 * регистре?». Условия и фильтры сюда не ставим намеренно: это уже язык,
 * а нетехнический человек не должен уметь сломать шаблон опечаткой.
 */
export function FieldPopover({
  editor,
  pos,
  label,
  onClose,
}: {
  editor: Editor;
  pos: number;
  label: string;
  onClose: () => void;
}) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'mergeField') return null;
  const attrs = node.attrs as MergeFieldNode['attrs'];

  const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
  const rect = dom?.getBoundingClientRect();
  if (!rect) return null;

  const update = (patch: Partial<MergeFieldNode['attrs']>) => {
    editor.chain().setNodeSelection(pos).updateAttributes('mergeField', patch).run();
  };

  return createPortal(
    <div
      /* Метка нужна сторожу в InlineTextEditor: он по ней отличает «человек
         щёлкнул в поповер» от «человек ушёл из блока». Раньше она висела
         на обёртке в дереве React, а поповер уходит порталом в body — и
         closest() до неё не доставал: щелчок в это поле закрывал правку
         блока целиком. */
      data-rich-popover
      className="fixed z-50 w-72 space-y-3 rounded-xl bg-[var(--surface)] p-3 shadow-lg ring-1 ring-[var(--line)]"
      style={{ left: Math.max(8, rect.left), top: rect.bottom + 6 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="text-sm font-medium">{label}</p>

      <label className="block">
        <Label>Если пусто, показать</Label>
        <Input
          defaultValue={attrs.fallback ?? ''}
          placeholder="ничего"
          maxLength={200}
          onBlur={(e) => update({ fallback: e.target.value.trim() || null })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </label>

      <div className="block">
        <Label>Регистр</Label>
        <Select
          value={attrs.format}
          onChange={(format) => update({ format })}
          aria-label="Регистр"
          options={[
            { value: 'none' as MergeFieldFormat, label: 'как в таблице' },
            { value: 'upper' as MergeFieldFormat, label: 'ПРОПИСНЫМИ' },
            { value: 'lower' as MergeFieldFormat, label: 'строчными' },
            { value: 'title' as MergeFieldFormat, label: 'Каждое Слово С Заглавной' },
          ]}
        />
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
