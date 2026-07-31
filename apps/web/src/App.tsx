import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from './auth/useAuth';
import { LoginPage } from './pages/LoginPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { EditorPage } from './pages/EditorPage';

export function App() {
  const me = useMe();

  if (me.isPending) {
    return <div className="grid h-full place-items-center text-slate-500">Загрузка…</div>;
  }

  if (!me.data) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<DocumentsPage />} />
      <Route path="/documents/:id" element={<EditorPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
