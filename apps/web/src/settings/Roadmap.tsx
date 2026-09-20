import { ThumbsUp } from 'lucide-react';
import { Button } from '../ui/Button';
import { useRoadmap, useRoadmapVote, type RoadmapStatus } from '../api/support';
import { SectionHead } from '../ui/Settings';

const STATUS_TITLE: Record<RoadmapStatus, string> = {
  planned: 'Задумано',
  in_progress: 'В работе',
  done: 'Готово',
};

/**
 * Дорожная карта с голосованием.
 *
 * Голос один на организацию: иначе тот, у кого больше сотрудников,
 * решал бы за всех. Голосование не обещание сроков — это способ узнать,
 * что из задуманного нужно клиентам раньше остального.
 */
export function Roadmap() {
  const { data } = useRoadmap();
  const vote = useRoadmapVote();

  return (
    <div>
      <SectionHead title="Что дальше" about={<>Что мы собираемся делать. Голос — один от организации; он не назначает срок, а показывает нам, с чего начать.</>} />

      {data?.length === 0 && (
        <p className="mt-3 text-sm text-muted">
          Список пока пуст — напишите в поддержку, чего вам не хватает.
        </p>
      )}

      <ul className="mt-4 max-w-2xl space-y-2">
        {data?.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-start gap-3 rounded-card bg-surface p-3 ring-1 ring-line"
          >
            <div className="min-w-48 flex-1">
              <p className="font-medium">{item.title}</p>
              {item.description && (
                <p className="mt-1 text-sm text-muted">{item.description}</p>
              )}
              <p className="mt-1 text-xs text-muted">{STATUS_TITLE[item.status]}</p>
            </div>
            <Button
              size="sm"
              active={item.voted}
              disabled={item.status === 'done' || vote.isPending}
              onClick={() => vote.mutate({ id: item.id, voted: item.voted })}
              icon={<ThumbsUp size={16} />}
            >
              {item.votes}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
