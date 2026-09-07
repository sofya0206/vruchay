import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Пошаговая настройка формы в Тильде.
 *
 * Второй способ подключения — для тех, у кого форма на странице уже есть
 * и переделывать её не хочется. Первый способ (готовый блок с кнопкой)
 * живёт в EmbedCode и остаётся тем, что предлагается по умолчанию.
 *
 * Инструкция здесь, а не в справке на отдельной странице: человек
 * настраивает форму, глядя в два окна сразу, и уходить за подсказкой
 * ему некуда — токен и код документа лежат на этом же экране.
 */

/** Значение, которое нужно перенести в Тильду, — с кнопкой «копировать». */
function Value({ children, title }: { children: string; title: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-[var(--surface)] px-2.5 py-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{children}</code>
      <button
        type="button"
        aria-label={`Скопировать ${title}`}
        onClick={() => {
          void navigator.clipboard.writeText(children).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-medium text-[var(--accent-contrast)]"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{title}</p>
        {children}
      </div>
    </li>
  );
}

/** Поле формы Тильды: имя и что в него класть. */
function Field({ name, what, required }: { name: string; what: string; required?: boolean }) {
  return (
    <tr className="border-t border-[var(--line)]">
      <td className="py-1 pr-3 align-top">
        <code className="font-mono text-xs">{name}</code>
      </td>
      <td className="py-1 pr-3 align-top text-xs text-[var(--text-muted)]">{what}</td>
      <td className="py-1 align-top text-xs text-[var(--text-muted)]">
        {required ? 'обязательно' : '—'}
      </td>
    </tr>
  );
}

export function TildaGuide({
  origin,
  token,
  documentId,
}: {
  origin: string;
  token: string;
  documentId: string;
}) {
  return (
    <div className="mt-3 rounded-lg bg-[var(--surface-sunken)] p-3">
      <p className="text-xs text-[var(--text-muted)]">
        Если форма в Тильде уже есть и переделывать её не хочется
      </p>

      <ol className="mt-3 space-y-3">
        <Step n={1} title="В Тильде: форма → Контент → Приём данных из формы">
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Включите «Свой скрипт для принятия данных» и вставьте этот адрес.
            Если включено подтверждение почты, участнику придёт письмо со ссылкой —
            одно нажатие, и документ в пути.
          </p>
          <Value title="адрес приёма данных">{`${origin}/api/v1/tilda-create`}</Value>
        </Step>

        <Step n={2} title="Добавьте в форму скрытые поля">
          <table className="mt-1.5 w-full">
            <tbody>
              <Field name="secure" what="токен из поля ниже" required />
              <Field name="doc_id" what="код документа из поля ниже" required />
              <Field name="consent" what="галочка согласия на обработку данных" required />
              <Field name="website" what="ловушка для роботов: скройте стилями" />
            </tbody>
          </table>
          <Value title="токен">{token}</Value>
          <Value title="код документа">{documentId}</Value>
        </Step>

        <Step n={3} title="Назовите видимые поля так же, как переменные документа">
          <table className="mt-1.5 w-full">
            <tbody>
              <Field name="mask_name" what="имя участника → переменная %name" required />
              <Field name="mask_email" what="почта участника" required />
            </tbody>
          </table>
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">
            Любая другая переменная документа — так же: <code className="font-mono">%place</code>{' '}
            → поле <code className="font-mono">mask_place</code>. Только латиницей.
          </p>
        </Step>

        <Step n={4} title="Добавьте домен страницы в список сайтов выше">
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Заявки с других сайтов отклоняются — это защита вашего пакета документов.
          </p>
        </Step>
      </ol>

      <div className="mt-3 border-t border-[var(--line)] pt-3">
        <p className="text-sm">«Мои документы» — всё, что человек получал через ваши формы</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Кнопка, по которой участник видит перечень своих документов и скачивает любой.
          Подтверждение кодом на почту — всегда. Вставьте рядом с кодом из блока выше:
        </p>
        <Value title="код кнопки «Мои документы»">{'<div data-vruchay-my data-label="Мои документы"></div>'}</Value>
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Или форма в Тильде со скрытым полем <code className="font-mono">doc_id</code> = <code className="font-mono">all</code> —
          так это делалось в ГрамотаДел.
        </p>
      </div>

      <p className="mt-3 border-t border-[var(--line)] pt-2 text-xs text-[var(--text-muted)]">
        Галочка согласия обязательна по закону о персональных данных: без неё заявка
        не принимается. Мы записываем текст согласия и время — это доказательство,
        если участник потом предъявит претензию.
      </p>
    </div>
  );
}
