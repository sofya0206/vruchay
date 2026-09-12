/**
 * Вкладки рабочего места материала на «Рассылке».
 *
 * Всё, что относится к списку и к письму, живёт здесь, а не в редакторе
 * макета: файлы почти всегда делают заранее, а рассылают в день
 * награждения, и человеку, пришедшему разослать, незачем идти через лист.
 *
 * Список отдельным модулем, а не разметкой внутри страницы: по нему
 * же разбирается адрес, и вкладка, которую можно назвать в ссылке,
 * не может разойтись с вкладкой, которая нарисована.
 */
export type WorkspaceTab = 'table' | 'rules' | 'check' | 'mail' | 'verify';

export interface WorkspaceTabInfo {
  id: WorkspaceTab;
  label: string;
}

export const WORKSPACE_TABS: WorkspaceTabInfo[] = [
  { id: 'table', label: 'Получатели' },
  { id: 'rules', label: 'Правила' },
  // Между получателями и письмом: проверка идёт после того, как список
  // собран, и до того, как из него что-то выпустят.
  { id: 'check', label: 'Проверка' },
  { id: 'mail', label: 'Письмо' },
  // Подлинность — про уже выданное: срок действия, страница проверки.
  // Живёт здесь, а не в редакторе макета, по той же причине, что и
  // остальные вкладки: это настройки выпуска, а не рисунка на листе.
  { id: 'verify', label: 'Подлинность' },
];

/**
 * Какую вкладку открыть по адресу `?tab=`.
 *
 * Незнакомое значение не ошибка, а устаревшая ссылка: показываем список
 * получателей — то, ради чего сюда приходят чаще всего.
 */
export function workspaceTab(param: string | null): WorkspaceTab {
  const known = WORKSPACE_TABS.find((tab) => tab.id === param);
  return known?.id ?? 'table';
}

/** Адрес рабочего места материала — одно место, где он собирается. */
export function workspacePath(documentId: string, tab: WorkspaceTab = 'table'): string {
  const base = `/mailing/${encodeURIComponent(documentId)}`;
  return tab === 'table' ? base : `${base}?tab=${tab}`;
}

/**
 * Хребет материала — та же лента, но вместе с листом.
 *
 * Лист живёт по своему адресу `/documents/:id`, всё остальное — по
 * `/mailing/:id`, и до сих пор это выглядело как два разных раздела:
 * из редактора к письму приходилось возвращаться на главную. Одна лента
 * над обоими экранами склеивает их обратно в один материал, а адреса
 * остаются прежними — ссылки, разосланные до этого, никуда не ведут мимо.
 */
export type MaterialTab = 'sheet' | WorkspaceTab;

export interface MaterialTabInfo {
  id: MaterialTab;
  label: string;
}

export const MATERIAL_TABS: MaterialTabInfo[] = [{ id: 'sheet', label: 'Лист' }, ...WORKSPACE_TABS];

/** Адрес вкладки материала. Лист — отдельный адрес, остальное — рабочее место. */
export function materialTabPath(documentId: string, tab: MaterialTab): string {
  return tab === 'sheet'
    ? `/documents/${encodeURIComponent(documentId)}`
    : workspacePath(documentId, tab);
}

/**
 * Шаги выпуска — в порядке, в котором их проходят после «Выпустить».
 *
 * Правила, проверка, подлинность и письмо — не четыре независимых
 * раздела, а хвост одного процесса: список собран, дальше решают, кому
 * какой документ, проверяют строки, задают срок действия, пишут письмо —
 * и выпускают. Так это устроено у Certifier и Sertifier: Recipients → Send
 * ведёт через шаги, а не раскладывает настройки по вкладкам, между
 * которыми надо угадывать порядок.
 */
export const ISSUE_STEPS: WorkspaceTab[] = ['rules', 'check', 'verify', 'mail'];

/** Номер шага выпуска, начиная с нуля; -1 — это не шаг (таблица). */
export function issueStep(tab: WorkspaceTab): number {
  return ISSUE_STEPS.indexOf(tab);
}

/** Следующий шаг выпуска; после последнего — сам выпуск, то есть null. */
export function nextIssueStep(tab: WorkspaceTab): WorkspaceTab | null {
  const i = issueStep(tab);
  return i >= 0 && i < ISSUE_STEPS.length - 1 ? ISSUE_STEPS[i + 1] : null;
}
