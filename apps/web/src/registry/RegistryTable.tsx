import { ArrowUpRight, ShieldAlert, Trash2 } from 'lucide-react';
import type { RegistryRow } from '../api/registry';
import { StateChip } from './StateChip';
import {
  formatDate,
  mailLabel,
  mailTone,
  retentionLabel,
  stateLabel,
  stateTone,
} from './registry-format';

interface Props {
  rows: RegistryRow[];
  selected: Set<string>;
  onToggle: (fileId: string) => void;
  onToggleAll: () => void;
  onOpen: (fileId: string) => void;
}

/**
 * Таблица выданного.
 *
 * Именно таблица, а не карточки: у строки восемь сведений, и сравнивать их
 * между собой человек будет по столбцам — «кому не дошло письмо», «что
 * выдано в марте». Горизонтальная прокрутка внутри рамки, а не у страницы:
 * иначе на узком экране уезжает вся вёрстка.
 */
export function RegistryTable({ rows, selected, onToggle, onToggleAll, onOpen }: Props) {
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.fileId));

  return (
    <div className="overflow-x-auto rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--line)]">
      <table className="w-full min-w-[64rem] border-collapse">
        <thead>
          <tr className="border-b border-[var(--line)] text-left text-sm tracking-wide text-[var(--text-muted)] uppercase">
            <th className="w-10 px-4 py-3.5">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={onToggleAll}
                aria-label="Отметить все на странице"
                className="size-4 accent-[var(--accent)]"
              />
            </th>
            <th className="px-4 py-3.5 font-medium">Получатель</th>
            <th className="px-4 py-3.5 font-medium">Материал и мероприятие</th>
            <th className="px-4 py-3.5 font-medium">Выдан</th>
            <th className="px-4 py-3.5 font-medium">Письмо</th>
            <th className="px-4 py-3.5 font-medium">Состояние</th>
            <th className="px-4 py-3.5 text-right font-medium">Проверок</th>
            <th className="w-10 px-4 py-3.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const retention = retentionLabel(row.retention);
            return (
              /*
               * Строка целиком открывает карточку.
               *
               * Раньше открывала только стрелка в последнем столбце, и найти
               * её удавалось не всем: человек тыкал в фамилию, ничего не
               * происходило, и выданный документ оставалось только скачать
               * пачкой со всеми остальными. Поддержка делает это каждый день.
               *
               * Отметка и ссылка на замену — свои действия: их нажатие
               * до строки не доходит.
               */
              <tr
                key={row.fileId}
                onClick={() => onOpen(row.fileId)}
                className="cursor-pointer border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface-sunken)]"
              >
                <td className="px-4 py-3.5 align-top" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(row.fileId)}
                    onChange={() => onToggle(row.fileId)}
                    aria-label={`Отметить документ: ${row.name || row.code}`}
                    className="size-4 accent-[var(--accent)]"
                  />
                </td>

                <td className="px-4 py-3.5 align-top">
                  <p className="font-medium">{row.name || 'Без имени'}</p>
                  <p className="text-sm text-[var(--text-muted)]">{row.email || 'без адреса'}</p>
                </td>

                <td className="px-4 py-3.5 align-top">
                  <p>{row.documentTitle}</p>
                  {row.eventName && (
                    <p className="text-sm text-[var(--text-muted)]">{row.eventName}</p>
                  )}
                  {retention && (
                    <p className="mt-1 inline-flex items-center gap-1 text-sm text-[var(--danger)]">
                      <Trash2 size={12} />
                      {retention}
                    </p>
                  )}
                </td>

                <td className="px-4 py-3.5 align-top whitespace-nowrap tabular-nums">
                  {formatDate(row.issuedAt)}
                  {row.expiresAt && (
                    <p className="text-[11px] text-[var(--text-muted)]">
                      до {formatDate(row.expiresAt)}
                    </p>
                  )}
                  <p className="font-mono text-[11px] text-[var(--text-muted)]">
                    {row.code.length > 14 ? row.code.slice(0, 8) : row.code}
                  </p>
                </td>

                <td className="px-4 py-3.5 align-top">
                  <StateChip tone={mailTone(row.mail?.status)}>
                    {mailLabel(row.mail?.status)}
                  </StateChip>
                  {row.mail?.error && (
                    <p className="mt-1 max-w-48 text-sm text-[var(--danger)]">{row.mail.error}</p>
                  )}
                </td>

                <td className="px-4 py-3.5 align-top">
                  <StateChip tone={stateTone(row)}>
                    {row.state === 'revoked' && <ShieldAlert size={12} />}
                    {stateLabel(row)}
                  </StateChip>
                  {row.replacedBy && (
                    <a
                      href={row.replacedBy.verifyPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 block text-xs text-[var(--accent)] hover:underline"
                    >
                      Заменён документом от {formatDate(row.replacedBy.issuedAt)}
                    </a>
                  )}
                </td>

                <td className="px-4 py-3.5 text-right align-top tabular-nums">{row.verifyCount}</td>

                <td className="px-4 py-3.5 align-top">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(row.fileId);
                    }}
                    aria-label={`Открыть карточку: ${row.name || row.code}`}
                    className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                  >
                    <ArrowUpRight size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
