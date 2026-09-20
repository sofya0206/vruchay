import { ArrowUpRight } from 'lucide-react';
import type { RegistryRow } from '../api/registry';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Checkbox';
import { IconButton } from '../ui/IconButton';
import { TBody, THead, Table, Td, Th, Tr } from '../ui/Table';
import { cn } from '../ui/cn';
import {
  badgeTone,
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
 * выдано в марте». На телефоне таблица из восьми колонок показывала одни
 * имена, поэтому там те же строки идут карточками, и тап открывает историю.
 */
export function RegistryTable({ rows, selected, onToggle, onToggleAll, onOpen }: Props) {
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.fileId));

  return (
    <Card padding="none" className="overflow-hidden">
      <Table
        caption="Выданные документы"
        cards={
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <CardRow
                key={row.fileId}
                row={row}
                checked={selected.has(row.fileId)}
                onToggle={() => onToggle(row.fileId)}
                onOpen={() => onOpen(row.fileId)}
              />
            ))}
          </ul>
        }
      >
        <THead>
          <Tr>
            <Th width={44}>
              <Checkbox
                checked={allChecked}
                onChange={onToggleAll}
                aria-label="Отметить все на странице"
              />
            </Th>
            <Th>Получатель</Th>
            <Th>Материал и мероприятие</Th>
            <Th>Выдан</Th>
            <Th>Письмо</Th>
            <Th>Состояние</Th>
            <Th align="right">Проверок</Th>
            <Th width={44}>
              <span className="sr-only">Открыть</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <Row
              key={row.fileId}
              row={row}
              checked={selected.has(row.fileId)}
              onToggle={() => onToggle(row.fileId)}
              onOpen={() => onOpen(row.fileId)}
            />
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

interface RowProps {
  row: RegistryRow;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

/*
 * Строка целиком открывает карточку.
 *
 * Раньше открывала только стрелка в последнем столбце, и найти её удавалось
 * не всем: человек тыкал в фамилию, ничего не происходило, и выданный
 * документ оставалось только скачать пачкой со всеми остальными.
 * Отметка и ссылка на замену — свои действия: их нажатие до строки не доходит.
 */
function Row({ row, checked, onToggle, onOpen }: RowProps) {
  const retention = retentionLabel(row.retention);
  const cell = 'h-auto py-2.5 align-top';

  return (
    <Tr selected={checked} onClick={onOpen}>
      <Td className={cell} onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={checked}
          onChange={onToggle}
          aria-label={`Отметить документ: ${row.name || row.code}`}
        />
      </Td>

      <Td className={cell}>
        <p className="font-medium">{row.name || 'Без имени'}</p>
        <p className="text-xs text-muted">{row.email || 'без адреса'}</p>
      </Td>

      <Td className={cell}>
        <p>{row.documentTitle}</p>
        {row.eventName && <p className="text-xs text-muted">{row.eventName}</p>}
        {retention && <p className="mt-1 text-xs text-danger">{retention}</p>}
      </Td>

      <Td numeric className={cn(cell, 'whitespace-nowrap')}>
        {formatDate(row.issuedAt)}
        {row.expiresAt && <p className="text-xs text-muted">до {formatDate(row.expiresAt)}</p>}
        <p className="font-mono text-xs text-muted">
          {row.code.length > 14 ? row.code.slice(0, 8) : row.code}
        </p>
      </Td>

      <Td className={cell}>
        <Badge tone={badgeTone(mailTone(row.mail?.status))}>{mailLabel(row.mail?.status)}</Badge>
        {row.mail?.error && <p className="mt-1 max-w-48 text-xs text-danger">{row.mail.error}</p>}
      </Td>

      <Td className={cell}>
        <Badge tone={badgeTone(stateTone(row))}>{stateLabel(row)}</Badge>
        {row.replacedBy && (
          <a
            href={row.replacedBy.verifyPath}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-1 block text-xs text-accent hover:underline"
          >
            Заменён документом от {formatDate(row.replacedBy.issuedAt)}
          </a>
        )}
      </Td>

      <Td numeric align="right" className={cell}>
        {row.verifyCount}
      </Td>

      <Td className={cn(cell, 'py-1.5')} onClick={(e) => e.stopPropagation()}>
        <IconButton label={`Открыть карточку: ${row.name || row.code}`} size="sm" onClick={onOpen}>
          <ArrowUpRight size={16} />
        </IconButton>
      </Td>
    </Tr>
  );
}

/** Та же строка карточкой — для телефона. */
function CardRow({ row, checked, onToggle, onOpen }: RowProps) {
  return (
    <li className={cn('flex items-start gap-3 px-3 py-3', checked && 'bg-accent-soft')}>
      <Checkbox
        className="pt-0.5"
        checked={checked}
        onChange={onToggle}
        aria-label={`Отметить документ: ${row.name || row.code}`}
      />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-base font-medium">{row.name || 'Без имени'}</span>
            <span className="block truncate text-xs text-muted">{row.documentTitle}</span>
          </span>
          <Badge tone={badgeTone(stateTone(row))} size="sm">
            {stateLabel(row)}
          </Badge>
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <Badge tone={badgeTone(mailTone(row.mail?.status))} size="sm">
            {mailLabel(row.mail?.status)}
          </Badge>
          <span className="tabular">{formatDate(row.issuedAt)}</span>
          <span className="tabular">{row.verifyCount} пров.</span>
        </span>
      </button>
    </li>
  );
}
