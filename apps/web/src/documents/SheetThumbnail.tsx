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
  /*
   * Лист рисуется, только когда карточка подъехала к экрану, — и дальше
   * остаётся. В библиотеке полсотни карточек по десятку блоков в каждой:
   * нарисованные разом, они держали экран по полсекунды на телефоне при
   * каждой смене папки. Запас в полэкрана — чтобы при прокрутке лист уже
   * был на месте, а не появлялся на глазах.
   */
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = box.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '50% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

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
        {scale > 0 && near && (
          <div
            // Цвет бумаги — токен без утилиты Tailwind: он нужен только листу.
            className="overflow-hidden shadow-sm"
            style={{
              background: 'var(--sheet-paper)',
              width: `${widthMm * scale}mm`,
              height: `${heightMm * scale}mm`,
            }}
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
