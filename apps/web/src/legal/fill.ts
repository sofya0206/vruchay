/**
 * Подстановка данных оператора в юридические тексты.
 *
 * Данные предпринимателя подставляются при сборке из переменных окружения,
 * а не лежат в репозитории: адрес регистрации ИП — это домашний адрес
 * человека. На опубликованной странице он всё равно будет — этого требует
 * закон, — но храниться в истории изменений ему незачем.
 */

export const OPERATOR: Record<string, string | undefined> = {
  НАИМЕНОВАНИЕ: import.meta.env.VITE_OPERATOR_NAME,
  ИНН: import.meta.env.VITE_OPERATOR_INN,
  ОГРНИП: import.meta.env.VITE_OPERATOR_OGRNIP,
  АДРЕС: import.meta.env.VITE_OPERATOR_ADDRESS,
  EMAIL: import.meta.env.VITE_OPERATOR_EMAIL,
  ТЕЛЕФОН: import.meta.env.VITE_OPERATOR_PHONE,
  ДАТА_РЕДАКЦИИ: import.meta.env.VITE_POLICY_DATE,
};

/**
 * Подставляет данные оператора и сообщает обо всём, что осталось незаполненным.
 *
 * Ищем любую пару двойных фигурных скобок, а не только известные имена.
 * Разница не теоретическая: в тексте жили заглушки вида `{{СРОК: 6 часов}}`,
 * которые под прежний шаблон не подходили — они молча выводились
 * на опубликованную страницу, а проверка «чего не хватает» их не замечала.
 * Документ выглядел готовым, будучи недописанным.
 */
export function fill(text: string): { filled: string; missing: string[] } {
  const missing: string[] = [];
  const filled = text.replace(/\{\{([^}]+)\}\}/g, (whole, name: string) => {
    const key = name.trim();
    const value = OPERATOR[key];
    if (!value) {
      missing.push(key);
      return whole;
    }
    return value;
  });
  return { filled, missing: [...new Set(missing)] };
}

/** Пометка, с которой начинается каждый черновик, не проверенный юристом. */
export const DRAFT_MARK = 'ЧЕРНОВИК, требует проверки юриста';

/**
 * Отделяет пометку черновика от текста. Пометка — первая строка файла:
 * так её видно и в репозитории, и на странице, где она превращается
 * в предупреждение, а не в абзац посреди договора.
 */
export function splitDraft(text: string): { draft: boolean; body: string } {
  const [first, ...rest] = text.split('\n');
  if (first.trim().startsWith(DRAFT_MARK)) {
    return { draft: true, body: rest.join('\n').replace(/^\s+/, '') };
  }
  return { draft: false, body: text };
}
