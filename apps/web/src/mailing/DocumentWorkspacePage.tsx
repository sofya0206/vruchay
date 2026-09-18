import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { DocumentDetail } from '../api/types';
import { Loading } from '../ui/Loading';
import { RecipientsTable } from '../recipients/RecipientsTable';
import { RulesTab } from '../awards/RulesTab';
import { ValidationScreen } from '../validation/ValidationScreen';
import { EmailTemplateEditor } from '../mail/EmailTemplateEditor';
import { VerifyPanel } from '../verify/VerifyPanel';
import { DocumentChrome } from '../editor/DocumentChrome';
import { FieldsSidebar, type FieldTarget } from '../editor/FieldsSidebar';
import { useFieldsPanelOpen } from '../editor/fields-sidebar-store';
import { useDocumentFileMenu } from '../editor/DocumentFileMenu';
import { workspaceTab, type WorkspaceTab } from './workspace-tabs';

/**
 * Рабочее место материала: список, правила, проверка, письмо.
 *
 * Всё это раньше жило вкладками в редакторе макета, рядом с холстом.
 * Разделение не косметическое: макет рисуют заранее и один раз, а список
 * собирают и рассылают в день награждения — часто другой человек и почти
 * всегда в спешке. Ему нечего делать в редакторе, где любое случайное
 * движение мышью сдвигает чужой блок на листе.
 *
 * Реестра здесь нет намеренно: выданное ищется в общем «Реестре» отбором
 * по материалу, а не отдельной таблицей внутри каждого материала — иначе
 * «найдите грамоту Ивановой» опять означает обойти материалы по очереди.
 *
 * Где человек находится, говорит лента вкладок в рамке страницы: она же
 * стоит над листом, и переход «лист → письмо» стал одним нажатием вместо
 * дороги через главную.
 */
export function DocumentWorkspacePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = workspaceTab(params.get('tab'));

  const doc = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.get<DocumentDetail>(`/documents/${id}`),
  });

  const fileMenu = useDocumentFileMenu(doc.data);
  /** Куда вставляет панель полей: письмо отдаёт свою каретку. */
  const [fieldTarget, setFieldTarget] = useState<FieldTarget | null>(null);
  const fieldsOpen = useFieldsPanelOpen();

  /*
   * Вкладку держим в адресе, а не в состоянии.
   *
   * Так на неё можно сослаться: «настрой письмо вот здесь» уходит ссылкой
   * коллеге, а «Назад» в браузере возвращает на предыдущую вкладку,
   * а не выбрасывает со страницы целиком.
   */
  function open(next: WorkspaceTab) {
    setParams(next === 'table' ? {} : { tab: next }, { replace: true });
  }

  if (doc.isPending) return <Loading />;
  if (!doc.data) return <p className="p-6 text-[var(--text-muted)]">Материал не найден</p>;

  const page = doc.data;

  if (tab === 'table') {
    return (
      <RecipientsTable
        doc={page}
        onOpen={open}
        onGoToRegistry={() => navigate(`/registry?documentId=${encodeURIComponent(id)}`)}
      />
    );
  }

  /* Настройки выпуска: у каждой своя страница, рамка у всех одна. */
  return (
    // Высота — точным счётом, а не `h-full`: оболочка кабинета не задаёт
    // высоту своей колонке (иначе колонка разделов теряла прилипание
    // на длинных страницах), поэтому опереться на неё через `h-full` больше
    // не на что.
    <div className="flex h-[calc(100dvh-var(--app-header))] min-h-0 flex-col">
      <DocumentChrome
        documentId={id}
        title={page.title}
        actions={fileMenu.entries}
        tab={tab}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {tab === 'rules' ? (
            <RulesTab documentId={id} ruleSetId={page.ruleSetId ?? null} />
          ) : tab === 'check' ? (
            <ValidationScreen documentId={id} onDone={() => open('table')} />
          ) : tab === 'mail' ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <EmailTemplateEditor documentId={id} onFieldTarget={setFieldTarget} />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <VerifyPanel doc={page} />
            </div>
          )}
        </div>
        {fieldsOpen && (
          <FieldsSidebar documentId={id} target={tab === 'mail' ? (fieldTarget ?? undefined) : undefined} />
        )}
      </div>

      {fileMenu.dialogs}
    </div>
  );
}
