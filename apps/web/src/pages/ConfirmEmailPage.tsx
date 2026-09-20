import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Award, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useVerifyEmail } from '../auth/useAuth';
import { AuthResult } from '../auth/AuthLayout';
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

  if (error) {
    return (
      <AuthResult
        icon={<TriangleAlert size={26} strokeWidth={1.75} className="text-danger" />}
        title="Не получилось"
        footer={
          <Link to="/login" className="text-sm underline underline-offset-2">
            Перейти ко входу
          </Link>
        }
      >
        <p role="alert">{error}</p>
      </AuthResult>
    );
  }

  return (
    <AuthResult icon={<Award size={26} strokeWidth={1.75} />} title="Подтверждаем адрес">
      <p className="flex items-center justify-center gap-2">
        <LoaderCircle size={16} className="animate-spin" aria-hidden />
        Секунду
      </p>
    </AuthResult>
  );
}
