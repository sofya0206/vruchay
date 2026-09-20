import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { DocumentDetail } from '../api/types';
import { Loading } from '../ui/Loading';
import { NextAction } from '../ui/NextAction';
import { RecipientsTable } from '../recipients/RecipientsTable';
import { RulesTab } from '../awards/RulesTab';
import { ValidationScreen } from '../validation/ValidationScreen';
import { EmailTemplateEditor } from '../mail/EmailTemplateEditor';
import { DocumentChrome } from '../editor/DocumentChrome';
import { FieldsSidebar, type FieldTarget } from '../editor/FieldsSidebar';
import { useFieldsPanelOpen } from '../editor/fields-sidebar-store';
import { useDocumentFileMenu } from '../editor/DocumentFileMenu';
import { workspacePath, type WorkspaceTab } from '../mailing/workspace-tabs';
import { IssueStep } from './IssuePage';
import { materialPath, nextStep, viewOfSegment } from './material-steps';
import { FileX2 } from 'lucide-react';

/**
 * Документ на любом шаге, кроме листа: получатели, проверка, письмо,
 * выпуск и правила награждения.
 *
 * Лист живёт своим экраном (EditorPage): у него своя высота, холст и
 * панели. Всё остальное — здесь, под одной рамкой с лентой шагов. Раньше
 * это было «рабочее место» по другому адресу, и из редактора к письму
 * ходили через главную.
 *
 * Реестра здесь нет намеренно: выданное ищется в общем «Реестре» отбором
 * по документу, а не отдельной таблицей внутри каждого.
 */
export function MaterialPage() {
  const { id = '', segment } = useParams();
  const navigate = useNavigate();
  const view = viewOfSegment(segment);

  const doc = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.get<DocumentDetail>(`/documents/${id}`),
  });

  const fileMenu = useDocumentFileMenu(doc.data);
  /** Куда вставляет панель полей: письмо отдаёт свою каретку. */
  const [fieldTarget, setFieldTarget] = useState<FieldTarget | null>(null);
  const fieldsOpen = useFieldsPanelOpen();

  if (view === 'sheet') return <Navigate to={materialPath(id)} replace />;
  if (doc.isPending) return <Loading />;
  if (!doc.data) {
    return (
      <NextAction
        icon={FileX2}
        title="Документ не найден"
        text="Его удалили или ссылка неполная."
        primary={{ label: 'К документам', to: '/documents' }}
      />
    );
  }

  const page = doc.data;
  const openLegacy = (tab: WorkspaceTab) => navigate(workspacePath(id, tab));

  if (view === 'recipients') {
    return (
      <RecipientsTable
        doc={page}
        onOpen={openLegacy}
        onGoToRegistry={() => navigate(`/registry?documentId=${encodeURIComponent(id)}`)}
      />
    );
  }

  const next = view === 'rules' ? null : nextStep(view);

  return (
    // Высота — точным счётом, а не `h-full`: оболочка кабинета не задаёт
    // высоту своей колонке, поэтому опереться на неё через `h-full` не на что.
    <div className="flex h-[calc(100dvh-var(--app-header))] min-h-0 flex-col">
      <DocumentChrome
        documentId={id}
        title={page.title}
        isTemplate={page.isTemplate}
        actions={fileMenu.entries}
        view={view}
        action={view === 'issue' ? null : undefined}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          {view === 'rules' ? (
            <RulesTab documentId={id} ruleSetId={page.ruleSetId ?? null} />
          ) : view === 'check' ? (
            <ValidationScreen documentId={id} onDone={() => navigate(materialPath(id, next ?? 'issue'))} />
          ) : view === 'letter' ? (
            <EmailTemplateEditor documentId={id} onFieldTarget={setFieldTarget} />
          ) : (
            <IssueStep doc={page} />
          )}
        </div>
        {/* Поля вставляют в письмо; на правилах, проверке и выпуске вставлять некуда. */}
        {fieldsOpen && view === 'letter' && <FieldsSidebar documentId={id} target={fieldTarget ?? undefined} />}
      </div>

      {fileMenu.dialogs}
    </div>
  );
}
