import { SYSTEM_VARIABLES, VARIABLE_RE } from '@gramota/shared';

/** Откуда берётся значение переменной — по-человечески. */
const EVENT_VARIABLES = new Set(['event', 'event_date', 'event_place', 'hours']);

function source(name: string): string {
  if (EVENT_VARIABLES.has(name)) return 'из сведений о мероприятии';
  if (name === 'name_dat') return 'из колонки «ФИО», склоняется само';
  if (SYSTEM_VARIABLES.some((v) => v.name === name)) return 'подставит сервис';
  return 'из колонки списка получателей';
}

/**
 * Что подставится в этот блок и откуда.
 *
 * Раньше здесь стояла неподвижная строчка «переменная подставит данные
 * получателя: %name» — независимо от того, что в блоке написано.
 * Она отвечала на вопрос, которого человек не задавал, и молчала о том,
 * который задавал: «а это откуда возьмётся?». Особенно для %event,
 * значение которого лежит вообще не в таблице, а в свойствах материала,
 * и найти это место без подсказки неоткуда.
 */
export function VariableHint({ text }: { text: string }) {
  const used = [...new Set([...text.matchAll(VARIABLE_RE)].map((m) => m[1]))];

  if (used.length === 0) {
    return (
      <span className="mt-1.5 block text-xs text-[var(--text-muted)]">
        Обычный текст — напечатается как есть. Чтобы подставлялись данные
        участника, вставьте переменную через «Вставить».
      </span>
    );
  }

  return (
    <span className="mt-1.5 block space-y-0.5 text-xs text-[var(--text-muted)]">
      {used.map((name) => (
        <span key={name} className="block">
          <code className="rounded bg-[var(--surface-sunken)] px-1 font-mono">%{name}</code>{' '}
          — {source(name)}
        </span>
      ))}
    </span>
  );
}
