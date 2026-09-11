import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Overview } from '../api/overview';
import { Button } from '../ui/Button';
import { StatusChip } from '../ui/Field';
import { Block, Rows } from './Block';
import { lastJob } from './desk';
import { formatWhen, jobLook, protocolTitle } from './format';
import { useCreateMaterial } from './useCreateMaterial';
import { CreateVisual } from './visuals';

/**
 * Первый блок полосы: то, над чем работали, и кнопка завести новое.
 *
 * Раньше здесь стояли три двери с картинками — «Создать», «Документы»,
 * «Письма», — то есть оглавление вместо работы: человек, у которого
 * десять материалов, каждый раз проходил через плитку, чтобы увидеть
 * их список. Теперь список стоит сразу, а дверей осталась одна — та,
 * что заводит новое.
 *
 * Состояние показываем только там, где оно известно: сервер присылает
 * пять последних заданий по организации, и у давнего материала задания
 * среди них нет (см. `lastJob`).
 */
export function MyDocuments({ data }: { data: Overview }) {
  const create = useCreateMaterial();

  return (
    <Block
      title="Мои документы"
      about="Последнее, над чем вы работали. Нажмите — откроется лист."
      to="/documents"
      linkLabel="Все документы"
    >
      <div className="mb-4">
        <Button
          variant="primary"
          icon={<Plus size={16} />}
          disabled={create.isPending}
          onClick={() => create.mutate(protocolTitle())}
        >
          Создать документ
        </Button>
      </div>

      {data.documents.length === 0 ? (
        <div className="grid items-center gap-6 rounded-[var(--radius-card)] bg-[var(--surface)] p-6 shadow-[var(--ring-line)] sm:grid-cols-[minmax(0,15rem)_1fr]">
          {/* Единственная картинка на главной — и та на пустом месте:
              показать, что получится, можно только рисунком, пока своего
              документа ещё нет. Дальше её место занимают настоящие. */}
          <span className="grid place-items-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-sunken)] p-4">
            <CreateVisual />
          </span>
          <div>
            <p className="font-medium">Здесь появятся ваши документы</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Соберите лист один раз, подставьте имена из протокола — и выпустите
              всё награждение разом.
            </p>
          </div>
        </div>
      ) : (
        <Rows>
          {data.documents.map((doc) => {
            const job = lastJob(doc.id, data.jobs);
            const look = job ? jobLook(job.status, job.failed) : null;

            return (
              <li key={doc.id}>
                <Link
                  to={`/documents/${doc.id}`}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-[var(--accent-soft)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{doc.title}</span>
                    {/* Название мероприятия важнее названия бланка: бланк
                        организации один на сезон, а мероприятий десятки. */}
                    {doc.eventName && (
                      <span className="mt-0.5 block truncate text-sm text-[var(--text-muted)]">
                        {doc.eventName}
                        {doc.eventDate && ` · ${doc.eventDate}`}
                      </span>
                    )}
                  </span>
                  {look && <StatusChip tone={look.tone}>{look.label}</StatusChip>}
                  <span className="shrink-0 text-sm text-[var(--text-muted)]">
                    {formatWhen(doc.updatedAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </Rows>
      )}

      {create.isError && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          Не удалось создать документ. Попробуйте ещё раз или откройте «Все документы».
        </p>
      )}
    </Block>
  );
}
