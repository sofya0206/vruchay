/**
 * Разбор сопоставления колонок — отдельно от окна импорта.
 *
 * Здесь нет ни состояния, ни разметки: только правила, по которым колонки
 * файла превращаются в переменные макета. Так их можно проверить тестами,
 * не поднимая браузер, а окно остаётся тонким.
 */

/** Имя переменной: то же правило, что у columnName на сервере. */
export const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** Части ФИО в том порядке, в каком они читаются на грамоте. */
export const FULL_NAME_PARTS = ['surname', 'firstname', 'patronymic'];

/**
 * Ключ, по которому помним введённое руками имя.
 *
 * Не индекс колонки, а заголовок: файл перезаливают после правок, и колонки
 * в нём запросто меняются местами. Одного заголовка тоже мало — «Дата»
 * в шапке встречается дважды, и без номера повторения обе колонки
 * получили бы одно запомненное имя.
 */
export function columnKey(columns: { source: string }[], index: number): string {
  const source = columns[index].source;
  const occurrence = columns.slice(0, index).filter((c) => c.source === source).length;
  return occurrence === 0 ? source : `${source}#${occurrence}`;
}

/**
 * С чего начинается окно: запомненное имя, иначе предложенное сервисом.
 *
 * Пустое запомненное значение игнорируем. Иначе однажды очищенное поле
 * возвращалось бы пустым при каждой следующей загрузке, а кнопка импорта
 * оставалась бы заблокированной без единого объяснения.
 */
export function initialNames(
  columns: { source: string; suggested: string }[],
  remembered: Record<string, string>,
): string[] {
  return columns.map((column, i) => {
    const saved = remembered[columnKey(columns, i)];
    return saved && saved.trim() ? saved : column.suggested;
  });
}

/**
 * Есть ли что склеивать в ФИО.
 *
 * Отчество необязательно — его часто просто нет в файле. А вот готовая
 * колонка `name` отменяет предложение: двух одинаковых имён переменной
 * сервер не примет, и предлагать заведомо неисполнимое незачем.
 */
export function canMergeFullName(names: string[]): boolean {
  return names.includes('surname') && names.includes('firstname') && !names.includes('name');
}

/**
 * Итоговые колонки и строки с учётом склейки ФИО.
 *
 * Склейка делается на клиенте: сервер принимает уже готовый список колонок
 * и строк, и отдельный формат «эта колонка собрана из трёх» пришлось бы
 * тащить через контракт импорта ради одного случая.
 *
 * Порядок частей — фамилия, имя, отчество, независимо от порядка колонок
 * в файле: на грамоте пишут «Иванов Иван Иванович», даже если в таблице
 * имя стояло первым.
 */
export function applyMerge(
  names: string[],
  rows: string[][],
  merge: boolean,
): { columns: string[]; rows: string[][] } {
  if (!merge || !canMergeFullName(names)) return { columns: names, rows };

  const parts = FULL_NAME_PARTS.map((p) => names.indexOf(p)).filter((i) => i >= 0);
  const anchor = Math.min(...parts);

  const columns: string[] = [];
  // Для каждой итоговой колонки — из каких исходных она собрана.
  const sources: number[][] = [];
  names.forEach((name, i) => {
    if (i === anchor) {
      columns.push('name');
      sources.push(parts);
      return;
    }
    if (parts.includes(i)) return;
    columns.push(name);
    sources.push([i]);
  });

  return {
    columns,
    rows: rows.map((row) =>
      sources.map((from) =>
        from
          .map((i) => (row[i] ?? '').trim())
          .filter(Boolean)
          .join(' '),
      ),
    ),
  };
}

/**
 * Сколько колонок доедет до таблицы получателей.
 *
 * Считаем по результату, а не по колонкам файла: при склейке ФИО трёх
 * колонок файла соответствует одна переменная, и «5 из 5» на трёх
 * переменных было бы неправдой.
 */
export function countBound(columns: string[]): number {
  return columns.filter((n, i) => n && NAME_RE.test(n) && columns.indexOf(n) === i).length;
}
