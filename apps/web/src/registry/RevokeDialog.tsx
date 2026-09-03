import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { RegistryFilters, RevokePreview, RevokeTarget } from '../api/registry';
import { Button } from '../ui/Button';
import { Input, Label, Textarea } from '../ui/Field';
import { Dialog } from '../mailing/Dialog';
import { plural } from './registry-format';

/**
 * Отзыв — с предпросмотром и подтверждением по количеству.
 *
 * Отзыв обратим технически и необратим по смыслу: человек с бумагой
 * уже увидел красную страницу. Поэтому перед ним — список того, что
 * будет отозвано, число, и это число надо набрать руками. Сервер сверяет
 * его со своим: если список успел измениться, отзыв не проходит.
 */
export function RevokeDialog({
  target,
  filters,
  onClose,
  onDone,
}: {
  target: RevokeTarget;
  /** Отбор, которым найдено «всё найденное», — для подписи. */
  filters: RegistryFilters;
  onClose: () => void;
  onDone: (changed: number) => void;
}) {
  const [preview, setPreview] = useState<RevokePreview | null>(null);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const [reasonPublic, setReasonPublic] = useState('');
  const [reasonInternal, setReasonInternal] = useState('');

  useEffect(() => {
    let alive = true;
    setPreview(null);
    setError('');
    api
      .post<RevokePreview>('/registry/revoke/preview', target)
      .then((data) => alive && setPreview(data))
      .catch(
        (err) =>
          alive && setError(err instanceof ApiError ? err.message : 'Не удалось собрать список'),
      );
    return () => {
      alive = false;
    };
  }, [target]);

  const revoke = useMutation({
    mutationFn: () =>
      api.post<{ changed: number }>('/registry/revoke', {
        ...target,
        revoked: true,
        expectedCount: preview?.count ?? 0,
        reasonPublic: reasonPublic.trim(),
        reasonInternal: reasonInternal.trim(),
      }),
    onSuccess: (result) => onDone(result.changed),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Не получилось — попробуйте ещё раз'),
  });

  const count = preview?.count ?? 0;
  const confirmed = preview !== null && typed.trim() === String(count) && count > 0;
  const scope = target.fileIds
    ? `${target.fileIds.length} ${plural(target.fileIds.length, 'отмеченный документ', 'отмеченных документа', 'отмеченных документов')}`
    : `всё найденное по отбору${filters.event ? ` «${filters.event}»` : ''}`;

  return (
    <Dialog
      title="Отозвать документы"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="danger"
            icon={<ShieldAlert size={14} />}
            disabled={!confirmed || revoke.isPending}
            onClick={() => revoke.mutate()}
          >
            {revoke.isPending ? 'Отзываем…' : `Отозвать ${count || ''}`}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p>
          Будет отозвано: <strong>{scope}</strong>. Страница проверки каждого станет красной:
          «документ отозван» с причиной ниже. Вернуть проверку можно, но проверяющие уже увидят
          отзыв.
        </p>

        {error && (
          <p role="alert" className="rounded-lg bg-[var(--danger-soft)] p-3 text-[var(--danger)]">
            {error}
          </p>
        )}

        {preview === null && !error && <p className="text-[var(--text-muted)]">Собираем список…</p>}

        {preview && (
          <div className="rounded-xl bg-[var(--surface-sunken)] p-3">
            <p className="font-medium">
              {count > 0
                ? `${count} ${plural(count, 'документ', 'документа', 'документов')}`
                : 'По этому отбору ничего не найдено'}
              {preview.alreadyRevoked > 0 && (
                <span className="font-normal text-[var(--text-muted)]">
                  {' '}
                  (уже отозвано: {preview.alreadyRevoked})
                </span>
              )}
            </p>
            {preview.sample.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs text-[var(--text-muted)]">
                {preview.sample.map((item) => (
                  <li key={item.fileId} className="flex justify-between gap-3">
                    <span className="truncate">
                      {item.name || 'Без имени'} — {item.documentTitle}
                    </span>
                    <span className="shrink-0 font-mono">{item.code}</span>
                  </li>
                ))}
                {count > preview.sample.length && <li>и ещё {count - preview.sample.length}</li>}
              </ul>
            )}
          </div>
        )}

        <div>
          <Label>Причина для проверяющих</Label>
          <Input
            value={reasonPublic}
            onChange={(e) => setReasonPublic(e.target.value)}
            maxLength={300}
            placeholder="Выдан по ошибке"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Её увидит любой, кто откроет страницу проверки. Без фамилии получателя.
          </p>
        </div>

        <div>
          <Label>Внутренняя причина</Label>
          <Textarea
            rows={2}
            value={reasonInternal}
            onChange={(e) => setReasonInternal(e.target.value)}
            maxLength={1000}
            placeholder="Перепутали протоколы, см. письмо главного судьи от 18.06"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Видна только владельцу и управляющему в карточке документа.
          </p>
        </div>

        {count > 0 && (
          <div>
            <Label>Подтверждение</Label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              inputMode="numeric"
              placeholder={String(count)}
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Наберите число документов — {count} — чтобы подтвердить отзыв.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
