import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from './auth/useAuth';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ConfirmEmailPage } from './pages/ConfirmEmailPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { EditorPage } from './pages/EditorPage';
import { RenderPage } from './pages/RenderPage';
import { SettingsPage } from './pages/SettingsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { VerifyDocumentPage } from './pages/VerifyDocumentPage';
import { LandingPage } from './pages/LandingPage';
import { InvitePage } from './pages/InvitePage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { rememberRefFromUrl } from './auth/referral-code';
import { Loading } from './ui/Loading';

export function App() {
  const me = useMe();

  // Код приглашения ловим на любой странице, а не только на /register:
  // ссылкой делятся вместе с рассказом о сервисе, и человек часто сперва
  // попадает на главную и уже оттуда идёт регистрироваться.
  rememberRefFromUrl(window.location.search);

  // Страница печати работает без сессии: её открывает браузер воркера
  // по одноразовому подписанному токену. Проверку входа она обходит намеренно.
  if (window.location.pathname === '/render') return <RenderPage />;

  // Политика обработки данных открыта всем: закон требует неограниченного
  // доступа к ней, а не доступа для вошедших.
  if (window.location.pathname === '/privacy') return <PrivacyPage />;

  if (me.isPending) {
    return <Loading />;
  }

  // Незалогиненный посетитель на главной видит рассказ о сервисе, а не форму
  // входа: до входа ему нечего вводить, он ещё решает, нужен ли сервис вообще.
  if (!me.data) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/confirm" element={<ConfirmEmailPage />} />
        {/* Забытый пароль: без этих двух страниц человек заперт снаружи. */}
        <Route path="/forgot" element={<ForgotPasswordPage />} />
        <Route path="/reset" element={<ResetPasswordPage />} />
        {/* Приглашённый ещё не может войти — в том и смысл приглашения. */}
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/verify/:publicId" element={<VerifyDocumentPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<DocumentsPage />} />
      <Route path="/documents/:id" element={<EditorPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/invoices" element={<InvoicesPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      {/* Вошедшему на этих страницах делать нечего: адрес уже подтверждён,
          организация есть. Отправляем в кабинет, а не показываем формы. */}
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route path="/confirm" element={<Navigate to="/" replace />} />
      <Route path="/forgot" element={<Navigate to="/" replace />} />
      <Route path="/reset" element={<Navigate to="/" replace />} />
      <Route path="/invite" element={<Navigate to="/" replace />} />
      <Route path="/verify/:publicId" element={<VerifyDocumentPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
