import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from './auth/useAuth';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ConfirmEmailPage } from './pages/ConfirmEmailPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { AppShell } from './shell/AppShell';
import { StatesPage } from './pages/StatesPage';
import { OverviewPage } from './overview/OverviewPage';
import { EditorPage } from './pages/EditorPage';
import { RenderPage } from './pages/RenderPage';
import { SettingsPage } from './pages/SettingsPage';
import { SETTINGS_SECTIONS } from './settings/sections';
import { INTEGRATION_SECTIONS } from './integrations/sections';
import { IntegrationsPage } from './integrations/IntegrationsPage';
import { ThemeSync } from './settings/ThemeSync';
import { MailingPage } from './mailing/MailingPage';
import { DocumentWorkspacePage } from './mailing/DocumentWorkspacePage';
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
import { BillingPage } from './billing/BillingPage';
import { IssuerPage } from './public/IssuerPage';
import { LandingPage } from './pages/LandingPage';
import { DiscussTermsPage } from './pages/DiscussTermsPage';
import { InvitePage } from './pages/InvitePage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { rememberRefFromUrl } from './auth/referral-code';
import { Loading } from './ui/Loading';

/**
 * Страницы, открытые всем: отраслевые лендинги, тарифы и юридические
 * документы.
 *
 * Перечислены один раз и подставляются в обе ветки маршрутов — для гостя
 * и для вошедшего. Иначе половина ссылок работала бы только до входа:
 * человек, уже открывший кабинет, попадал бы со ссылки на «страница
 * не найдена».
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
        {/* Форма «Обсудить условия» стоит и здесь, и в ветке для вошедших:
            адрес у неё обязан быть один. Ссылки на неё ведут из кабинета,
            где главная — это «Обзор», а не рассказ о сервисе. */}
        <Route path="/obsudit" element={<DiscussTermsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/confirm" element={<ConfirmEmailPage />} />
        {/* Забытый пароль: без этих двух страниц человек заперт снаружи. */}
        <Route path="/forgot" element={<ForgotPasswordPage />} />
        <Route path="/reset" element={<ResetPasswordPage />} />
        {/* Приглашённый ещё не может войти — в том и смысл приглашения. */}
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/verify/:publicId" element={<VerifyDocumentPage />} />
        {/* Короткий адрес из QR: /c/K7M2-9QXR-4TVB. Та же страница. */}
        <Route path="/c/:publicId" element={<VerifyDocumentPage />} />
        {/* Публичная страница организации — реестр эмитента для проверяющих. */}
        <Route path="/org/:slug" element={<IssuerPage />} />
        {publicRoutes()}
        <Route path="/docs/*" element={<KnowledgeBasePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    );
  }

  return (
    <>
      {/* Тема из настроек человека — применяется на всех страницах кабинета. */}
      <ThemeSync />
      <Routes>
      {/* Весь кабинет живёт внутри одной оболочки: полоса разделов
          рисуется один раз и стоит на каждом экране, включая редактор
          и настройки. Снаружи только страница печати и политика. */}
      <Route element={<AppShell />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        {/* Витрина состояний — только в разработке, в сборку не попадает. */}
        {import.meta.env.DEV && <Route path="/dev/states" element={<StatesPage />} />}
        {/* Архив — свой адрес, а не переключатель внутри списка: на него
            можно сослаться, а «Назад» возвращает к рабочим. Статический
            сегмент стоит выше `/documents/:id` в разборе адреса, поэтому
            редактор материала он не перехватывает. */}
        <Route path="/documents/archive" element={<DocumentsPage archived />} />

        {/* ─────────── МАРШРУТЫ РАЗДЕЛОВ БЛОКА 1 ───────────
            Ветка, которая делает свой раздел, заменяет ЗДЕСЬ одну строку
            заглушки на свой экран и убирает раздел из shell/sections.ts.
            Больше в этом файле менять нечего.

              1.3 «Рассылка»  → /mailing
              1.6 «Реестр»    → /registry

            Интеграции и Оплата пока никем не заняты — оставлены как есть. */}
        <Route path="/mailing" element={<MailingPage />} />
        <Route path="/registry" element={<RegistryPage />} />
        {/* Аналитика живёт вкладкой реестра: два входа в одни цифры
            путали. Старый адрес остаётся рабочим. */}
        <Route path="/analytics" element={<Navigate to="/registry?tab=analytics" replace />} />
        {/* Интеграции: свой раздел кабинета со списком площадок слева.
            Раньше это был редирект в настройки, из-за чего два раздела
            показывали одно и то же. Список площадок — в
            integrations/sections.tsx. */}
        <Route path="/integrations" element={<IntegrationsPage />}>
          {/* Сразу Тильда, а не «Инфо»: подключают её, а перечень площадок
              и так стоит слева в колонке — отдельный экран-оглавление
              человек пролистывал, чтобы нажать первый же пункт. */}
          <Route index element={<Navigate to="/integrations/tilda" replace />} />
          {INTEGRATION_SECTIONS.map((s) => (
            <Route key={s.path} path={s.path} element={s.element} />
          ))}
        </Route>
        <Route path="/billing" element={<BillingPage />} />
        {/* ───────── КОНЕЦ МАРШРУТОВ РАЗДЕЛОВ БЛОКА 1 ───────── */}

        {/* Две стороны материала — лист и таблица — тоже под полосой:
            именно из них раньше не было пути никуда, кроме «назад».
            Полоса тонкая, высота листу отдаётся от окна, а не от
            содержимого — см. AppShell. */}
        <Route path="/documents/:id" element={<EditorPage />} />
        <Route path="/mailing/:id" element={<DocumentWorkspacePage />} />
        {/* Настройки: у каждого раздела свой адрес, прямая ссылка открывает
            именно его. Список разделов — в settings/sections.tsx. */}
        <Route path="/settings" element={<SettingsPage />}>
          <Route index element={<Navigate to="/settings/account" replace />} />
          {SETTINGS_SECTIONS.map((s) => (
            <Route key={s.path} path={s.path} element={s.element} />
          ))}
        </Route>
        {/* Старый адрес формы на сайте: она переехала в свой раздел. */}
        <Route
          path="/settings/integrations"
          element={<Navigate to="/integrations/tilda" replace />}
        />
        <Route path="/invoices" element={<InvoicesPage />} />
        {/* База знаний для вошедшего — внутри кабинета, с той же колонкой
            разделов; гость читает её без оболочки. */}
        <Route path="/docs/*" element={<KnowledgeBasePage embedded />} />
      </Route>

      <Route path="/login" element={<Navigate to="/" replace />} />
      {/* Вошедшему на этих страницах делать нечего: адрес уже подтверждён,
          организация есть. Отправляем в кабинет, а не показываем формы. */}
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route path="/confirm" element={<Navigate to="/" replace />} />
      <Route path="/forgot" element={<Navigate to="/" replace />} />
      <Route path="/reset" element={<Navigate to="/" replace />} />
      <Route path="/invite" element={<Navigate to="/" replace />} />
      <Route path="/verify/:publicId" element={<VerifyDocumentPage />} />
      <Route path="/c/:publicId" element={<VerifyDocumentPage />} />
      <Route path="/org/:slug" element={<IssuerPage />} />
      {publicRoutes()}
      <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
