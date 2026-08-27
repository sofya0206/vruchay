/**
 * Что проверка умеет находить в списке получателей.
 *
 * Живёт в общем пакете, потому что коды нужны обеим сторонам: сервер их
 * ставит, кабинет по ним рисует таблицу и решает, что предложить исправить.
 * Строки для человека тоже здесь — иначе они разъехались бы по двум местам
 * и однажды разошлись бы по смыслу.
 */

export const PROBLEM_CODES = [
  'overflow',
  'required_empty',
  'duplicate_name',
  'duplicate_email',
  'email_invalid',
  'email_mixed_script',
  'date_invalid',
  'name_uppercase',
  'name_not_declined',
  'already_issued',
] as const;

export type ProblemCode = (typeof PROBLEM_CODES)[number];

/**
 * Насколько это мешает выпуску.
 *
 * «blocker» — печатать нельзя: получится брак или письмо не уйдёт.
 * «warning» — печатать можно, но человек, скорее всего, ошибся.
 *
 * Разделение нужно кнопке «Снять отметки с проблемных строк»: она снимает
 * отметки со строк с блокирующими проблемами, но не трогает те, где мы
 * всего лишь подозреваем. Иначе одна строка в верхнем регистре молча
 * выкидывала бы человека из награждения.
 */
export type ProblemSeverity = 'blocker' | 'warning';

export interface ProblemKind {
  code: ProblemCode;
  severity: ProblemSeverity;
  /** Короткое название для колонки «Проблема». */
  title: string;
  /** Чем это кончится, если не исправить, — колонка «Причина». */
  consequence: string;
}

export const PROBLEM_KINDS: Record<ProblemCode, ProblemKind> = {
  overflow: {
    code: 'overflow',
    severity: 'blocker',
    title: 'Не влезает в блок',
    consequence: 'Текст обрежется на печати — часть имени пропадёт с грамоты',
  },
  required_empty: {
    code: 'required_empty',
    severity: 'blocker',
    title: 'Пустое обязательное поле',
    consequence: 'На грамоте останется пустое место там, где должно стоять значение',
  },
  duplicate_name: {
    code: 'duplicate_name',
    severity: 'warning',
    title: 'Повтор ФИО',
    consequence: 'Один человек получит две грамоты, если это не тёзки',
  },
  duplicate_email: {
    code: 'duplicate_email',
    severity: 'warning',
    title: 'Повтор адреса почты',
    consequence: 'На один адрес уйдёт несколько писем',
  },
  email_invalid: {
    code: 'email_invalid',
    severity: 'blocker',
    title: 'Неверный адрес почты',
    consequence: 'Письмо не уйдёт — документ придётся передавать вручную',
  },
  email_mixed_script: {
    code: 'email_mixed_script',
    /*
     * Подозрение, а не запрет.
     *
     * Почти всегда это набранный в русской раскладке адрес, и письмо
     * действительно не дойдёт. Но адрес вида «иван@mail.ru» — кириллица
     * в имени ящика при латинском домене — у российских провайдеров
     * законен и работает. Запрет молча снимал бы такие строки с выпуска
     * кнопкой «снять отметки с проблемных», то есть лишал бы человека
     * грамоты из-за нашей догадки. Показываем и оставляем решать ему.
     */
    severity: 'warning',
    title: 'Русские буквы в адресе',
    consequence:
      'Скорее всего, набрано в русской раскладке и письмо вернётся. ' +
      'У некоторых российских провайдеров такой адрес рабочий — проверьте',
  },
  date_invalid: {
    code: 'date_invalid',
    severity: 'warning',
    title: 'Непонятная дата',
    consequence: 'На грамоте напечатается ровно то, что в ячейке',
  },
  name_uppercase: {
    code: 'name_uppercase',
    severity: 'warning',
    title: 'ФИО прописными',
    // Без примера с выдуманной фамилией: он стоит рядом со строкой про
    // другого человека и читается как ошибка сервиса.
    consequence: 'Прописные попадут на грамоту как есть — обычно так выгружают из протокола',
  },
  name_not_declined: {
    code: 'name_not_declined',
    severity: 'warning',
    title: 'Падеж не подобрался',
    consequence: 'В макете «награждается %name_dat», а имя останется в именительном',
  },
  already_issued: {
    code: 'already_issued',
    severity: 'warning',
    title: 'Уже выдавалось',
    consequence: 'Этому получателю по этому документу уже выпускали грамоту',
  },
};

/** Одна найденная проблема в одной строке. */
export interface RowProblem {
  code: ProblemCode;
  /** Колонка таблицы, к которой относится проблема, если она одна. */
  column: string | null;
  /** Что именно не так — с подставленными числами и значениями. */
  detail: string;
  /**
   * Чем можно заменить значение прямо на месте.
   *
   * Есть не у всех: «не влезает» чинится правкой макета или руками,
   * а «ФИО прописными» и «лишние пробелы» чинятся однозначно.
   */
  suggestion?: string;
}

export interface ValidatedRow {
  rowId: string;
  /** Номер строки в таблице, считая с единицы, — по нему человек её ищет. */
  position: number;
  /** ФИО получателя, чтобы строку можно было узнать в лицо. */
  title: string;
  problems: RowProblem[];
}

/**
 * Остаток квоты организации — тот же, что кабинет показывает на главной.
 *
 * Здесь только факты: сколько выпущено, сколько доступно, сколько отмечено.
 * Никакой цены превышения: доплаты за документы сверх лимита в продукте
 * не существует, выпуск сверх предела просто не состоится. Обещать
 * в проверке доплату, а на кнопке «Выпустить» отвечать отказом — значит
 * соврать человеку в самый неподходящий момент.
 */
export interface QuotaVerdict {
  plan: 'free' | 'paid';
  used: number;
  /** Предел бесплатной пробы; на оплаченном тарифе предела нет. */
  limit: number | null;
  left: number | null;
  /** Сколько строк отмечено к выпуску. */
  adding: number;
}

/**
 * Хватит ли квоты на отмеченные строки.
 *
 * Считается ровно тем же сравнением, каким выпуск решает, пускать или нет
 * (GenerationService.checkFreeLimit): выпущено плюс отмеченное против предела.
 */
export function quotaFits(quota: QuotaVerdict): boolean {
  if (quota.limit === null) return true;
  return quota.used + quota.adding <= quota.limit;
}

export interface BatchValidation {
  /** Всего отмеченных строк. */
  total: number;
  /** Строк без единой проблемы. */
  clean: number;
  /** Строк, которые нельзя выпускать. */
  blocked: number;
  rows: ValidatedRow[];
  quota: QuotaVerdict;
  /**
   * Оговорки к самой проверке: чего она не знает.
   *
   * Показываются рядом с результатом, а не прячутся в журнал: человек
   * должен понимать, на что эта проверка не отвечает, прежде чем нажать
   * «выпустить». Молчаливая проверка внушает больше доверия, чем заслуживает.
   */
  caveats: string[];
}

/** Сколько проблем считаем блокирующими. */
export function countBlockers(row: ValidatedRow): number {
  return row.problems.filter((p) => PROBLEM_KINDS[p.code].severity === 'blocker').length;
}
