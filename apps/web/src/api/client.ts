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

interface ErrorBody {
  message?: string;
  errors?: { field: string; message: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
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
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<T>(path, { method: 'POST', body: form });
  },
};
