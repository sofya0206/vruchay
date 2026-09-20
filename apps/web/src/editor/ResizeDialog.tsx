import { useState } from 'react';
import { Maximize2, Move, Square, type LucideIcon } from 'lucide-react';
import { describeSize } from '@gramota/shared';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { OptionCard, OptionGroup } from '../ui/OptionCard';
import type { ResizeMode } from './page-fit';

const OPTIONS: { id: ResizeMode; icon: LucideIcon; title: string; hint: string }[] = [
  {
    id: 'scale',
    icon: Maximize2,
    title: 'Пропорционально — всё вместе',
    hint: 'Положения, размеры и кегли изменятся в одной пропорции. Композиция останется той же.',
  },
  {
    id: 'reposition',
    icon: Move,
    title: 'Сохранить кегли, пересчитать только положения',
    hint: 'Шрифт и размеры блоков останутся, блоки встанут на те же доли нового листа.',
  },
  {
    id: 'keep',
    icon: Square,
    title: 'Ничего не трогать',
    hint: 'Блоки останутся на своих миллиметрах; те, что вылезли за лист, будут отмечены.',
  },
];

/**
 * Смена размера листа — с вопросом, что делать с уже расставленными блоками.
 *
 * Молча оставить как есть нельзя: макет под A4 на A5 вылезает за края,
 * и заметно это будет на печати. Молча масштабировать тоже нельзя:
 * кегль на бланке подобран сознательно. Поэтому три варианта, каждый
 * объяснён словами и последствием.
 */
export function ResizeDialog({
  from,
  to,
  onApply,
  onCancel,
}: {
  from: { widthMm: number; heightMm: number };
  to: { widthMm: number; heightMm: number };
  onApply: (mode: ResizeMode) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<ResizeMode>('scale');

  return (
    <Dialog
      title="Новый размер листа"
      description={`${describeSize(from)} → ${describeSize(to)}. Что сделать с блоками, которые уже стоят на листе?`}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
          <Button variant="primary" onClick={() => onApply(mode)}>
            Применить
          </Button>
        </>
      }
    >
      <OptionGroup label="Что сделать с блоками" columns={1}>
        {OPTIONS.map((o) => (
          <OptionCard
            key={o.id}
            icon={o.icon}
            title={o.title}
            description={o.hint}
            selected={mode === o.id}
            onSelect={() => setMode(o.id)}
          />
        ))}
      </OptionGroup>
    </Dialog>
  );
}
