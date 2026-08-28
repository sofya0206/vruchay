import { mergeVariables, SAMPLE_RECIPIENT, type EventFields } from '@gramota/shared';

/**
 * Значения переменных для холста редактора.
 *
 * Раньше редактор рисовал сами токены: на листе стояло «%event», хотя
 * название мероприятия уже вписано в панель справа. Человек видел
 * не документ, а его исходник, и проверить вёрстку — влезает ли название
 * в строку, не наезжает ли на рамку — было нечем.
 *
 * Мероприятие, организация и дата здесь настоящие: они уже известны.
 * Колонки получателя — образец, пока список не загружен; как только
 * в нём появилась первая строка, берём её, чтобы на листе стояли
 * те же слова, что уйдут в печать.
 *
 * Пустые значения из ответа выбрасываем: подстановка на холсте оставляет
 * вместо ненайденной переменной сам токен, и «%event» на месте пустого
 * поля показывает, чего не хватает, тогда как пустое место читалось бы
 * как сломавшийся блок.
 */
export function canvasPreviewData(input: {
  /** Первая строка списка получателей, если список уже заведён. */
  row?: Record<string, string>;
  orgName?: string;
  event?: EventFields;
  issuedAt: Date;
}): Record<string, string> {
  const row = input.row && Object.keys(input.row).length > 0 ? input.row : SAMPLE_RECIPIENT;

  const merged = mergeVariables(row, {
    issuedAt: input.issuedAt,
    // Первый в списке: номер на холсте должен быть настоящим числом,
    // иначе не видно, влезает ли он в отведённый блок.
    number: 1,
    // Проверочный код выделяется в момент выпуска — до него его нет,
    // и на холсте вместо него остаётся «%code».
    publicId: null,
    orgName: input.orgName,
    event: input.event,
  });

  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value.trim() !== ''));
}
