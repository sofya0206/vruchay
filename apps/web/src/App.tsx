import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useMe } from './auth/useAuth';
import { clearReturnPath, readReturnPath, rememberReturnPath } from './auth/session-lost';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ConfirmEmailPage } from './pages/ConfirmEmailPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { AppShell } from './shell/AppShell';
import { LegacyRedirect } from './shell/redirects';
import { StatesPage } from './pages/StatesPage';
import { OverviewPage } from './overview/OverviewPage';
import { EditorPage } from './pages/EditorPage';
import { RenderPage } from './pages/RenderPage';
import { SettingsPage } from './pages/SettingsPage';
import { SETTINGS_SECTIONS } from './settings/sections';
import { ThemeSync } from './settings/ThemeSync';
import { MailingPage } from './mailing/MailingPage';
import { MaterialPage } from './documents/MaterialPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { RegistryPage } from './registry/RegistryPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { VerifyDocumentPage } from './pages/VerifyDocumentPage';
import { GovPage } from './pages/GovPage';
import { BusinessPage } from './pages/BusinessPage';
import { PersonalPage } from './pages/PersonalPage';
import { EducationPage } from './pages/EducationPage';
import { InternationalPage } from './pages/InternationalPage';
import { PricingPage } from './pages/PricingPage';
import { OfferPage } from './pages/OfferPage';
import { DpaPage } from './pages/DpaPage';
import { KnowledgeBasePage } from './docs/KnowledgeBasePage';
import { SupportPage } from './pages/SupportPage';
import { ReferralPage } from './pages/ReferralPage';
import { IssuerPage } from './public/IssuerPage';
import { RecipientPage } from './public/RecipientPage';
import { LandingPage } from './pages/LandingPage';
import { DiscussTermsPage } from './pages/DiscussTermsPage';
import { InvitePage } from './pages/InvitePage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { rememberRefFromUrl } from './auth/referral-code';
import { Loading } from './ui/Loading';

/**
 * Страницы, открытые всем: отраслевые лендинги, тарифы и юридические
 * документы. Перечислены один раз и подставляются в обе ветки маршрутов —
 * для гостя и для вошедшего, иначе половина ссылок работала бы только до входа.
 */
const PUBLIC_PAGES: [string, ReactNode][] = [
  ['/gov', <GovPage />],
  ['/business', <BusinessPage />],
  ['/personal', <PersonalPage />],
  ['/education', <EducationPage />],
  ['/international', <InternationalPage />],
  ['/pricing', <PricingPage />],
  ['/oferta', <OfferPage />],
  ['/dpa', <DpaPage />],
];

function publicRoutes() {
  return PUBLIC_PAGES.map(([path, element]) => <Route key={path} path={path} element={element} />);
}

/** Прежние адреса настроек — в новые разделы (см. shell/redirects.ts). */
const LEGACY_SETTINGS = ['support', 'referral', 'domains', 'senders', 'privacy', 'tokens'];

export function App() {
  const me = useMe();

  // Код приглашения ловим на любой странице, а не только на /register:
  // ссылкой делятся вместе с рассказом о сервисе.
  rememberRefFromUrl(window.location.search);

  // Страница печати работает без сессии: её открывает браузер воркера
  // по одноразовому подписанному токену. Проверку входа она обходит намеренно.
  if (window.location.pathname === '/render') return <RenderPage />;

  // Политика обработки данных открыта всем: закон требует неограниченного доступа к ней.
  if (window.location.pathname === '/privacy') return <PrivacyPage />;

  if (me.isPending) {
    return <Loading />;
  }

  // Незалогиненный посетитель на главной видит рассказ о сервисе, а не форму входа.
  if (!me.data) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        {/* Форма «Обсудить условия» стоит и здесь, и в ветке для вошедших: адрес у неё один. */}
        <Route path="/obsudit" element={<DiscussTermsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/confirm" element={<ConfirmEmailPage />} />
        <Route path="/forgot" element={<ForgotPasswordPage />} />
        <Route path="/reset" element={<ResetPasswordPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/verify/:publicId" element={<VerifyDocumentPage />} />
        {/* Короткий адрес из QR: /c/K7M2-9QXR-4TVB. Та же страница. */}
        <Route path="/c/:publicId" element={<VerifyDocumentPage />} />
        {/* Страница получателя — по подписанной ссылке из письма, без входа. */}
        <Route path="/d/:token" element={<RecipientPage />} />
        {/* Публичная страница организации — реестр эмитента для проверяющих. */}
        <Route path="/org/:slug" element={<IssuerPage />} />
        {publicRoutes()}
        <Route path="/docs/*" element={<KnowledgeBasePage />} />
        <Route path="*" element={<CabinetOrNotFound />} />
      </Routes>
    );
  }

  return (
    <>
      {/* Тема из настроек человека — применяется на всех страницах кабинета. */}
      <ThemeSync />
      <Routes>
        {/* Весь кабинет живёт внутри одной оболочки: колонка разделов
            рисуется один раз и стоит на каждом экране. Снаружи только
            страница печати, политика и публичные страницы. */}
        <Route element={<AppShell />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          {/* Витрина кита — только в разработке, в сборку не попадает. */}
          {import.meta.env.DEV && <Route path="/dev/states" element={<StatesPage />} />}
          {/* Статические сегменты стоят выше `/documents/:id` в разборе адреса. */}
          <Route path="/documents/archive" element={<DocumentsPage archived />} />
          <Route path="/documents/templates" element={<DocumentsPage templates />} />
          {/* Документ: лист — свой экран, остальные шаги — под одной рамкой.
              Шаги перечислены в documents/material-steps.ts. */}
          <Route path="/documents/:id" element={<EditorPage />} />
          <Route path="/documents/:id/:segment" element={<MaterialPage />} />

          <Route path="/mailing" element={<MailingPage />} />
          {/* Сводка и новая рассылка получат свои экраны; пока — те же папки. */}
          <Route path="/mailing/stats" element={<Navigate to="/mailing?list=stats" replace />} />
          <Route path="/mailing/new" element={<Navigate to="/mailing?list=new" replace />} />
          {/* Прежнее рабочее место материала — теперь шаги документа. */}
          <Route path="/mailing/:id" element={<LegacyRedirect fallback="/documents" />} />

          <Route path="/registry" element={<RegistryPage />} />
          <Route path="/analytics" element={<LegacyRedirect />} />
          {/* Оплата и интеграции живут в настройках. */}
          <Route path="/billing" element={<LegacyRedirect />} />
          <Route path="/integrations/*" element={<LegacyRedirect />} />

          {/* Настройки: у каждого раздела свой адрес. Список — в settings/sections.tsx. */}
          <Route path="/settings" element={<SettingsPage />}>
            <Route index element={<Navigate to="/settings/account" replace />} />
            {SETTINGS_SECTIONS.map((s) => (
              <Route key={s.path} path={s.path} element={s.element} />
            ))}
            {LEGACY_SETTINGS.map((path) => (
              <Route key={path} path={path} element={<LegacyRedirect fallback="/settings" />} />
            ))}
          </Route>

          <Route path="/support" element={<SupportPage />} />
          <Route path="/referral" element={<ReferralPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          {/* База знаний для вошедшего — внутри кабинета; гость читает её без оболочки. */}
          <Route path="/docs/*" element={<KnowledgeBasePage embedded />} />
        </Route>

        <Route path="/login" element={<AfterLogin />} />
        {/* Вошедшему на этих страницах делать нечего. */}
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="/confirm" element={<Navigate to="/" replace />} />
        <Route path="/forgot" element={<Navigate to="/" replace />} />
        <Route path="/reset" element={<Navigate to="/" replace />} />
        <Route path="/invite" element={<Navigate to="/" replace />} />
        <Route path="/verify/:publicId" element={<VerifyDocumentPage />} />
        <Route path="/c/:publicId" element={<VerifyDocumentPage />} />
        <Route path="/d/:token" element={<RecipientPage />} />
        <Route path="/org/:slug" element={<IssuerPage />} />
        {publicRoutes()}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

/**
 * Вошли — туда, где были, когда вход пропал: к тому же документу, а не
 * на главную искать его заново. Обычный вход ведёт на главную.
 */
function AfterLogin() {
  const to = readReturnPath() ?? '/';
  useEffect(clearReturnPath, []);
  return <Navigate to={to} replace />;
}

/** Разделы кабинета: их адрес без входа — повод войти, а не «не найдено». */
const CABINET_PREFIXES = [
  '/documents',
  '/mailing',
  '/registry',
  '/settings',
  '/billing',
  '/invoices',
  '/analytics',
  '/integrations',
  '/support',
  '/referral',
];

/**
 * Ссылка на документ из письма коллеги или вкладка, открытая вчера,
 * без входа показывали «Страница не найдена». Теперь — вход, а после
 * него та самая страница.
 */
function CabinetOrNotFound() {
  const { pathname, search } = useLocation();
  const cabinet = CABINET_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  useEffect(() => {
    if (cabinet) rememberReturnPath(pathname + search);
  }, [cabinet, pathname, search]);
  return cabinet ? <Navigate to="/login" replace /> : <NotFoundPage />;
}
