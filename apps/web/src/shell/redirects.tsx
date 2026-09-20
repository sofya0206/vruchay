import { Navigate, useLocation, useParams } from 'react-router-dom';
import { legacyWorkspaceTab, materialPath } from '../documents/material-steps';
import { movedViewTarget } from '../editor/moved-views';

/**
 * Старые адреса ведут в новые места, а не в «страница не найдена».
 *
 * Ссылки на рабочее место материала разошлись по письмам коллегам,
 * закладкам и истории браузера; «Оплата» и «Интеграции» стояли пунктами
 * меню, и на них ссылалась поддержка. Таблица одна, и она же проверяется
 * тестом: адрес, который перестал открываться, — поломка, а не мелочь.
 */
export function legacyTarget(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search);

  const workspace = pathname.match(/^\/mailing\/([^/]+)\/?$/);
  if (workspace) return materialPath(decodeURIComponent(workspace[1]), legacyWorkspaceTab(params.get('tab')));

  const editor = pathname.match(/^\/documents\/([^/]+)\/?$/);
  if (editor && params.get('view')) return movedViewTarget(params.get('view'), decodeURIComponent(editor[1]));

  if (pathname === '/mailing') {
    const list = params.get('list');
    if (!list || list === 'all') return null;
    if (list === 'stats') return '/mailing/stats';
    if (list === 'new') return params.get('mode') === 'text' ? '/mailing/new?mode=text' : '/mailing/new';
    if (list === 'lists') return '/documents';
    if (list === 'queued' || list === 'delivered' || list === 'undelivered') return `/mailing?status=${list}`;
    return '/mailing';
  }

  if (pathname === '/analytics') return '/registry?tab=analytics';
  if (pathname === '/billing') return '/settings/billing';
  if (pathname === '/integrations' || pathname.startsWith('/integrations/')) return '/settings/integrations';

  switch (pathname) {
    case '/settings/support':
      return '/support';
    case '/settings/referral':
      return '/referral';
    case '/settings/domains':
    case '/settings/senders':
      return '/settings/mail';
    case '/settings/privacy':
      return '/settings/organization';
    case '/settings/tokens':
      return '/settings/integrations#api';
    default:
      return null;
  }
}

/** Элемент маршрута: считает новый адрес по старому и уводит туда. */
export function LegacyRedirect({ fallback = '/' }: { fallback?: string }) {
  const { pathname, search } = useLocation();
  // Параметры маршрута уже разобраны роутером — берём путь целиком.
  useParams();
  const to = legacyTarget(pathname, search) ?? fallback;
  return <Navigate to={to} replace />;
}
