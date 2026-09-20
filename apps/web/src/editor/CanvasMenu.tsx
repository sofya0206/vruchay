import { Circle, ClipboardPaste, ImagePlus, Link2, Minus, QrCode, Square, Type } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MenuDivider, MenuItem } from '../ui/Menu';
import type { InsertKind } from './InsertMenu';

/**
 * Меню по правому клику на пустом месте листа.
 *
 * Как в Figma, Canva и Zero-блоке Тильды: блок появляется там, куда
 * кликнули, а не в центре листа. Позиция — в координатах окна, меню
 * прижимается к краю, если не влезает.
 */
export function CanvasMenu({
  at,
  canPaste,
  onInsert,
  onImage,
  onPaste,
  onClose,
}: {
  at: { x: number; y: number };
  canPaste: boolean;
  onInsert: (what: InsertKind) => void;
  onImage: () => void;
  onPaste: () => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      x: Math.min(at.x, window.innerWidth - width - 8),
      y: Math.min(at.y, window.innerHeight - height - 8),
    });
  }, [at]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const pick = (what: InsertKind) => {
    onClose();
    onInsert(what);
  };

  return (
    <div
      ref={root}
      role="menu"
      className="fixed z-40 min-w-56 rounded-card bg-raised p-1.5 shadow-lg ring-1 ring-line"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem icon={<Type size={16} />} onClick={() => pick({ type: 'text' })}>
        Текст
      </MenuItem>
      <MenuItem
        icon={<ImagePlus size={16} />}
        onClick={() => {
          onClose();
          onImage();
        }}
      >
        Картинка
      </MenuItem>
      <MenuItem icon={<QrCode size={16} />} onClick={() => pick({ type: 'qr' })}>
        QR-код
      </MenuItem>
      <MenuItem icon={<Link2 size={16} />} onClick={() => pick({ type: 'link' })}>
        Ссылка
      </MenuItem>
      <MenuDivider />
      <MenuItem icon={<Minus size={16} />} onClick={() => pick({ type: 'shape', kind: 'line' })}>
        Линия
      </MenuItem>
      <MenuItem icon={<Square size={16} />} onClick={() => pick({ type: 'shape', kind: 'rect' })}>
        Прямоугольник
      </MenuItem>
      <MenuItem icon={<Circle size={16} />} onClick={() => pick({ type: 'shape', kind: 'ellipse' })}>
        Овал
      </MenuItem>
      {canPaste && (
        <>
          <MenuDivider />
          <MenuItem
            icon={<ClipboardPaste size={16} />}
            onClick={() => {
              onClose();
              onPaste();
            }}
          >
            Вставить из буфера
          </MenuItem>
        </>
      )}
    </div>
  );
}
