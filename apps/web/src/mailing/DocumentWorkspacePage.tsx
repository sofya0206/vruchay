import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, PenLine, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import type { DocumentDetail } from '../api/types';
import { Loading } from '../ui/Loading';
import { RecipientsTable } from '../recipients/RecipientsTable';
import { RulesTab } from '../awards/RulesTab';
import { ValidationScreen } from '../validation/ValidationScreen';
import { EmailTemplateEditor } from '../mail/EmailTemplateEditor';
import { VerifyPanel } from '../verify/VerifyPanel';
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-[var(--line)] bg-[var(--surface)] px-6 py-3">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <Link
            to="/mailing"
            className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            <ChevronLeft size={16} />
            Рассылка
          </Link>

          <h1 className="font-serif text-lg">{page.title}</h1>

          <div className="ml-auto flex items-center gap-2">
            {/* Обратная дорога к листу. Нужна ровно тогда, когда проверка
                показала, что фамилия не влезает в блок: чинится это
                в макете, а не в таблице. */}
            <Link
              to={`/documents/${id}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
            >
              <PenLine size={15} />
              Правка макета
            </Link>
            <Link
              to={`/registry?documentId=${encodeURIComponent(id)}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
            >
              <ShieldCheck size={15} />
              Выданное
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-2 flex max-w-5xl gap-1">
          {WORKSPACE_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => open(item.id)}
              aria-current={tab === item.id}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                tab === item.id
                  ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'rules' ? (
        <RulesTab documentId={id} ruleSetId={page.ruleSetId ?? null} />
      ) : tab === 'check' ? (
        <ValidationScreen documentId={id} onDone={() => open('table')} />
      ) : tab === 'mail' ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <EmailTemplateEditor documentId={id} />
        </div>
      ) : tab === 'verify' ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <VerifyPanel doc={page} />
        </div>
      ) : (
        <RecipientsTable
          documentId={id}
          onGoToMail={() => open('mail')}
          onGoToCheck={() => open('check')}
          onGoToRegistry={() => navigate(`/registry?documentId=${encodeURIComponent(id)}`)}
        />
      )}
    </div>
  );
}
