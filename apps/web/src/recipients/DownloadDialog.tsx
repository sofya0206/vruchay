import { useState } from 'react';
import { FileStack, FolderArchive } from 'lucide-react';
import { useDownloadOptions } from '../api/recipients';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input } from '../ui/Field';
import { OptionCard, OptionGroup } from '../ui/OptionCard';

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

type Format = 'zip' | 'pdf';

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
  const [format, setFormat] = useState<Format>('zip');
  /*
   * Можно ли собрать общий PDF, спрашиваем у сервера до нажатия.
   *
   * Склейка не стримится и большому пакету в память не помещается. Отдать
   * ссылку и надеяться — значит открыть человеку новую вкладку с голым
   * JSON вместо файла: ни объяснения, ни выхода. Пока ответа нет, вариант
   * не гасим — мигающая недоступность хуже секундного ожидания.
   */
  const options = useDownloadOptions(jobId);
  const printBlocked = options.data ? !options.data.print.allowed : false;

  // Пустой шаблон сервер не примет, и правильно: имя из ничего не собрать.
  const name = template.trim();
  const href =
    format === 'zip'
      ? `/api/jobs/${jobId}/archive?format=zip${name ? `&name=${encodeURIComponent(name)}` : ''}`
      : `/api/jobs/${jobId}/archive?format=pdf`;
  const canDownload = format === 'zip' ? name.length > 0 : !printBlocked;

  /*
   * Файл отдаёт сервер заголовком «attachment», поэтому переход по адресу
   * не уводит со страницы, а открывает скачивание — как раньше ссылка.
   */
  function download() {
    window.location.assign(href);
    onClose();
  }

  return (
    <Dialog
      title="Скачать документы"
      description={
        <>
          Документов: <span className="tabular">{count}</span>. Скачивать можно сколько угодно раз —
          повторное скачивание ничего не списывает.
        </>
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" disabled={!canDownload} onClick={download}>
            Скачать
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Недоступный вариант стоит на месте и с причиной, а не прячется:
            исчезнувшая кнопка заставляет искать её и гадать, что сделал не так. */}
        <OptionGroup label="В каком виде скачать" columns={1}>
          <OptionCard
            icon={FolderArchive}
            title="Архивом"
            description="Каждый документ отдельным файлом. Так удобно разослать вручную или сложить в папку события."
            selected={format === 'zip'}
            onSelect={() => setFormat('zip')}
          />
          <OptionCard
            icon={FileStack}
            title="Одним PDF на печать"
            description={
              printBlocked
                ? (options.data?.print.reason ??
                  'Для этого пакета общий файл собрать не получится.')
                : `Все ${count} документов подряд в одном файле — отправить на принтер одним действием.`
            }
            selected={format === 'pdf'}
            disabled={printBlocked}
            onSelect={() => setFormat('pdf')}
          />
        </OptionGroup>

        <Field
          label="Как назвать файлы в архиве"
          help={
            format === 'pdf' ? (
              'В общем файле имена не нужны.'
            ) : (
              <>
                Подставляется любая колонка таблицы:{' '}
                {columns.slice(0, 4).map((c, i) => (
                  <span key={c}>
                    {i > 0 && ', '}
                    <span className="font-mono">%{c}</span>
                  </span>
                ))}
                . Ещё есть <span className="font-mono">%number</span> — порядковый номер и{' '}
                <span className="font-mono">%publicId</span> — код проверки подлинности.
              </>
            )
          }
        >
          <Input
            value={template}
            disabled={format === 'pdf'}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="%name"
            className="font-mono"
          />
        </Field>
        {format === 'zip' && (
          <div className="-mt-3 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button
                key={p.template}
                size="sm"
                variant="ghost"
                active={template === p.template}
                onClick={() => setTemplate(p.template)}
                className="font-mono text-xs"
              >
                {p.title}
              </Button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
