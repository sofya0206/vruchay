import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, CircleHelp, Mail, ListChecks, ShieldCheck, Sparkles, Table2 } from 'lucide-react';
import { api } from '../api/client';
import type { DocumentDetail } from '../api/types';
import { Loading } from '../ui/Loading';
import { RecipientsTable } from '../recipients/RecipientsTable';
import { RulesTab } from '../awards/RulesTab';
import { ValidationScreen } from '../validation/ValidationScreen';
import { EmailTemplateEditor } from '../mail/EmailTemplateEditor';
import { VerifyPanel } from '../verify/VerifyPanel';
import { DocumentChrome } from '../editor/DocumentChrome';
import { useDocumentFileMenu } from '../editor/DocumentFileMenu';
import type { MenuDef } from '../editor/MenuBar';
import { WORKSPACE_TABS, workspaceTab, type WorkspaceTab } from './workspace-tabs';

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
 * Ленты закладок над экраном больше нет: у материала две стороны — лист
 * и таблица, и переключатель между ними стоит в рамке страницы. Правила,
 * проверка, письмо и подлинность — не третья и не четвёртая сторона,
 * а настройки выпуска, и живут они в меню «Данные» над таблицей.
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
  const menus: MenuDef[] = [
    { id: 'file', label: 'Файл', entries: fileMenu.entries },
    {
      id: 'data',
      label: 'Данные',
      entries: [
        { icon: <Table2 size={16} />, label: 'Вернуться к таблице', onSelect: () => open('table') },
        { separator: true },
        { icon: <Sparkles size={16} />, label: 'Правила награждения', onSelect: () => open('rules') },
        { icon: <ListChecks size={16} />, label: 'Проверить строки', onSelect: () => open('check') },
        { icon: <Mail size={16} />, label: 'Письмо участнику', onSelect: () => open('mail') },
        {
          icon: <ShieldCheck size={16} />,
          label: 'Подлинность документа',
          onSelect: () => open('verify'),
        },
      ],
    },
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

  const title = WORKSPACE_TABS.find((t) => t.id === tab)?.label ?? '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DocumentChrome documentId={id} title={page.title} menus={menus} view="table" />

      {/* Где человек находится и как вернуться — одной строкой. Заменяет
          ленту закладок: у настроек выпуска один вход, из таблицы. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm">
        <button
          type="button"
          onClick={() => open('table')}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
        >
          <ChevronLeft size={15} />
          Таблица
        </button>
        <span aria-hidden className="text-[var(--line-strong)]">
          /
        </span>
        <span className="font-medium">{title}</span>
      </div>

      {tab === 'rules' ? (
        <RulesTab documentId={id} ruleSetId={page.ruleSetId ?? null} />
      ) : tab === 'check' ? (
        <ValidationScreen documentId={id} onDone={() => open('table')} />
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
