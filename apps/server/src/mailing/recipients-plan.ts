import { isValidEmail } from '../mail/mail-template';

/**
 * Кому уйдут письма и кому не уйдут — с объяснением по каждому.
 *
 * Вынесено отдельно от отправки намеренно: это единственное место, где
 * решается судьба каждой строки, и его можно проверить тестами без базы,
 * очереди и почтового шлюза. «Отправлено 47 из 50» без разбора оставшихся
 * трёх — это не отчёт, а повод открывать поддержку.
 */

export interface PlanRow {
  id: string;
  data: Record<string, string>;
  lastFileId: string | null;
}

export interface PlannedLetter {
  /** Строка таблицы, если получатель из неё. Для адреса, вбитого руками, — null. */
  rowId: string | null;
  email: string;
  data: Record<string, string>;
  fileId: string | null;
}

export interface SkippedRecipient {
  name: string;
  email: string;
  reason: string;
}

export interface PlanInput {
  /** Откуда берутся получатели: из таблицы документа или списком адресов. */
  source: 'table' | 'manual';
  rows: PlanRow[];
  manualEmails: string[];
  /** Шаблон обещает вложение — без готового файла отправлять нечего. */
  requireFile: boolean;
  /**
   * Адреса, которым по этому материалу уже отправляли. Защита от повторной
   * отправки: человек нажал «Отправить», не дождался и нажал ещё раз —
   * участник получает две одинаковые грамоты и решает, что одна поддельная.
   */
  alreadySent: Set<string>;
  /**
   * Кто дал согласие на рекламу. null — согласие не требуется, это
   * транзакционная отправка. Пустое множество и null — разные вещи:
   * первое означает «рекламу слать некому».
   */
  consented: Set<string> | null;
}

export interface Plan {
  letters: PlannedLetter[];
  skipped: SkippedRecipient[];
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Разбор списка адресов, вставленного человеком.
 *
 * Разделители любые из привычных: перевод строки, запятая, точка с запятой,
 * пробел. Люди вставляют сюда столбец из Excel, строку из «кому» в почте
 * и просто набранное вручную — требовать один формат значит гарантировать
 * ошибку.
 */
export function parseEmailList(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map(normalizeEmail).filter(Boolean))];
}

export function planLetters(input: PlanInput): Plan {
  const letters: PlannedLetter[] = [];
  const skipped: SkippedRecipient[] = [];
  // Один адрес — одно письмо за раз, даже если он встретился в таблице дважды.
  const seen = new Set<string>();

  const candidates =
    input.source === 'table' ? fromTable(input.rows) : fromManualList(input.manualEmails, input.rows);

  for (const candidate of candidates) {
    const reason = refusal(candidate, input, seen);
    if (reason) {
      skipped.push({ name: candidate.name, email: candidate.email, reason });
      continue;
    }
    seen.add(candidate.email);
    letters.push({
      rowId: candidate.rowId,
      email: candidate.email,
      data: candidate.data,
      fileId: input.requireFile ? candidate.fileId : null,
    });
  }

  return { letters, skipped };
}

interface Candidate extends PlannedLetter {
  name: string;
}

function fromTable(rows: PlanRow[]): Candidate[] {
  return rows.map((row) => ({
    rowId: row.id,
    email: normalizeEmail(row.data.email ?? ''),
    data: row.data,
    fileId: row.lastFileId,
    name: row.data.name || '(без имени)',
  }));
}

/**
 * Список адресов, набранный руками.
 *
 * Адрес, который нашёлся в таблице, получает её данные и выпущенный файл:
 * иначе «отправить одному опоздавшему» означало бы письмо без грамоты
 * и с «Здравствуйте, %name» вместо имени.
 */
function fromManualList(emails: string[], rows: PlanRow[]): Candidate[] {
  const byEmail = new Map<string, PlanRow>();
  for (const row of rows) {
    const email = normalizeEmail(row.data.email ?? '');
    // Первое вхождение, а не последнее: в таблице выше обычно та строка,
    // которую человек считает основной.
    if (email && !byEmail.has(email)) byEmail.set(email, row);
  }

  return emails.map((raw) => {
    const email = normalizeEmail(raw);
    const row = byEmail.get(email);
    return {
      rowId: row?.id ?? null,
      email,
      data: row?.data ?? { email },
      fileId: row?.lastFileId ?? null,
      name: row?.data.name || email || '(без имени)',
    };
  });
}

function refusal(candidate: Candidate, input: PlanInput, seen: Set<string>): string | null {
  if (!candidate.email) return 'нет адреса';
  if (!isValidEmail(candidate.email)) return `некорректный адрес «${candidate.email}»`;
  if (seen.has(candidate.email)) return 'адрес уже есть в этой рассылке';
  if (input.alreadySent.has(candidate.email)) {
    return 'по этому материалу письмо на этот адрес уже уходило';
  }
  if (input.consented && !input.consented.has(candidate.email)) {
    return 'нет согласия на рекламную рассылку';
  }
  if (input.requireFile && !candidate.fileId) return 'документ ещё не создан';
  return null;
}
