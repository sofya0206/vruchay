/**
 * Шаги одного документа: Лист → Получатели → Проверка → Письмо → Выпуск.
 *
 * Порядок здесь один на всё: ленту шагов в рамке документа, адреса,
 * кнопку «Дальше» и текст обучения. Раньше тех же пять сторон стояли
 * в трёх разных порядках в трёх файлах, и человек угадывал, куда идти.
 *
 * Все шаги живут под одним адресом `/documents/:id/…`: документ — одна
 * вещь, а не «макет в документах» плюс «список в письмах». Старые адреса
 * `/mailing/:id?tab=` переводятся сюда — см. shell/redirects.ts.
 */
export const MATERIAL_STEPS = [
  { id: 'sheet', label: 'Лист', segment: '' },
  { id: 'recipients', label: 'Получатели', segment: 'recipients' },
  { id: 'check', label: 'Проверка', segment: 'check' },
  { id: 'letter', label: 'Письмо', segment: 'letter' },
  { id: 'issue', label: 'Выпуск', segment: 'issue' },
] as const;

export type MaterialStep = (typeof MATERIAL_STEPS)[number]['id'];

/**
 * Страницы документа, которые шагами не являются: правила награждения —
 * настройка выпуска для тех, у кого разным строкам положены разные
 * документы. Открываются с шага «Выпуск» и подсвечивают его.
 */
export const MATERIAL_PAGES = {
  rules: { label: 'Правила награждения', segment: 'rules', under: 'issue' as MaterialStep },
} as const;

export type MaterialPage = keyof typeof MATERIAL_PAGES;
export type MaterialView = MaterialStep | MaterialPage;

/** Адрес шага или страницы документа — одно место, где он собирается. */
export function materialPath(documentId: string, view: MaterialView = 'sheet'): string {
  const base = `/documents/${encodeURIComponent(documentId)}`;
  const segment = view in MATERIAL_PAGES ? MATERIAL_PAGES[view as MaterialPage].segment : stepOf(view as MaterialStep).segment;
  return segment ? `${base}/${segment}` : base;
}

function stepOf(id: MaterialStep) {
  return MATERIAL_STEPS.find((s) => s.id === id) ?? MATERIAL_STEPS[0];
}

/** Какой шаг подсвечен в ленте: у страницы — тот, из-под которого она открыта. */
export function stepOfView(view: MaterialView): MaterialStep {
  return view in MATERIAL_PAGES ? MATERIAL_PAGES[view as MaterialPage].under : (view as MaterialStep);
}

export function stepIndex(step: MaterialStep): number {
  return MATERIAL_STEPS.findIndex((s) => s.id === step);
}

/** Следующий шаг; после последнего — null: дальше только сам выпуск. */
export function nextStep(step: MaterialStep): MaterialStep | null {
  const i = stepIndex(step);
  return i >= 0 && i < MATERIAL_STEPS.length - 1 ? MATERIAL_STEPS[i + 1].id : null;
}

export function prevStep(step: MaterialStep): MaterialStep | null {
  const i = stepIndex(step);
  return i > 0 ? MATERIAL_STEPS[i - 1].id : null;
}

/** Шаг по сегменту адреса; незнакомый сегмент — устаревшая ссылка, а не ошибка. */
export function viewOfSegment(segment: string | undefined): MaterialView {
  if (!segment) return 'sheet';
  const step = MATERIAL_STEPS.find((s) => s.segment === segment);
  if (step) return step.id;
  const page = (Object.keys(MATERIAL_PAGES) as MaterialPage[]).find((k) => MATERIAL_PAGES[k].segment === segment);
  return page ?? 'recipients';
}

/**
 * Прежние вкладки рабочего места (`/mailing/:id?tab=`) — в шаги.
 * «Подлинность» стала частью выпуска: срок действия задают там же,
 * где выпускают.
 */
export function legacyWorkspaceTab(tab: string | null | undefined): MaterialView {
  switch (tab) {
    case 'rules':
      return 'rules';
    case 'check':
      return 'check';
    case 'mail':
      return 'letter';
    case 'verify':
      return 'issue';
    default:
      return 'recipients';
  }
}

/** Порядок шагов словами — для обучения, чтобы текст не расходился с лентой. */
export function stepsSentence(): string {
  return MATERIAL_STEPS.map((s) => s.label).join(' → ');
}
