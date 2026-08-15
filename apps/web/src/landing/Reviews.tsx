import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

interface PublishedReview {
  authorName: string;
  authorRole: string;
  orgName: string;
  text: string;
  rating: number | null;
  publishedAt: string;
}

/**
 * Отзывы на посадочной.
 *
 * Раздел исчезает целиком, пока отзывов нет. Пустая рубрика «Что говорят
 * о нас» с тремя прочерками убеждает ровно в обратном тому, ради чего
 * её ставят, — а на старте отзывов не будет ни одного и довольно долго.
 */
export function Reviews() {
  const { data } = useQuery({
    queryKey: ['public-reviews'],
    queryFn: () => api.get<{ items: PublishedReview[] }>('/v1/reviews?limit=6'),
    // Посадочную открывают незалогиненные — ошибка здесь не должна
    // ронять страницу, ради которой человек пришёл.
    retry: false,
  });

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <section className="border-y border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="font-serif text-2xl">Кто уже пользуется</h2>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {items.map((review, i) => (
            <figure
              key={i}
              className="rounded-2xl bg-[var(--ground)] p-5 ring-1 ring-[var(--line)]"
            >
              <blockquote className="text-sm leading-relaxed">{review.text}</blockquote>
              <figcaption className="mt-4 text-sm text-[var(--text-muted)]">
                <span className="block font-medium text-[var(--text)]">{review.authorName}</span>
                {review.authorRole}, {review.orgName}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
