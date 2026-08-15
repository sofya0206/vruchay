/**
 * Готовые куски для вставки на разные площадки.
 *
 * Отличается у них ровно одно: откуда взять имя и почту вошедшего.
 * Сам скрипт один и тот же — он ищет атрибуты `data-name` и `data-email`
 * у блока, а подставляет их площадка **своим шаблоном на сервере**.
 *
 * Именно так, а не чтением недокументированных объектов в браузере:
 * объекты у каждой площадки свои, меняются от версии к версии и молча
 * исчезают, а `$USER` в Битриксе и `wp_get_current_user()` в WordPress
 * описаны в справочниках и делают ровно то, что написано.
 *
 * Стили и скрипт подключаются **рядом с блоком**, а не в HEAD. Так
 * вставка одна вместо двух и не нужно лезть в шаблон сайта — а в
 * Битриксе ещё и следить, чтобы подключение случилось до отрисовки
 * шапки. Скрипт от повторной загрузки защищён сам.
 */

export type Platform = 'tilda' | 'wordpress' | 'bitrix' | 'html';

export interface SnippetParams {
  baseUrl: string;
  token: string;
  documentId: string;
  label: string;
}

/** Подключение стилей и скрипта — одинаково везде. */
function assets({ baseUrl, token }: SnippetParams): string {
  return (
    `<link rel="stylesheet" href="${baseUrl}/api/v1/tilda-css/${token}">\n` +
    `<script src="${baseUrl}/api/v1/tilda-js/${token}"></script>`
  );
}

/**
 * Всё, что нужно вставить, — одним куском.
 *
 * Для Тильды и своего сайта это готовая разметка. Для WordPress
 * и Битрикса — код, который сам подставит данные вошедшего.
 */
export function embedSnippet(platform: Platform, params: SnippetParams): string {
  const { documentId, label } = params;

  switch (platform) {
    case 'tilda':
      // Тильда сама кладёт ma_name и ma_email в поля формы внутри
      // личного кабинета — блоку передавать нечего.
      return (
        `<div data-vruchay-certificate\n` +
        `     data-doc-id="${documentId}"\n` +
        `     data-label="${label}"></div>\n` +
        assets(params)
      );

    case 'wordpress':
      return (
        `<?php\n` +
        `/* Вставьте это в functions.php вашей темы — лучше дочерней:\n` +
        `   при обновлении темы файл затрётся.\n` +
        `   Потом на странице курса напишите: [vruchay_certificate] */\n` +
        `add_shortcode('vruchay_certificate', function () {\n` +
        `    // Гостю кнопку не показываем: подставлять нечего, а просить\n` +
        `    // набрать данные руками на странице курса странно.\n` +
        `    if (!is_user_logged_in()) {\n` +
        `        return '<p>Войдите, чтобы получить документ.</p>';\n` +
        `    }\n` +
        `\n` +
        `    $user = wp_get_current_user();\n` +
        `    $name = trim($user->first_name . ' ' . $user->last_name);\n` +
        `    if ($name === '') { $name = $user->display_name; }\n` +
        `\n` +
        `    // esc_attr обязателен: имя человек заполняет сам в профиле,\n` +
        `    // а отсюда оно попадает в атрибут разметки.\n` +
        `    return sprintf(\n` +
        `        '<div data-vruchay-certificate data-doc-id="%s" data-label="%s" data-name="%s" data-email="%s"></div>'\n` +
        `        . '<link rel="stylesheet" href="%s">'\n` +
        `        . '<script src="%s"></script>',\n` +
        `        esc_attr('${documentId}'),\n` +
        `        esc_attr('${label}'),\n` +
        `        esc_attr($name),\n` +
        `        esc_attr($user->user_email),\n` +
        `        esc_url('${params.baseUrl}/api/v1/tilda-css/${params.token}'),\n` +
        `        esc_url('${params.baseUrl}/api/v1/tilda-js/${params.token}')\n` +
        `    );\n` +
        `});`
      );

    case 'bitrix':
      return (
        `<?php\n` +
        `/* Вставьте в шаблон страницы курса или во включаемую область.\n` +
        `   $USER доступен на любой странице Битрикса. */\n` +
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
        assets(params) +
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
        assets(params)
      );
  }
}

/** Куда это вставлять — по-человечески, без слова «шаблонизатор». */
export const PLATFORM_HINTS: Record<Platform, { title: string; where: string }> = {
  tilda: {
    title: 'Тильда',
    where:
      'Добавьте на страницу курса блок «T123 — HTML» и вставьте туда весь код. ' +
      'Имя и почту Тильда подставит сама — она делает это для страниц внутри ' +
      'личного кабинета.',
  },
  wordpress: {
    title: 'WordPress',
    where:
      'Вставьте код в functions.php дочерней темы (Внешний вид → Редактор тем). ' +
      'После этого на странице курса напишите [vruchay_certificate] — имя и почта ' +
      'подставятся из профиля вошедшего.',
  },
  bitrix: {
    title: '1С-Битрикс',
    where:
      'Вставьте код в шаблон страницы курса или во включаемую область. ' +
      'Имя и почта возьмутся из учётной записи вошедшего.',
  },
  html: {
    title: 'Свой сайт',
    where:
      'Вставьте код туда, где нужна кнопка. Имя и почту подставьте своим ' +
      'шаблоном в data-name и data-email — или оставьте пустыми, тогда ' +
      'человек заполнит их сам.',
  },
};
