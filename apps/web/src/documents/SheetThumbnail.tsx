import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Лист в натуральную величину, ужатый до размеров рамки.
 *
 * Масштабируем через transform, а не пересчётом размеров: макет задан
 * в миллиметрах, и любой пересчёт «на глаз» разошёлся бы с тем, что
 * человек видит в редакторе и получает в PDF.
 *
 * Один компонент на карточку материала и на карточку заготовки: обе
 * показывают тот же лист тем же рендером, и расхождение между ними
 * читалось бы как разница в самих документах.
 */
export function SheetThumbnail({
  widthMm,
  heightMm,
  children,
}: {
  widthMm: number;
  heightMm: number;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;

    // Размер листа в пикселях при текущем масштабе экрана: меряем реальным
    // элементом, потому что соотношение миллиметра к пикселю зависит
    // от устройства, а не от нашего представления о нём.
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;width:${widthMm}mm;height:${heightMm}mm`;
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
  }, [widthMm, heightMm]);

  return (
    // Отступ на внешнем слое, измеряем внутренний: иначе поля вошли бы
    // в измеренный прямоугольник, и лист вылез бы ровно на их величину.
    <div className="h-full w-full p-3">
      <div ref={box} className="grid h-full w-full place-items-center">
        {scale > 0 && (
          <div
            className="overflow-hidden bg-[var(--sheet-paper)] shadow-sm"
            style={{ width: `${widthMm * scale}mm`, height: `${heightMm * scale}mm` }}
          >
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              {children}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
