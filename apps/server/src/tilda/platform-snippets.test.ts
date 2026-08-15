import { describe, expect, it } from 'vitest';
import { embedSnippet, PLATFORM_HINTS, type Platform } from './platform-snippets';

/*
 * Готовые куски для вставки.
 *
 * Это единственный код, который клиент копирует к себе на сайт руками.
 * Ошибка здесь не всплывёт в наших журналах: у человека просто «ничего
 * не работает», и разбираться он будет не с кодом, а с нами.
 *
 * Имена функций сверены со справочниками площадок:
 * WordPress — wp_get_current_user(), WP_User (user_email, first_name,
 * last_name, display_name), esc_attr, esc_url;
 * Битрикс — CUser::IsAuthorized, GetFirstName, GetLastName, GetEmail,
 * GetLogin, htmlspecialcharsbx.
 */

const params = {
  baseUrl: 'https://vruchay.ru',
  token: 'ab7243b4-442f-4a26-8a20-85200f85f240',
  documentId: '6fb1f2ab-9ab3-47a5-bae1-218990c20a0c',
  label: 'Получить сертификат',
};

const PLATFORMS: Platform[] = ['tilda', 'wordpress', 'bitrix', 'html'];

describe('одна вставка вместо двух', () => {
  it.each(PLATFORMS)('%s: несёт и блок, и подключение скрипта', (platform) => {
    // Всё одним куском: не надо лезть в шаблон сайта, а в Битриксе
    // ещё и следить, чтобы подключение случилось до отрисовки шапки.
    const code = embedSnippet(platform, params);
    expect(code).toContain('data-vruchay-certificate');
    expect(code).toContain(`/api/v1/tilda-js/${params.token}`);
    expect(code).toContain(`/api/v1/tilda-css/${params.token}`);
    expect(code).toContain(params.documentId);
  });

  it('адрес скрипта без косой черты на конце — как принимает сервер', () => {
    expect(embedSnippet('html', params)).not.toMatch(/tilda-js\/[0-9a-f-]+\/["']/);
  });
});

describe('источник данных вошедшего', () => {
  it('Тильда ничего не подставляет: она сама кладёт ma_email в форму', () => {
    expect(embedSnippet('tilda', params)).not.toContain('data-email');
  });

  it.each(['wordpress', 'bitrix'] as Platform[])(
    '%s: берёт данные у площадки и проверяет, что человек вошёл',
    (platform) => {
      const code = embedSnippet(platform, params);
      expect(code).toContain('data-email');
      expect(code).toContain('data-name');
      // Без проверки входа кнопка предлагала бы документ гостю,
      // а подставлять ему нечего.
      expect(code).toMatch(/is_user_logged_in|IsAuthorized/);
      expect(code).toContain('Войдите, чтобы получить документ');
    },
  );

  it('свой сайт: поля пустые, а не выдуманные', () => {
    const code = embedSnippet('html', params);
    expect(code).toContain('data-name=""');
    expect(code).toContain('data-email=""');
  });
});

describe('экранирование — иначе дыра на сайте клиента', () => {
  it('WordPress экранирует и значения, и адреса', () => {
    // Имя приходит из профиля, который человек заполняет сам.
    const code = embedSnippet('wordpress', params);
    expect((code.match(/esc_attr\(/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((code.match(/esc_url\(/g) ?? []).length).toBe(2);
  });

  it('Битрикс использует htmlspecialcharsbx, а не htmlspecialcharsEx', () => {
    // htmlspecialcharsEx работает по чёрному списку, и сама Битрикс
    // советует его избегать.
    const code = embedSnippet('bitrix', params);
    expect((code.match(/htmlspecialcharsbx\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(code).not.toContain('htmlspecialcharsEx');
  });
});

describe('подсказки «куда вставлять»', () => {
  it.each(PLATFORMS)('%s: есть название и внятное место', (platform) => {
    expect(PLATFORM_HINTS[platform].title.length).toBeGreaterThan(0);
    expect(PLATFORM_HINTS[platform].where.length).toBeGreaterThan(40);
  });
});
