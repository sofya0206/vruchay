import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Award, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useVerifyEmail } from '../auth/useAuth';
import { ApiError } from '../api/client';

/**
 * Страница, на которую ведёт ссылка из письма.
 *
 * Токен приходит в адресе и сразу отправляется на сервер. Успех означает
 * готовую сессию — человек попадает в кабинет без повторного ввода пароля:
 * он только что доказал, что владеет и адресом, и ссылкой.
 */
export function ConfirmEmailPage() {
  const verify = useVerifyEmail();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    // Ссылка одноразовая: второй вызов израсходовал бы её впустую и показал
    // бы «недействительна» там, где всё прошло успешно. В строгом режиме
    // React выполняет эффект дважды, поэтому защищаемся флагом.
    if (started.current) return;
    started.current = true;

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;
    verify.mutate(token, { onSuccess: () => navigate('/', { replace: true }) });
  }, [verify, navigate]);

  const token = new URLSearchParams(window.location.search).get('token');
  const error = !token
    ? 'В ссылке нет кода подтверждения. Откройте её из письма целиком.'
    : verify.error instanceof ApiError
      ? verify.error.message
      : null;

  return (
    <div className="grid h-full place-items-center p-6">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)]">
          <Award size={26} strokeWidth={1.75} />
        </span>

        {error ? (
          <>
            <span className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
              <TriangleAlert size={20} strokeWidth={1.75} />
            </span>
            <h1 className="font-serif text-2xl">Не получилось</h1>
            <p role="alert" className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              {error}
            </p>
            <Link to="/login" className="mt-8 inline-block text-sm underline underline-offset-2">
              Перейти ко входу
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-serif text-2xl">Подтверждаем адрес</h1>
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
              <LoaderCircle size={16} className="animate-spin" />
              Секунду
            </p>
          </>
        )}
      </div>
    </div>
  );
}
