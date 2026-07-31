/**
 * Подбор латинского имени переменной по русскому заголовку из файла.
 *
 * Федерации присылают таблицы с шапкой вроде «ФИО», «Электронная почта», «Место».
 * Имя переменной в макете обязано быть латинским (%name), поэтому заголовок
 * нужно во что-то превратить — иначе пользователь будет вручную переименовывать
 * каждую колонку при каждом импорте.
 */

/** Известные соответствия: проверяются по вхождению, порядок важен. */
const KNOWN: [RegExp, string][] = [
  [/^(фио|ф\.и\.о|фамилия имя отчество|участник|спортсмен|полное имя)/i, 'name'],
  [/(e-?mail|почт|электрон)/i, 'email'],
  [/(телефон|моб|phone)/i, 'phone'],
  [/(отчество)/i, 'patronymic'],
  [/^(фамилия|surname)/i, 'surname'],
  [/^(имя|first)/i, 'firstname'],
  [/(мест[оа]|place|rank)/i, 'place'],
  [/(результат|время|result)/i, 'result'],
  [/(разряд|категор|group|катег)/i, 'category'],
  [/(команда|клуб|организац|общество|team|club)/i, 'team'],
  [/(тренер|coach)/i, 'coach'],
  [/(дисциплин|вид|событ|мероприят|курс|семинар)/i, 'event'],
  [/(дата|date)/i, 'date'],
  [/(город|region|регион)/i, 'city'],
  [/(номер|№|id)/i, 'number'],
];

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

function transliterate(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('');
}

/** Приводит произвольный заголовок к допустимому имени переменной. */
export function suggestColumnName(header: string, taken: Set<string> = new Set()): string {
  const trimmed = header.trim();

  let base = '';
  for (const [pattern, name] of KNOWN) {
    if (pattern.test(trimmed)) {
      base = name;
      break;
    }
  }

  if (!base) {
    base = transliterate(trimmed)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^([0-9])/, 'c$1')
      .slice(0, 40);
  }

  if (!base) base = 'column';

  // Одинаковые заголовки встречаются часто («Дата» дважды) — разводим суффиксом.
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}_${n++}`;
  return candidate;
}
