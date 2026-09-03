import { Map, ThumbsUp } from 'lucide-react';
import { useRoadmap, useRoadmapVote, type RoadmapStatus } from '../api/support';

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
    <div className="mt-10">
      <h2 className="flex items-center gap-2 font-serif text-xl">
        <Map size={18} className="text-[var(--accent)]" />
        Что дальше
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
        Что мы собираемся делать. Голос — один от организации; он не назначает срок, а показывает
        нам, с чего начать.
      </p>

      {data?.length === 0 && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Список пока пуст — напишите в поддержку, чего вам не хватает.
        </p>
      )}

      <ul className="mt-4 max-w-2xl space-y-2">
        {data?.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-start gap-3 rounded-xl bg-[var(--surface)] p-3 ring-1 ring-[var(--line)]"
          >
            <div className="min-w-48 flex-1">
              <p className="font-medium">{item.title}</p>
              {item.description && (
                <p className="mt-1 text-sm text-[var(--text-muted)]">{item.description}</p>
              )}
              <p className="mt-1 text-xs text-[var(--text-muted)]">{STATUS_TITLE[item.status]}</p>
            </div>
            <button
              type="button"
              onClick={() => vote.mutate({ id: item.id, voted: item.voted })}
              disabled={item.status === 'done' || vote.isPending}
              aria-pressed={item.voted}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ring-1 transition disabled:opacity-50 ${
                item.voted
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] ring-[var(--accent)]'
                  : 'bg-[var(--surface-sunken)] ring-[var(--line)] hover:ring-[var(--line-strong)]'
              }`}
            >
              <ThumbsUp size={14} />
              {item.votes}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
