import { useEffect, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { errorText } from '../api/client';
import { useMyReview, useReviewMutations, type MyReview } from '../api/reviews';
import { Button } from '../ui/Button';
import { SectionHead } from '../ui/Settings';
import { Input, Label, Textarea } from '../ui/Field';

/**
 * Отзыв о сервисе.
 *
 * Просим не «оставьте отзыв», а отвечаем на вопрос, который человек
 * задаёт себе сам: зачем это ему. Отзыв висит на посадочной с именем
 * организации — то есть это ещё и упоминание его организации там, где
 * его увидят коллеги.
 *
 * Про проверку перед публикацией говорим сразу, а не после отправки:
 * иначе человек ждёт, что отзыв появится немедленно, и решает, что
 * что-то сломалось.
 */
export function Review() {
  const { data, isLoading } = useMyReview();

  return (
    <section>
      <SectionHead title="Отзыв о сервисе" about={<>Если «Вручай» вам пригодился — расскажите об этом. Отзыв появится на главной странице сервиса вместе с названием вашей организации.</>} />

      {isLoading && <p className="mt-4 text-sm text-muted">Загружаем…</p>}
      {!isLoading && <ReviewForm existing={data ?? null} />}
    </section>
  );
}

function ReviewForm({ existing }: { existing: MyReview | null }) {
  const { submit, remove } = useReviewMutations();
  const [authorName, setAuthorName] = useState('');
  const [authorRole, setAuthorRole] = useState('');
  const [orgName, setOrgName] = useState('');
  const [text, setText] = useState('');
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  // Прежний отзыв подставляем в поля: править надо то, что уже написано,
  // а не сочинять заново с чистого листа.
  useEffect(() => {
    if (!existing) return;
    setAuthorName(existing.authorName);
    setAuthorRole(existing.authorRole);
    setOrgName(existing.orgName);
    setText(existing.text);
    setRating(existing.rating ?? undefined);
  }, [existing]);

  const tooShort = text.trim().length > 0 && text.trim().length < 40;
  const ready =
    authorName.trim().length >= 2 &&
    authorRole.trim().length >= 2 &&
    orgName.trim().length >= 2 &&
    text.trim().length >= 40;

  return (
    <div className="mt-4 max-w-2xl space-y-4">
      {existing && <StatusNotice review={existing} />}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate(
            { authorName, authorRole, orgName, text, rating },
            {
              onSuccess: () => {
                setSaved(true);
                setTimeout(() => setSaved(false), 5000);
              },
            },
          );
        }}
        className="space-y-4 rounded-sheet bg-surface p-4 ring-1 ring-line"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Как вас зовут</Label>
            <Input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              maxLength={120}
              placeholder="Наталья Рязанцева"
            />
          </div>
          <div>
            <Label>Должность</Label>
            <Input
              value={authorRole}
              onChange={(e) => setAuthorRole(e.target.value)}
              maxLength={120}
              placeholder="Главный секретарь"
            />
          </div>
        </div>

        <div>
          <Label>Организация</Label>
          <Input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            maxLength={200}
            placeholder="Учебный центр «Развитие»"
          />
          <p className="mt-1.5 text-sm text-muted">
            Так она будет подписана на главной странице.
          </p>
        </div>

        <div>
          <Label>Что скажете</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={2000}
            spellCheck
            placeholder="Что делали раньше, что изменилось, сколько времени стало занимать награждение."
            className="text-sm"
          />
          <p className="mt-1.5 text-sm text-muted">
            {tooShort
              ? 'Пока коротковато — напишите хотя бы пару предложений.'
              : 'Полезнее всего конкретика: сколько человек награждали и сколько это заняло.'}
          </p>
        </div>

        <div>
          <Label>Оценка (необязательно)</Label>
          <div className="mt-1 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                size="sm"
                variant={rating && n <= rating ? 'primary' : 'secondary'}
                aria-label={`${n} из 5`}
                aria-pressed={rating === n}
                onClick={() => setRating(rating === n ? undefined : n)}
                className="w-9 px-0"
              >
                {n}
              </Button>
            ))}
          </div>
        </div>

        {submit.isError && (
          <p role="alert" className="text-sm text-danger">
            {errorText(submit.error)}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={!ready || submit.isPending}>
            {submit.isPending
              ? 'Отправляем…'
              : existing
                ? 'Сохранить изменения'
                : 'Отправить отзыв'}
          </Button>

          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-accent">
              <Check size={15} /> Отправлено на проверку
            </span>
          )}

          {existing && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto hover:text-danger"
              icon={<Trash2 size={16} />}
              loading={remove.isPending}
              onClick={() => remove.mutate(existing.id)}
            >
              Убрать отзыв
            </Button>
          )}
        </div>

        {remove.isError && (
          <p role="alert" className="text-sm text-danger">
            {errorText(remove.error)}
          </p>
        )}

        <p className="text-sm text-muted">
          Перед публикацией мы читаем отзыв глазами — обычно в течение пары дней.
          Так на главной не окажется того, чего вы не хотели там видеть.
        </p>
      </form>
    </div>
  );
}

/** Что сейчас с отзывом — простыми словами, без слова «модерация». */
function StatusNotice({ review }: { review: MyReview }) {
  if (review.status === 'published') {
    return (
      <p className="rounded-sheet bg-accent-soft px-4 py-3 text-sm">
        Отзыв опубликован на главной странице. Учтите: если поправить текст, отзыв
        снимется с главной и вернётся туда после проверки — на непроверенный текст
        мы ссылаться не можем.
      </p>
    );
  }

  if (review.status === 'rejected') {
    return (
      <div className="rounded-sheet bg-danger-soft px-4 py-3 text-sm">
        <p className="font-medium text-danger">Отзыв пока не опубликован</p>
        {review.moderatorNote && <p className="mt-1">{review.moderatorNote}</p>}
        <p className="mt-1 text-muted">
          Поправьте текст ниже и отправьте снова.
        </p>
      </div>
    );
  }

  return (
    <p className="rounded-sheet bg-sunken px-4 py-3 text-sm">
      Отзыв отправлен и ждёт проверки. Обычно это пара дней.
    </p>
  );
}
