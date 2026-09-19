import { useEffect, useState } from 'react';
import { FileStack, FolderArchive, X } from 'lucide-react';
import { useDownloadOptions } from '../api/recipients';
import { Input, Label } from '../ui/Field';
import { Button } from '../ui/Button';

/**
 * Как забрать готовый пакет.
 *
 * Раньше кнопка была одна — «Скачать архивом», — и дальше человек оставался
 * один на один с тремястами файлами вида «Иванов.pdf». Двух вещей не хватало
 * обеим сторонам одинаково часто.
 *
 * Первая — имена. Файлы складывают по номеру приказа, по группе, по дате;
 * переименовывать триста штук руками не станет никто, а значит папку просто
 * бросят как есть.
 *
 * Вторая — печать. Триста отдельных файлов невозможно отправить на принтер,
 * не открыв каждый; один файл на триста страниц печатается одним действием.
 *
 * Остальные способы выдачи — письмом, ссылкой, в облако, в DOCX — сюда же
 * и добавятся, но каждый со своими вопросами, и в этой ветке их нет.
 */

/** Готовые шаблоны: выбрать из списка быстрее, чем придумать своё. */
const PRESETS = [
  { template: '%name', title: 'Иванова Мария.pdf' },
  { template: '%number %name', title: '7 Иванова Мария.pdf' },
  { template: '%name %publicId', title: 'Иванова Мария 3f2a….pdf' },
];

export function DownloadDialog({
  jobId,
  count,
  columns,
  onClose,
}: {
  jobId: string;
  count: number;
  /** Колонки таблицы: из них человек и собирает имя. */
  columns: string[];
  onClose: () => void;
}) {
  const [template, setTemplate] = useState(PRESETS[0].template);
  /*
   * Можно ли собрать общий PDF, спрашиваем у сервера до нажатия.
   *
   * Склейка не стримится и большому пакету в память не помещается. Отдать
   * ссылку и надеяться — значит открыть человеку новую вкладку с голым
   * JSON вместо файла: ни объяснения, ни выхода. Пока ответа нет, кнопку
   * не гасим — мигающая недоступность хуже секундного ожидания.
   */
  const options = useDownloadOptions(jobId);
  const printBlocked = options.data ? !options.data.print.allowed : false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Пустой шаблон сервер не примет, и правильно: имя из ничего не собрать.
  const zipHref =
    `/api/jobs/${jobId}/archive?format=zip` +
    (template.trim() ? `&name=${encodeURIComponent(template.trim())}` : '');
  const pdfHref = `/api/jobs/${jobId}/archive?format=pdf`;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--scrim)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Скачать документы"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-full w-full max-w-lg overflow-auto rounded-2xl bg-[var(--surface)]">
        <header className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-3.5">
          <h2 className="font-medium">
            Скачать документы: <span className="tabular">{count}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="ml-auto text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-5 p-5">
          <div>
            <Label>Как назвать файлы в архиве</Label>
            <Input
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="%name"
              className="font-mono text-sm"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.template}
                  type="button"
                  onClick={() => setTemplate(p.template)}
                  className={`rounded-lg px-2 py-1 font-mono text-xs ring-1 transition-colors ${
                    template === p.template
                      ? 'ring-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'ring-[var(--line-strong)] hover:bg-[var(--surface-sunken)]'
                  }`}
                >
                  {p.title}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Подставляется любая колонка таблицы:{' '}
              {columns.slice(0, 4).map((c, i) => (
                <span key={c}>
                  {i > 0 && ', '}
                  <span className="font-mono">%{c}</span>
                </span>
              ))}
              . Ещё есть <span className="font-mono">%number</span> — порядковый номер
              и <span className="font-mono">%publicId</span> — код проверки подлинности.
            </p>
          </div>

          <div className="space-y-2">
            <Choice
              href={zipHref}
              icon={<FolderArchive size={20} />}
              title="Архивом"
              description="Каждый документ отдельным файлом. Так удобно разослать вручную или сложить в папку события."
              onPicked={onClose}
              primary
            />
            <Choice
              href={pdfHref}
              icon={<FileStack size={20} />}
              title="Одним PDF на печать"
              description={
                printBlocked
                  ? (options.data?.print.reason ??
                    'Для этого пакета общий файл собрать не получится.')
                  : `Все ${count} документов подряд в одном файле — отправить на принтер одним действием. Имена файлов здесь не нужны.`
              }
              disabled={printBlocked}
              onPicked={onClose}
            />
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            Скачивать можно сколько угодно раз: документы уже выпущены,
            и повторное скачивание ничего не списывает.
          </p>

          <div className="flex justify-end">
            <Button onClick={onClose}>Закрыть</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Способ выдачи. Недоступный показываем на месте и с причиной, а не прячем:
 * исчезнувшая кнопка заставляет искать её и гадать, что сделал не так.
 */
function Choice({
  href,
  icon,
  title,
  description,
  primary = false,
  disabled = false,
  onPicked,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  primary?: boolean;
  disabled?: boolean;
  onPicked: () => void;
}) {
  const body = (
    <>
      <span
        className={
          disabled
            ? 'mt-0.5 text-[var(--text-muted)]'
            : primary
              ? 'mt-0.5 text-[var(--accent)]'
              : 'mt-0.5 text-[var(--text-muted)]'
        }
      >
        {icon}
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{description}</span>
      </span>
    </>
  );

  if (disabled) {
    return (
      <div
        aria-disabled="true"
        className="flex w-full cursor-not-allowed items-start gap-3 rounded-xl px-4 py-3 text-left opacity-60 ring-1 ring-[var(--line)]"
      >
        {body}
      </div>
    );
  }

  return (
    <a
      href={href}
      onClick={onPicked}
      className={`flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left ring-1 transition-colors ${
        primary
          ? 'ring-[var(--accent)] hover:bg-[var(--accent-soft)]'
          : 'ring-[var(--line-strong)] hover:bg-[var(--surface-sunken)]'
      }`}
    >
      {body}
    </a>
  );
}
