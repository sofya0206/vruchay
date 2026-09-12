import { useState } from 'react';
import { Check, Code2, Copy } from 'lucide-react';
import { Button } from '../ui/Button';
import { Tabs } from '../ui/Tabs';
import { Select } from '../ui/Select';

export type Platform = 'tilda' | 'wordpress' | 'bitrix' | 'html';

const PLATFORMS: { id: Platform; title: string }[] = [
  { id: 'tilda', title: 'Тильда' },
  { id: 'wordpress', title: 'WordPress' },
  { id: 'bitrix', title: '1С-Битрикс' },
  { id: 'html', title: 'Свой сайт' },
];

const WHERE: Record<Platform, string> = {
  tilda:
    'Добавьте на страницу курса блок «T123 — HTML» и вставьте туда весь код. ' +
    'Имя и почту Тильда подставит сама — она делает это для страниц внутри личного кабинета.',
  wordpress:
    'Вставьте код в functions.php дочерней темы. После этого на странице курса ' +
    'напишите [vruchay_certificate] — имя и почта подставятся из профиля вошедшего.',
  bitrix:
    'Вставьте код в шаблон страницы курса или во включаемую область. ' +
    'Имя и почта возьмутся из учётной записи вошедшего.',
  html:
    'Вставьте код туда, где нужна кнопка. Имя и почту подставьте своим шаблоном ' +
    'в data-name и data-email — или оставьте пустыми, тогда человек заполнит их сам.',
};

/** Подключение стилей и скрипта — одинаково везде. */
function assets(origin: string, token: string): string {
  return (
    `<link rel="stylesheet" href="${origin}/api/v1/tilda-css/${token}">\n` +
    `<script src="${origin}/api/v1/tilda-js/${token}"></script>`
  );
}

/**
 * Готовый код для вставки — одним куском, включая подключение скрипта.
 *
 * Не двумя вставками с отдельной правкой HEAD: так меньше шагов, где
 * можно ошибиться, и не нужно лезть в шаблон сайта. В Битриксе это
 * вдобавок избавляет от тонкости с порядком отрисовки шапки.
 *
 * Повторной загрузки скрипт не боится — он проверяет это сам.
 */
export function embedCode(
  platform: Platform,
  { origin, token, documentId, label }: {
    origin: string;
    token: string;
    documentId: string;
    label: string;
  },
): string {
  switch (platform) {
    case 'tilda':
      return (
        `<div data-vruchay-certificate\n` +
        `     data-doc-id="${documentId}"\n` +
        `     data-label="${label}"></div>\n` +
        assets(origin, token)
      );

    case 'wordpress':
      return (
        `<?php\n` +
        `/* В functions.php дочерней темы.\n` +
        `   Потом на странице курса: [vruchay_certificate] */\n` +
        `add_shortcode('vruchay_certificate', function () {\n` +
        `    if (!is_user_logged_in()) {\n` +
        `        return '<p>Войдите, чтобы получить документ.</p>';\n` +
        `    }\n` +
        `    $user = wp_get_current_user();\n` +
        `    $name = trim($user->first_name . ' ' . $user->last_name);\n` +
        `    if ($name === '') { $name = $user->display_name; }\n` +
        `    return sprintf(\n` +
        `        '<div data-vruchay-certificate data-doc-id="%s" data-label="%s" data-name="%s" data-email="%s"></div>'\n` +
        `        . '<link rel="stylesheet" href="%s">'\n` +
        `        . '<script src="%s"></script>',\n` +
        `        esc_attr('${documentId}'),\n` +
        `        esc_attr('${label}'),\n` +
        `        esc_attr($name),\n` +
        `        esc_attr($user->user_email),\n` +
        `        esc_url('${origin}/api/v1/tilda-css/${token}'),\n` +
        `        esc_url('${origin}/api/v1/tilda-js/${token}')\n` +
        `    );\n` +
        `});`
      );

    case 'bitrix':
      return (
        `<?php\n` +
        `global $USER;\n` +
        `if ($USER->IsAuthorized()):\n` +
        `    $name = trim($USER->GetFirstName() . ' ' . $USER->GetLastName());\n` +
        `    if ($name === '') { $name = $USER->GetLogin(); }\n` +
        `?>\n` +
        `<div data-vruchay-certificate\n` +
        `     data-doc-id="${documentId}"\n` +
        `     data-label="<?= htmlspecialcharsbx('${label}') ?>"\n` +
        `     data-name="<?= htmlspecialcharsbx($name) ?>"\n` +
        `     data-email="<?= htmlspecialcharsbx($USER->GetEmail()) ?>"></div>\n` +
        assets(origin, token) +
        `\n<?php else: ?>\n` +
        `<p>Войдите, чтобы получить документ.</p>\n` +
        `<?php endif; ?>`
      );

    case 'html':
    default:
      return (
        `<!-- Подставьте имя и почту вошедшего своим шаблоном.\n` +
        `     Оставите пустыми — человек заполнит поля сам. -->\n` +
        `<div data-vruchay-certificate\n` +
        `     data-doc-id="${documentId}"\n` +
        `     data-label="${label}"\n` +
        `     data-name=""\n` +
        `     data-email=""></div>\n` +
        assets(origin, token)
      );
  }
}

/**
 * Код для вставки с выбором площадки.
 *
 * Площадка выбирается вкладками, а не выпадающим списком: вариантов
 * четыре, и все они должны быть видны сразу — человеку не приходится
 * догадываться, что его площадка вообще поддерживается.
 */
export function EmbedCode({
  origin,
  token,
  documentIds,
  titles,
}: {
  origin: string;
  token: string;
  documentIds: string[];
  titles: Map<string, string>;
}) {
  const [platform, setPlatform] = useState<Platform>('tilda');
  const [documentId, setDocumentId] = useState(documentIds[0] ?? '');
  const [copied, setCopied] = useState(false);

  if (documentIds.length === 0) {
    return (
      <p className="mt-3 text-[var(--text-muted)]">
        Сначала выберите документ в настройках интеграции — без него вставлять нечего.
      </p>
    );
  }

  const code = embedCode(platform, {
    origin,
    token,
    documentId: documentId || documentIds[0],
    label: 'Получить документ',
  });

  return (
    <div className="mt-3 max-w-4xl rounded-xl bg-[var(--surface-sunken)] p-4">
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Code2 size={16} />
        Код для вставки на сайт
      </div>

      <Tabs
        className="mt-2"
        label="Площадка"
        value={platform}
        onChange={setPlatform}
        items={PLATFORMS.map((p) => ({ id: p.id, label: p.title }))}
      />

      {documentIds.length > 1 && (
        <Select
          value={documentId}
          onChange={setDocumentId}
          aria-label="Какой документ выдавать"
          className="mt-2.5"
          options={documentIds.map((id) => ({ value: id, label: titles.get(id) ?? id }))}
        />
      )}

      <p className="mt-2.5">{WHERE[platform]}</p>

      <pre className="mt-2.5 overflow-x-auto rounded-lg bg-[var(--surface)] p-3 text-sm">
        {code}
      </pre>

      <Button
        className="mt-3"
        icon={copied ? <Check size={16} /> : <Copy size={16} />}
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? 'Скопировано' : 'Копировать код'}
      </Button>
    </div>
  );
}
