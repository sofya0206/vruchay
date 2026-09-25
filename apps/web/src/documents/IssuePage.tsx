import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, Mail, Scale, Users } from 'lucide-react';
import { api, errorText } from '../api/client';
import {
  useGeneration,
  useJobFailures,
  useMailTemplate,
  useRecipients,
  useSend,
  type SendResult,
} from '../api/recipients';
import { useLastValidation } from '../api/validation';
import type { DocumentDetail } from '../api/types';
import { toHtml } from '../mail/email-body';
import { DEFAULT_LETTER } from '../mail/letter-defaults';
import { PushOffer } from '../push/PushOffer';
import { DownloadDialog } from '../recipients/DownloadDialog';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, Rows } from '../ui/Card';
import { Collapse } from '../ui/Collapse';
import { ConfirmDialog } from '../ui/Dialog';
import { ErrorBar } from '../ui/ErrorState';
import { NextAction } from '../ui/NextAction';
import { OptionCard, OptionGroup } from '../ui/OptionCard';
import { Outcome } from '../ui/Outcome';
import { ProgressBar } from '../ui/Progress';
import { SkeletonRows } from '../ui/Skeleton';
import { cn } from '../ui/cn';
import { VerifyPanel } from '../verify/VerifyPanel';
import { materialPath } from './material-steps';

type Mode = 'files' | 'files-and-send';

/**
 * Шаг «Выпуск»: сводка перед кнопкой и сама кнопка.
 *
 * До этого выпуск был окном поверх таблицы, а срок действия и правила
 * награждения — вкладками, о которых узнавали после первой ошибки.
 * Теперь всё, что решает судьбу пакета, стоит на одной странице:
 * сколько отмечено, проверены ли строки, есть ли письмо, кому какой
 * документ, сколько он действует — и только потом «Выпустить».
 *
 * Разрешение на уведомления просим здесь и только здесь — в момент,
 * когда пошло долгое дело (ADR-0004).
 */
export function IssueStep({ doc }: { doc: DocumentDetail }) {
  const id = doc.id;
  const qc = useQueryClient();
  const table = useRecipients(id);
  const template = useMailTemplate(id);
  const lastValidation = useLastValidation(id);
  const [mode, setMode] = useState<Mode>('files');
  const [jobId, setJobId] = useState<string | null>(null);
  const { job, start, cancel, resume } = useGeneration(id, jobId);
  const send = useSend(id);
  const [sent, setSent] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validity, setValidity] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const failures = useJobFailures(jobId, (job?.failed ?? 0) > 0);

  /*
   * Рассылка запускается сама, когда выпуск закончился. Намерение — в ref:
   * оно не влияет на то, что нарисовано. `sentForJob` защищает от повторной
   * рассылки: задание опрашивается по таймеру, и без отметки каждый
   * следующий ответ «готово» отправлял бы письма заново.
   */
  const wantSend = useRef(false);
  const sentForJob = useRef<string | null>(null);

  useEffect(() => {
    if (!job || job.status !== 'done' || job.done === 0) return;
    if (!wantSend.current || sentForJob.current === job.id) return;
    sentForJob.current = job.id;
    send.mutate(undefined, {
      onSuccess: (result) => setSent(result),
      onError: (err) => setError(errorText(err)),
    });
  }, [job?.id, job?.status, job?.done, send]);

  // Без письма сервер рассылать отказывается: перед рассылкой сохраняем текст по умолчанию.
  const saveDefault = useMutation({
    mutationFn: () =>
      api.post(`/mail/templates/${id}`, {
        subject: DEFAULT_LETTER.subject,
        bodyHtml: toHtml(DEFAULT_LETTER.body),
        attachGeneratedFile: true,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['email-template', id] });
      void qc.invalidateQueries({ queryKey: ['mailing-template', id] });
    },
  });

  if (table.isPending) return <SkeletonRows rows={5} label="Загружаем сводку" />;
  if (!table.data) return <ErrorBar onRetry={() => void table.refetch()}>Список получателей не открылся</ErrorBar>;

  const { rows, columns, checkedCount } = table.data;
  const checked = rows.filter((r) => r.checked);
  const withoutEmail = checked.filter((r) => !(r.data.email ?? '').trim()).length;
  const sendableCount = checkedCount - withoutEmail;
  const nobodyToSend = checked.length > 0 && withoutEmail === checked.length;
  const stuck = job?.status === 'queued' && job.stuck === true;
  const running = !stuck && (job?.status === 'queued' || job?.status === 'running');
  const canResume = !!job && (job.status === 'failed' || job.status === 'canceled' || stuck) && job.done < job.total;

  // «Проверка строк» в сводке — по тому, что реально видела эта вкладка
  // в этом заходе, а не постоянная нейтральная подпись: проверка нигде
  // не сохраняется на сервере (POST, а не GET — отчёт с именами и почтами
  // не должен оседать в кэше), поэтому источник правды — общий кэш
  // React Query, который пишет ValidationScreen.
  const warnOnly = lastValidation ? lastValidation.total - lastValidation.clean - lastValidation.blocked : 0;
  const checkRow: { value: string; tone: BadgeTone } = !lastValidation
    ? { value: 'проверить перед выпуском', tone: 'neutral' }
    : lastValidation.blocked > 0
      ? { value: `нельзя выпускать: ${lastValidation.blocked}`, tone: 'danger' }
      : warnOnly > 0
        ? { value: `с замечаниями: ${warnOnly}`, tone: 'warn' }
        : { value: 'без замечаний', tone: 'ok' };

  async function issue(): Promise<boolean> {
    setError(null);
    setSent(null);
    wantSend.current = mode === 'files-and-send';
    try {
      if (wantSend.current && !template.data) await saveDefault.mutateAsync();
      const created = await start.mutateAsync();
      setJobId(created.id);
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  }

  if (checkedCount === 0 && !job) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card padding="none">
          <NextAction
            icon={Users}
            title="Отметьте, кому выпускать"
            text="Выпустятся только отмеченные строки списка. Можно отметить всех разом."
            primary={{ label: 'К получателям', to: materialPath(id, 'recipients') }}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 sm:p-6">
      {error && <ErrorBar onRetry={() => setError(null)}>{error}</ErrorBar>}

      {/* Идущий или законченный выпуск — первым: это ответ на вопрос «что сейчас». */}
      {job && (
        <Card>
          {running || stuck ? (
            <div className="space-y-4">
              <ProgressBar done={job.done} total={job.total} failed={job.failed} running={running} />
              {stuck && (
                <p className="text-sm text-warn">
                  Задание стоит в очереди дольше обычного. Можно продолжить его вручную.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {stuck ? (
                  <Button variant="primary" loading={resume.isPending} onClick={() => resume.mutate(job.id)}>
                    Продолжить
                  </Button>
                ) : (
                  <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate(job.id)}>
                    Остановить
                  </Button>
                )}
              </div>
              <PushOffer />
            </div>
          ) : (
            <div className="space-y-4">
              <Outcome
                done={job.done}
                failed={job.failed}
                doneLabel="выпущено"
                action={
                  <>
                    {job.done > 0 && (
                      <Button variant="primary" icon={<Download size={16} />} onClick={() => setDownloading(true)}>
                        Скачать
                      </Button>
                    )}
                    {canResume && (
                      <Button loading={resume.isPending} onClick={() => resume.mutate(job.id)}>
                        Доделать остальное
                      </Button>
                    )}
                  </>
                }
              />
              {job.error && <p className="text-sm text-danger">{job.error}</p>}
              {failures.data && failures.data.length > 0 && (
                <Rows>
                  {failures.data.map((f) => (
                    <li key={f.rowId} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="truncate">{f.name}</span>
                      <span className="shrink-0 text-muted">{f.reason}</span>
                    </li>
                  ))}
                </Rows>
              )}
              {sent && (
                <p className="text-sm text-muted">
                  Писем отправлено: <span className="tabular font-medium text-ink">{sent.queued}</span>
                  {sent.skipped.length > 0 && <> · пропущено: {sent.skipped.length}</>}. Доставку видно в{' '}
                  <Link to="/mailing" className="text-accent hover:underline">
                    письмах
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {!running && (
        <>
          <Card padding="none" data-tour="issue-summary">
            <Rows className="rounded-card">
              <SummaryRow
                icon={Users}
                to={materialPath(id, 'recipients')}
                title="Получатели"
                value={`отмечено ${checkedCount} из ${rows.length}`}
                tone={checkedCount > 0 ? 'ok' : 'warn'}
              />
              <SummaryRow
                icon={ChevronRight}
                to={materialPath(id, 'check')}
                title="Проверка строк"
                value={checkRow.value}
                tone={checkRow.tone}
              />
              <SummaryRow
                icon={Mail}
                to={materialPath(id, 'letter')}
                title="Письмо участнику"
                value={template.isPending ? '…' : template.data ? 'готово' : 'текст по умолчанию'}
                tone={template.data ? 'ok' : 'neutral'}
              />
              <SummaryRow
                icon={Scale}
                to={materialPath(id, 'rules')}
                title="Правила награждения"
                value={doc.ruleSetId ? 'заданы' : 'всем один документ'}
                tone={doc.ruleSetId ? 'ok' : 'neutral'}
              />
            </Rows>
          </Card>

          <Card padding="none" id="validity">
            <button
              type="button"
              onClick={() => setValidity((v) => !v)}
              aria-expanded={validity}
              className="pressable flex w-full items-center gap-3 rounded-card px-4 py-3 text-left text-sm hover:bg-row-hover"
            >
              <span className="flex-1 font-medium">Срок действия и страница проверки</span>
              <ChevronDown size={16} className={cn('text-muted transition-transform', validity && 'rotate-180')} aria-hidden />
            </button>
            <Collapse open={validity}>
              <div className="border-t border-line px-4 pb-4">
                <VerifyPanel doc={doc} />
              </div>
            </Collapse>
          </Card>

          <Card
            title="Что сделать"
            about="Файлы создаются в любом случае. Письма уходят только во втором варианте."
            data-tour="issue-mode"
          >
            <OptionGroup label="Что сделать после создания файлов" columns={2}>
              <OptionCard
                icon={Download}
                title="Только создать файлы"
                description="Скачаете и раздадите сами — на бумаге или как удобно."
                selected={mode === 'files'}
                onSelect={() => setMode('files')}
              />
              <OptionCard
                icon={Mail}
                title="Создать и разослать"
                description={
                  nobodyToSend
                    ? 'Недоступно: ни у кого из отмеченных нет адреса почты.'
                    : withoutEmail > 0
                      ? `Каждому уйдёт письмо с документом. Без адреса — ${withoutEmail}, им письма не уйдут.`
                      : 'Каждому уйдёт письмо с его документом во вложении.'
                }
                selected={mode === 'files-and-send'}
                disabled={nobodyToSend}
                onSelect={() => setMode('files-and-send')}
              />
            </OptionGroup>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                loading={start.isPending || saveDefault.isPending}
                disabled={checkedCount === 0}
                onClick={() => (mode === 'files-and-send' ? setConfirmSend(true) : void issue())}
                data-tour="issue"
              >
                {mode === 'files-and-send' ? `Выпустить и разослать: ${sendableCount}` : `Выпустить: ${checkedCount}`}
              </Button>
              <span className="text-sm text-muted">Каждая строка станет отдельным PDF с QR-кодом.</span>
            </div>
          </Card>
        </>
      )}

      {downloading && job && (
        <DownloadDialog
          jobId={job.id}
          count={job.done}
          columns={columns.map((c) => c.name)}
          onClose={() => setDownloading(false)}
        />
      )}

      {/* Только для настоящей рассылки: «Только создать файлы» — обратимо
          и без внешнего эффекта, лишнее подтверждение там было бы просто
          трением. */}
      {confirmSend && (
        <ConfirmDialog
          title="Разослать письма участникам?"
          confirmLabel={`Выпустить и разослать: ${sendableCount}`}
          pending={start.isPending || saveDefault.isPending}
          error={error}
          onConfirm={() => void issue().then((ok) => ok && setConfirmSend(false))}
          onClose={() => setConfirmSend(false)}
        >
          Каждая отмеченная строка станет отдельным PDF с QR-кодом, и {sendableCount}{' '}
          {plural(sendableCount, 'человек', 'человека', 'человек')}{' '}
          {plural(sendableCount, 'получит', 'получат', 'получат')} письмо с документом на почту.
          Отменить рассылку после отправки нельзя.
        </ConfirmDialog>
      )}
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function SummaryRow({
  icon: Icon,
  to,
  title,
  value,
  tone,
}: {
  icon: typeof Users;
  to: string;
  title: string;
  value: string;
  tone: BadgeTone;
}) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-row-hover">
        <Icon size={16} className="shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 font-medium">{title}</span>
        <Badge tone={tone}>{value}</Badge>
        <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
}
