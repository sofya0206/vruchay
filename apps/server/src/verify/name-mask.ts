import { shortName } from '@gramota/shared';

/**
 * Что из отмеченных материалом полей показать постороннему.
 *
 * Режим задаёт организация на всё выданное (Organization.verifyNameMode):
 * страница проверки открыта без входа, и решение «сколько персональных
 * данных отдавать любому, кто знает код» принимает оператор, а не
 * сотрудник, отмечавший галочки в конкретном материале.
 *
 * - `full` — как отмечено в материале;
 * - `initials` — поля с именем сворачиваются до фамилии и инициалов,
 *   остальные (клуб, место, город) остаются;
 * - `none` — ничего о получателе: только факт подлинности и организация.
 *
 * Адрес почты, телефон и дата рождения не показываются ни в каком режиме —
 * даже если материал их отметил: перебор кодов не должен превращаться
 * в выгрузку списка участников.
 */
export type VerifyNameMode = 'full' | 'initials' | 'none';

/** Колонки, в которых лежит имя человека — их и сворачиваем до инициалов. */
const NAME_KEYS = new Set([
  'name',
  'fio',
  'full_name',
  'fullname',
  'фио',
  'name_dat',
  'name_gen',
  'name_short',
  'name_lat_gost',
  'name_lat_icao',
]);

/** Никогда наружу, что бы ни отметили в материале. */
const NEVER_KEYS = new Set([
  'email',
  'e-mail',
  'mail',
  'phone',
  'tel',
  'telephone',
  'birthday',
  'birth_date',
  'birthdate',
  'dob',
  'passport',
  'snils',
  'inn',
]);

export function maskVerifyFields(
  fields: Record<string, string>,
  mode: VerifyNameMode,
): Record<string, string> {
  if (mode === 'none') return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    const lower = key.toLowerCase();
    if (NEVER_KEYS.has(lower)) continue;
    if (mode === 'initials' && NAME_KEYS.has(lower)) {
      const short = shortName(value);
      if (short) out[key] = short;
      continue;
    }
    out[key] = value;
  }
  return out;
}
