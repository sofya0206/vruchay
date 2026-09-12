/**
 * Арифметика числового поля. Без разметки — её и проверяем тестами.
 */

/**
 * Знаков после запятой в десятичной записи.
 *
 * Экспоненциальная запись нам не встречается: шаги в проекте от 0.05 до 5.
 * Но если такое значение всё же придёт, считаем «знаков много» — тогда
 * множитель заведомо не огрубит результат.
 */
function decimalsOf(n: number): number {
  const s = String(n);
  if (s.includes('e')) return 10;
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/**
 * Прибавляет шаг без мусора в хвосте.
 *
 * `1.2 + 0.05` в двоичной плавающей точке даёт 1.2500000000000002. Это
 * значение не остаётся в поле: оно уезжает в макет, в JSON листа и на
 * печать — межстрочный «1.2500000000000002» переживёт и сохранение,
 * и перевыпуск. Считаем в целых, множитель берём по самому дробному
 * из двух слагаемых.
 */
export function addStep(value: number, delta: number): number {
  const factor = 10 ** Math.max(decimalsOf(value), decimalsOf(delta));
  return (Math.round(value * factor) + Math.round(delta * factor)) / factor;
}

export function clamp(value: number, min = -Infinity, max = Infinity): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Разбор набранного.
 *
 * Запятую принимаем: на русской раскладке жмут именно её, а нативное
 * числовое поле молча отдавало за неё пустую строку — человек печатал
 * «1,5», получал ноль и не понимал, почему.
 *
 * Незаконченный набор («-», «1.», пусто) — это ещё не число: возвращаем
 * null, чтобы наверх ушло только законченное значение.
 */
export function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
