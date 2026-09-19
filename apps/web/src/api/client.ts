/**
 * Тонкий клиент над fetch. Сессия живёт в httpOnly-cookie, поэтому токены
 * в JavaScript не хранятся и credentials передаются браузером автоматически.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

/**
 * Текст отказа для человека. Ответ сервера уже написан по-русски и по делу;
 * всё остальное — обрыв сети, и браузер описывает его «Failed to fetch»
 * или «Load failed», что человеку ничего не говорит.
 */
export function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Сервер не ответил — попробуйте ещё раз';
}

interface ErrorBody {
  message?: string;
  errors?: { field: string; message: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  /*
   * Заголовок типа содержимого ставим только когда тело действительно есть.
   *
   * Fastify отвечает 400 «Body cannot be empty when content-type is set to
   * application/json» на запрос без тела, но с этим заголовком. Раньше он
   * ставился всегда — и разом ломались все действия без тела: удаление
   * документа, строки, колонки, домена, интеграции, проверка домена,
   * отметка счёта оплаченным. Внешне это выглядело как «кнопка не работает»:
   * запрос уходил, ответ приходил, ничего не менялось.
   */
  const hasJsonBody = init?.body !== undefined && !(init.body instanceof FormData);

  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(hasJsonBody ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let body: ErrorBody = {};
    try {
      body = (await res.json()) as ErrorBody;
    } catch {
      // Тело может быть пустым или не-JSON — тогда покажем сообщение по статусу.
    }
    throw new ApiError(
      res.status,
      body.message ?? (res.status === 401 ? 'Требуется вход в систему' : 'Что-то пошло не так'),
      body.errors,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  // Тело у DELETE редкость, но удаление учётной записи подтверждается
  // паролем, а пароль в адресе строки запроса оставлять нельзя — он
  // осядет в журналах прокси и в истории браузера.
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<T>(path, { method: 'POST', body: form });
  },
};
