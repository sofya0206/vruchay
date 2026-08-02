import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from './auth/useAuth';
import { LoginPage } from './pages/LoginPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { EditorPage } from './pages/EditorPage';
import { RenderPage } from './pages/RenderPage';
import { SettingsPage } from './pages/SettingsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { LandingPage } from './pages/LandingPage';

export function App() {
  const me = useMe();

  // Страница печати работает без сессии: её открывает браузер воркера
  // по одноразовому подписанному токену. Проверку входа она обходит намеренно.
  if (window.location.pathname === '/render') return <RenderPage />;

  // Политика обработки данных открыта всем: закон требует неограниченного
  // доступа к ней, а не доступа для вошедших.
  if (window.location.pathname === '/privacy') return <PrivacyPage />;

  if (me.isPending) {
    return <div className="grid h-full place-items-center text-slate-500">Загрузка…</div>;
  }

  // Незалогиненный посетитель на главной видит рассказ о сервисе, а не форму
  // входа: до входа ему нечего вводить, он ещё решает, нужен ли сервис вообще.
  if (!me.data) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<DocumentsPage />} />
      <Route path="/documents/:id" element={<EditorPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
