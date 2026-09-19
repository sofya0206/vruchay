/**
 * Сколько разных адресов во вставленном списке.
 *
 * Разбор тот же, что у сервера (recipients-plan.ts): перевод строки,
 * запятая, точка с запятой, пробел; регистр не различается. Число
 * рядом с полем — подсказка, решает всё равно сервер.
 */
export function parseEmailCount(raw: string): number {
  return new Set(
    raw
      .split(/[\s,;]+/)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  ).size;
}
