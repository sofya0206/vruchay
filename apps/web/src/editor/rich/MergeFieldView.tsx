import { createContext, useContext } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import {
  resolveField,
  SYSTEM_VARIABLE_NAMES,
  type MergeFieldNode,
} from '@gramota/shared';
import { markStyle } from '../../render/RichText';

/**
 * Фишка поля внутри живого редактора.
 *
 * Выглядит так же, как фишка в статичном виде (`RichText`), и по той же
 * причине считает своё состояние той же функцией `resolveField`:
 * что подставилось, пусто ли, есть ли такая колонка. Данные строки
 * приходят через контекст — узел не знает, на каком листе он живёт.
 */

export interface FieldContextValue {
  data: Record<string, string>;
  known: ReadonlySet<string> | null;
  labels: Record<string, string>;
  /** Клик по фишке: открыть её настройки. Позиция — в документе редактора. */
  onOpen: (pos: number) => void;
}

export const FieldContext = createContext<FieldContextValue>({
  data: {},
  known: null,
  labels: {},
  onOpen: () => {},
});

export function MergeFieldView({ node, selected, getPos }: ReactNodeViewProps) {
  const ctx = useContext(FieldContext);
  const attrs = node.attrs as MergeFieldNode['attrs'];
  const field = resolveField(
    { type: 'mergeField', attrs, marks: undefined },
    { data: ctx.data, known: ctx.known, unfilled: 'token' },
  );
  const system = SYSTEM_VARIABLE_NAMES.includes(attrs.source);
  const label = ctx.labels[attrs.source] ?? attrs.source;
  const tone =
    field.state === 'unknown'
      ? 'chip-unknown'
      : field.state === 'empty'
        ? 'chip-empty'
        : system
          ? 'chip-system'
          : 'chip-field';
  const shown = field.state === 'ok' ? field.text : (attrs.fallback ?? label);

  return (
    <NodeViewWrapper
      as="span"
      className={`merge-chip ${tone}`}
      data-field={attrs.source}
      data-state={field.state}
      data-selected={selected ? 'true' : undefined}
      // Марки на узле поля рисует обёртка TipTap; здесь — только свои.
      style={markStyle(undefined)}
      title={
        field.state === 'unknown'
          ? `Колонка «${label}» не найдена — её переименовали или удалили`
          : system
            ? `Подставит сервис: ${label}`
            : `Из таблицы: ${label}`
      }
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        const pos = getPos();
        if (typeof pos === 'number') ctx.onOpen(pos);
      }}
    >
      {shown}
    </NodeViewWrapper>
  );
}
