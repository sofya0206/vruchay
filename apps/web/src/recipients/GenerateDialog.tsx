import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Download, Mail, Paperclip, Pencil, TriangleAlert, X } from 'lucide-react';
import { api, errorText } from '../api/client';
import { useMailTemplate } from '../api/recipients';
import type { RecipientRow } from '../api/recipients';
import { toHtml, toText } from '../mail/email-body';
import { DEFAULT_LETTER } from '../mail/letter-defaults';
import { Button } from '../ui/Button';

export type GenerateMode = 'files' | 'files-and-send';

/**
 * Что сделать с отмеченными строками.
 *
 * До этого окна кнопка «Создать файлы» делала ровно то, что написано:
 * создавала файлы. Человек при этом был уверен, что разослал грамоты,
 * и узнавал правду, когда участники начинали спрашивать, где документ.
 *
 * Письмо показывается здесь же, вторым шагом: про отдельную вкладку
 * не знают и о ней забывают. Но только показывается — править его
 * можно в одном месте, во вкладке письма (кнопка «Изменить»). Раньше
 * здесь был второй редактор: он жил своими полями, при каждой рассылке
 * записывал шаблон заново и молча включал вложение, снятое во вкладке.
 *
 * Сохраняет окно только когда письма нет вовсе: без шаблона сервер
 * рассылать отказывается, а текст по умолчанию готов к отправке.
 */
export function GenerateDialog({
  documentId,
  rows,
  onCancel,
  onConfirm,
  onGoToMail,
}: {
  documentId: string;
  rows: RecipientRow[];
  onCancel: () => void;
  onConfirm: (mode: GenerateMode) => void;
  onGoToMail: () => void;
}) {
  const qc = useQueryClient();
  const template = useMailTemplate(documentId);
  const [step, setStep] = useState<'choose' | 'letter'>('choose');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Что уйдёт на самом деле: сохранённое письмо, а без него — текст
  // по умолчанию, который и будет сохранён перед рассылкой.
  const saved = template.data;
  const letter = saved
    ? { subject: saved.subject, body: toText(saved.bodyHtml), attach: saved.attachGeneratedFile }
    : { ...DEFAULT_LETTER, attach: true };

  const saveDefault = useMutation({
    mutationFn: () =>
      api.post(`/mail/templates/${documentId}`, {
        subject: DEFAULT_LETTER.subject,
        bodyHtml: toHtml(DEFAULT_LETTER.body),
        attachGeneratedFile: true,
      }),
    onSuccess: () => {
      // Редактор во вкладке письма и раздел «Письма» читают тот же шаблон.
      void qc.invalidateQueries({ queryKey: ['email-template', documentId] });
      void qc.invalidateQueries({ queryKey: ['mailing-template', documentId] });
    },
  });

  // Считаем по тем же правилам, по каким сервер потом решает, кому слать.
  const withoutEmail = rows.filter((r) => !(r.data.email ?? '').trim()).length;
  const nobodyToSend = withoutEmail === rows.length;

  async function send() {
    setError(null);
    try {
      if (!saved) await saveDefault.mutateAsync();
      onConfirm('files-and-send');
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--scrim)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Создание документов"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="max-h-full w-full max-w-lg overflow-auto rounded-2xl bg-[var(--surface)]">
        <header className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-3.5">
          {step === 'letter' && (
            <button
              onClick={() => setStep('choose')}
              aria-label="Назад"
              className="text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <h2 className="font-medium">
            {step === 'choose' ? (
              <>
                Подписываем документы: <span className="tabular">{rows.length}</span>
              </>
            ) : (
              'Письмо участнику'
            )}
          </h2>
          <button
            onClick={onCancel}
            aria-label="Закрыть"
            className="ml-auto text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X size={18} />
          </button>
        </header>

        {step === 'choose' ? (
          <div className="space-y-3 p-5">
            <p className="text-sm text-[var(--text-muted)]">Что сделать после создания файлов?</p>

            <Choice
              icon={<Download size={20} />}
              title="Только создать файлы"
              description="Скачаете их себе и раздадите сами — на бумаге или как удобно. Письма участникам не уйдут."
              onClick={() => onConfirm('files')}
            />

            <Choice
              icon={<Mail size={20} />}
              title="Создать и разослать участникам"
              description={
                nobodyToSend
                  ? 'Сейчас недоступно: ни у кого не указан адрес почты.'
                  : letter.attach
                    ? 'Каждому уйдёт письмо с его документом во вложении. Письмо покажем на следующем шаге.'
                    : 'Каждому уйдёт письмо без вложения — так настроено письмо. Покажем его на следующем шаге.'
              }
              disabled={nobodyToSend}
              primary
              onClick={() => setStep('letter')}
            />

            {withoutEmail > 0 && (
              <Notice>
                {nobodyToSend ? (
                  <>Ни у кого в списке не указан адрес почты — рассылать некуда.</>
                ) : (
                  <>
                    Без адреса почты: <span className="tabular font-medium">{withoutEmail}</span> из{' '}
                    <span className="tabular">{rows.length}</span>. Их документы будут созданы, но
                    письма им не уйдут.
                  </>
                )}
              </Notice>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="space-y-3 rounded-xl bg-[var(--surface-sunken)] p-4 text-sm">
              <p className="font-medium">{letter.subject}</p>
              <p className="whitespace-pre-wrap">{letter.body}</p>
              <p className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <Paperclip size={14} />
                {letter.attach ? 'Документ во вложении' : 'Без вложения'}
              </p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={() => void send()}
                disabled={template.isPending || saveDefault.isPending}
              >
                {saveDefault.isPending
                  ? 'Отправляем…'
                  : `Создать и разослать: ${rows.length - withoutEmail}`}
              </Button>
              <Button variant="ghost" icon={<Pencil size={15} />} onClick={onGoToMail}>
                Изменить
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Choice({
  icon,
  title,
  description,
  onClick,
  disabled = false,
  primary = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left ring-1 transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-50 ring-[var(--line)]'
          : primary
            ? 'ring-[var(--accent)] hover:bg-[var(--accent-soft)]'
            : 'ring-[var(--line-strong)] hover:bg-[var(--surface-sunken)]'
      }`}
    >
      <span
        className={
          primary && !disabled ? 'mt-0.5 text-[var(--accent)]' : 'mt-0.5 text-[var(--text-muted)]'
        }
      >
        {icon}
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{description}</span>
      </span>
    </button>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-sm">
      <TriangleAlert size={15} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
      <span>{children}</span>
    </p>
  );
}
