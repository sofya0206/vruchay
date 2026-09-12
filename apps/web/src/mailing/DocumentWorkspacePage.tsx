import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleHelp } from 'lucide-react';
import { api } from '../api/client';
import type { DocumentDetail } from '../api/types';
import { Loading } from '../ui/Loading';
import { Button } from '../ui/Button';
import { RecipientsTable } from '../recipients/RecipientsTable';
import { RulesTab } from '../awards/RulesTab';
import { ValidationScreen } from '../validation/ValidationScreen';
import { EmailTemplateEditor } from '../mail/EmailTemplateEditor';
import { VerifyPanel } from '../verify/VerifyPanel';
import { DocumentChrome } from '../editor/DocumentChrome';
import { useDocumentFileMenu } from '../editor/DocumentFileMenu';
import type { MenuDef } from '../editor/MenuBar';
import {
  ISSUE_STEPS,
  WORKSPACE_TABS,
  issueStep,
  nextIssueStep,
  workspacePath,
  workspaceTab,
  type WorkspaceTab,
} from './workspace-tabs';

/**
 * Рабочее место материала: таблица и шаги выпуска.
 *
 * Всё это раньше жило вкладками в редакторе макета, рядом с холстом.
 * Разделение не косметическое: макет рисуют заранее и один раз, а список
 * собирают и рассылают в день награждения — часто другой человек и почти
 * всегда в спешке. Ему нечего делать в редакторе, где любое случайное
 * движение мышью сдвигает чужой блок на листе.
 *
 * Правила, проверка, подлинность и письмо — не вкладки рядом с таблицей,
 * а шаги одного выпуска: «Выпустить» из таблицы ведёт по ним по порядку,
 * а в конце открывает сам выпуск. Каждый шаг остаётся по своему адресу
 * `?tab=`, чтобы на него можно было сослаться и прийти из меню «Данные».
 *
 * Реестра здесь нет намеренно: выданное ищется в общем «Реестре» отбором
 * по материалу, а не отдельной таблицей внутри каждого материала.
 */
export function DocumentWorkspacePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = workspaceTab(params.get('tab'));
  // Последний шаг привёл обратно к таблице с просьбой открыть выпуск.
  const startIssue = params.get('issue') === '1';

  const doc = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.get<DocumentDetail>(`/documents/${id}`),
  });

  const fileMenu = useDocumentFileMenu(doc.data);

  /*
   * Вкладку держим в адресе, а не в состоянии: на неё можно сослаться,
   * а «Назад» в браузере возвращает на предыдущий шаг, а не выбрасывает
   * со страницы целиком.
   */
  function open(next: WorkspaceTab) {
    setParams(next === 'table' ? {} : { tab: next }, { replace: true });
  }

  function forward() {
    const next = nextIssueStep(tab);
    if (next) open(next);
    else navigate(`${workspacePath(id)}?issue=1`);
  }

  if (doc.isPending) return <Loading />;
  if (!doc.data) return <p className="p-6 text-[var(--text-muted)]">Материал не найден</p>;

  const page = doc.data;

  if (tab === 'table') {
    return (
      <RecipientsTable
        doc={page}
        onOpen={open}
        onIssue={() => open(ISSUE_STEPS[0])}
        startIssue={startIssue}
        onIssueStarted={() => setParams({}, { replace: true })}
        onGoToRegistry={() => navigate(`/registry?documentId=${encodeURIComponent(id)}`)}
      />
    );
  }

  const menus: MenuDef[] = [
    { id: 'file', label: 'Файл', entries: fileMenu.entries },
    {
      id: 'help',
      label: 'Справка',
      entries: [
        {
          icon: <CircleHelp size={16} />,
          label: 'Показать справку',
          onSelect: () => navigate('/docs'),
        },
      ],
    },
  ];

  const step = issueStep(tab);
  const last = step === ISSUE_STEPS.length - 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DocumentChrome
        documentId={id}
        title={page.title}
        menus={menus}
        tab={tab}
        right={
          /* Шаги выпуска — в рамке, на месте «Редактор — Таблица»: где
             человек в выпуске и что дальше. Шаги — ссылки, чтобы вернуться
             к правилам с письма одним нажатием, а не «назад» три раза. */
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2 self-center">
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-1" aria-label="Шаги выпуска">
              {ISSUE_STEPS.map((s, i) => {
                const label = WORKSPACE_TABS.find((t) => t.id === s)?.label ?? s;
                const current = s === tab;
                const done = i < step;
                return (
                  <li key={s} className="flex items-center">
                    <Link
                      to={workspacePath(id, s)}
                      aria-current={current ? 'step' : undefined}
                      className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                        current
                          ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                          : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span
                        className={`grid h-5 w-5 place-items-center rounded-full text-xs tabular-nums ${
                          current
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                            : done
                              ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                              : 'bg-[var(--surface-sunken)] text-[var(--text-muted)]'
                        }`}
                      >
                        {i + 1}
                      </span>
                      {label}
                    </Link>
                    {i < ISSUE_STEPS.length - 1 && (
                      <span aria-hidden className="mx-1 text-[var(--line-strong)]">
                        ›
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            <Button variant="primary" size="sm" onClick={forward}>
              {last ? 'Выпустить' : 'Далее'}
              <ArrowRight size={15} />
            </Button>
          </div>
        }
      />

      {tab === 'rules' ? (
        <RulesTab documentId={id} ruleSetId={page.ruleSetId ?? null} />
      ) : tab === 'check' ? (
        <ValidationScreen documentId={id} onDone={forward} />
      ) : tab === 'mail' ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <EmailTemplateEditor documentId={id} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <VerifyPanel doc={page} />
        </div>
      )}

      {fileMenu.dialogs}
    </div>
  );
}
