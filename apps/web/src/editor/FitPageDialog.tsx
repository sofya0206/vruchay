import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

/**
 * Бланк не тех пропорций, что лист.
 *
 * Спрашиваем сразу после загрузки. Молча растянуть нельзя: перекошенная
 * грамота выпускается ровно так же успешно, как правильная, и брак
 * обнаруживает получатель — когда переделывать поздно.
 *
 * Показываем оба прямоугольника рядом. Словами «пропорции не совпадают»
 * объяснить это трудно, а глазами видно сразу.
 */
export function FitPageDialog({
  current,
  suggested,
  onFit,
  onKeep,
}: {
  current: { widthMm: number; heightMm: number };
  suggested: { widthMm: number; heightMm: number };
  onFit: () => void;
  onKeep: () => void;
}) {
  return (
    <Dialog
      title="Бланк другого размера"
      description="Пропорции картинки не совпадают с листом: если оставить как есть, бланк растянется и герб с рамкой перекосятся."
      size="sm"
      onClose={onKeep}
      footer={
        <>
          <Button variant="ghost" onClick={onKeep}>
            Оставить как есть
          </Button>
          <Button variant="primary" onClick={onFit}>
            Подогнать лист: {suggested.widthMm}×{suggested.heightMm} мм
          </Button>
        </>
      }
    >
      <div className="flex items-end justify-center gap-6 rounded-card bg-sunken px-4 py-5">
        <Shape {...current} caption="Лист сейчас" />
        <Shape {...suggested} caption="Бланк" accent />
      </div>
      <p className="mt-4 text-sm text-muted">
        Подогнанный лист примет бланк без искажений, но уже расставленный текст сдвинется — проверьте макет.
        Если оставить {current.widthMm}×{current.heightMm} мм, бланк растянется.
      </p>
    </Dialog>
  );
}

/** Прямоугольник в пропорциях листа: сравнение глазами, а не по числам. */
function Shape({
  widthMm,
  heightMm,
  caption,
  accent = false,
}: {
  widthMm: number;
  heightMm: number;
  caption: string;
  accent?: boolean;
}) {
  // Вписываем в квадрат 88×88 — так оба прямоугольника сравнимы между собой.
  const scale = 88 / Math.max(widthMm, heightMm);

  return (
    <div className="text-center">
      <div
        style={{ width: widthMm * scale, height: heightMm * scale }}
        className={`mx-auto rounded ${accent ? 'bg-accent/20 ring-1 ring-accent' : 'bg-surface ring-1 ring-line-strong'}`}
      />
      <p className="mt-2 text-xs text-muted">{caption}</p>
      <p className="tabular text-xs text-muted">
        {widthMm}×{heightMm}
      </p>
    </div>
  );
}
