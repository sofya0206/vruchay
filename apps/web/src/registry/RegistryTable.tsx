import { ArrowUpRight, ShieldAlert, Trash2 } from 'lucide-react';
import type { RegistryRow } from '../api/registry';
import { StatusChip } from '../ui/Field';
import { Checkbox } from '../ui/Checkbox';
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
    <>
    {/* На телефоне — карточками: таблица в 1024 точки показывала одни имена,
        а состояние и письмо оставались за краем. Тап открывает историю. */}
    <ul className="card divide-y divide-[var(--line)] overflow-hidden md:hidden">
      {rows.map((row) => (
        <li key={row.fileId} className="flex items-start gap-3 px-3 py-3" onClick={() => onOpen(row.fileId)}>
          <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={selected.has(row.fileId)} onChange={() => onToggle(row.fileId)} aria-label={`Отметить ${row.name}`} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">{row.name}</span>
                <span className="block truncate text-xs text-[var(--text-muted)]">{row.documentTitle}</span>
              </span>
              <StatusChip tone={stateTone(row)}>{stateLabel(row)}</StatusChip>
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
              <StatusChip tone={mailTone(row.mail?.status)}>{mailLabel(row.mail?.status)}</StatusChip>
              <span className="tabular-nums">{formatDate(row.issuedAt)}</span>
              <span className="tabular-nums">{row.verifyCount} пров.</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
    <div className="card overflow-x-auto max-md:hidden">
      <table className="w-full min-w-[64rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] text-left text-xs tracking-wide text-[var(--text-muted)] uppercase">
            <th className="w-10 px-3 py-3">
              <Checkbox
                checked={allChecked}
                onChange={onToggleAll}
                aria-label="Отметить все на странице"
              />
            </th>
            <th className="px-3 py-3 font-medium">Получатель</th>
            <th className="px-3 py-3 font-medium">Материал и мероприятие</th>
            <th className="px-3 py-3 font-medium">Выдан</th>
            <th className="px-3 py-3 font-medium">Письмо</th>
            <th className="px-3 py-3 font-medium">Состояние</th>
            <th className="px-3 py-3 text-right font-medium">Проверок</th>
            <th className="w-10 px-3 py-3" />
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
                <td className="px-3 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(row.fileId)}
                    onChange={() => onToggle(row.fileId)}
                    aria-label={`Отметить документ: ${row.name || row.code}`}
                  />
                </td>

                <td className="px-3 py-3 align-top">
                  <p className="font-medium">{row.name || 'Без имени'}</p>
                  <p className="text-xs text-[var(--text-muted)]">{row.email || 'без адреса'}</p>
                </td>

                <td className="px-3 py-3 align-top">
                  <p>{row.documentTitle}</p>
                  {row.eventName && (
                    <p className="text-xs text-[var(--text-muted)]">{row.eventName}</p>
                  )}
                  {retention && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--danger)]">
                      <Trash2 size={12} />
                      {retention}
                    </p>
                  )}
                </td>

                <td className="px-3 py-3 align-top whitespace-nowrap tabular-nums">
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

                <td className="px-3 py-3 align-top">
                  <StatusChip tone={mailTone(row.mail?.status)}>
                    {mailLabel(row.mail?.status)}
                  </StatusChip>
                  {row.mail?.error && (
                    <p className="mt-1 max-w-48 text-xs text-[var(--danger)]">{row.mail.error}</p>
                  )}
                </td>

                <td className="px-3 py-3 align-top">
                  <StatusChip tone={stateTone(row)}>
                    {row.state === 'revoked' && <ShieldAlert size={12} />}
                    {stateLabel(row)}
                  </StatusChip>
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

                <td className="px-3 py-3 text-right align-top tabular-nums">{row.verifyCount}</td>

                <td className="px-3 py-3 align-top">
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
    </>
  );
}
