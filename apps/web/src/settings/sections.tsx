import type { ReactNode } from 'react';
import {
  AtSign,
  Building2,
  Eye,
  Globe,
  KeyRound,
  Palette,
  ScrollText,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MyProfile, OrgName } from './Organization';
import { ChangePassword } from './ChangePassword';
import { TwoFactor } from './TwoFactor';
import { DeleteAccount } from './DeleteAccount';
import { Billing } from './Billing';
import { MailDomains } from './MailDomains';
import { VerifyDomain } from './VerifyDomain';
import { DesktopFirst } from '../ui/DesktopFirst';
import { Senders } from './Senders';
import { Team } from './Team';
import { RolePermissions } from './RolePermissions';
import { Sessions } from './Sessions';
import { AuditLog } from './AuditLog';
import { ApiTokens } from './ApiTokens';
import { Interface } from './Interface';
import { PublicProfile } from './PublicProfile';
import { RetentionPolicy } from './RetentionPolicy';
import { SettingsStack } from '../ui/Settings';

/** Кому принадлежит настройка: человеку, организации или её интеграциям. */
export type SettingsGroup = 'you' | 'org' | 'dev';

export const SETTINGS_GROUPS: { key: SettingsGroup; title: string }[] = [
  { key: 'you', title: 'Вы' },
  { key: 'org', title: 'Организация' },
  { key: 'dev', title: 'Разработчикам' },
];

export interface SettingsSection {
  /** Часть адреса после /settings/ — она же ключ раздела. */
  path: string;
  title: string;
  icon: LucideIcon;
  group: SettingsGroup;
  element: ReactNode;
}

/**
 * Разделы настроек.
 *
 * У каждого раздела свой адрес, и список ниже — единственное место,
 * где он заводится: и меню, и маршруты берут его отсюда.
 *
 * Разделы сгруппированы по владельцу: личное («Вы»), общее для
 * организации и то, что нужно только тому, кто подключает API.
 * Поддержка, дорожная карта, отзыв и приглашение друга настройками
 * не были и переехали в меню «Помощь» внизу колонки разделов;
 * старые адреса ведут туда — см. App.tsx.
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    path: 'account',
    title: 'Аккаунт',
    icon: UserRound,
    group: 'you',
    element: (
      <SettingsStack>
        <MyProfile />
        <ChangePassword />
        <TwoFactor />
        <DeleteAccount />
      </SettingsStack>
    ),
  },
  { path: 'interface', title: 'Интерфейс', icon: Palette, group: 'you', element: <Interface /> },
  { path: 'security', title: 'Устройства и входы', icon: ShieldCheck, group: 'you', element: <Sessions /> },
  {
    path: 'organization',
    title: 'Организация и оплата',
    icon: Building2,
    group: 'org',
    element: (
      <SettingsStack>
        <OrgName />
        <Billing />
      </SettingsStack>
    ),
  },
  {
    path: 'team',
    title: 'Команда и роли',
    icon: Users,
    group: 'org',
    element: (
      <SettingsStack>
        <Team />
        <RolePermissions />
      </SettingsStack>
    ),
  },
  {
    path: 'domains',
    title: 'Домены',
    icon: Globe,
    group: 'org',
    element: (
      <DesktopFirst
        title="Настройку доменов"
        why="Понадобится скопировать несколько длинных DNS-записей в панель регистратора — с двумя окнами рядом это минута, а с телефона легко ошибиться в одном знаке."
      >
        <SettingsStack>
          <MailDomains />
          <VerifyDomain />
        </SettingsStack>
      </DesktopFirst>
    ),
  },
  { path: 'senders', title: 'Адреса рассылки', icon: AtSign, group: 'org', element: <Senders /> },
  {
    path: 'privacy',
    title: 'Конфиденциальность',
    icon: Eye,
    group: 'org',
    element: (
      <SettingsStack>
        <PublicProfile />
        <RetentionPolicy />
      </SettingsStack>
    ),
  },
  { path: 'audit', title: 'Журнал действий', icon: ScrollText, group: 'org', element: <AuditLog /> },
  { path: 'tokens', title: 'Токены API', icon: KeyRound, group: 'dev', element: <ApiTokens /> },
];
