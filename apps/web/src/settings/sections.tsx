import type { ReactNode } from 'react';
import {
  AtSign,
  Building2,
  Eye,
  Gift,
  Globe,
  LifeBuoy,
  Palette,
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
import { Senders } from './Senders';
import { Team } from './Team';
import { RolePermissions } from './RolePermissions';
import { Sessions } from './Sessions';
import { AuditLog } from './AuditLog';
import { ApiTokens } from './ApiTokens';
import { Interface } from './Interface';
import { PublicProfile } from './PublicProfile';
import { RetentionPolicy } from './RetentionPolicy';
import { InviteFriend } from './InviteFriend';
import { Support } from './Support';
import { Roadmap } from './Roadmap';
import { Review } from './Review';

export interface SettingsSection {
  /** Часть адреса после /settings/ — она же ключ раздела. */
  path: string;
  title: string;
  icon: LucideIcon;
  element: ReactNode;
}

function Stack({ children }: { children: ReactNode }) {
  return <div className="space-y-10">{children}</div>;
}

/**
 * Разделы настроек.
 *
 * Раньше это было одно полотно сверху вниз: чтобы дойти до журнала
 * действий, приходилось пролистать домены и приглашения, а дать коллеге
 * ссылку «вот здесь настрой отправителя» было нельзя вовсе. Теперь
 * у каждого раздела свой адрес, и список ниже — единственное место,
 * где он заводится: и меню, и маршруты берут его отсюда.
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    path: 'account',
    title: 'Аккаунт',
    icon: UserRound,
    element: (
      <Stack>
        <MyProfile />
        <ChangePassword />
        <TwoFactor />
        <DeleteAccount />
      </Stack>
    ),
  },
  {
    path: 'organization',
    title: 'Организация',
    icon: Building2,
    element: (
      <Stack>
        <OrgName />
        <Billing />
      </Stack>
    ),
  },
  {
    path: 'domains',
    title: 'Домены',
    icon: Globe,
    element: (
      <Stack>
        <MailDomains />
        <VerifyDomain />
      </Stack>
    ),
  },
  { path: 'senders', title: 'Адреса рассылки', icon: AtSign, element: <Senders /> },
  {
    path: 'team',
    title: 'Команда и роли',
    icon: Users,
    element: (
      <Stack>
        <Team />
        <RolePermissions />
      </Stack>
    ),
  },
  {
    path: 'security',
    title: 'Безопасность',
    icon: ShieldCheck,
    element: (
      <Stack>
        <Sessions />
        <AuditLog />
        <ApiTokens />
      </Stack>
    ),
  },
  { path: 'interface', title: 'Интерфейс', icon: Palette, element: <Interface /> },
  {
    path: 'privacy',
    title: 'Конфиденциальность',
    icon: Eye,
    element: (
      <Stack>
        <PublicProfile />
        <RetentionPolicy />
      </Stack>
    ),
  },
  { path: 'referral', title: 'Пригласить друга', icon: Gift, element: <InviteFriend /> },
  {
    path: 'support',
    title: 'Поддержка',
    icon: LifeBuoy,
    element: (
      <Stack>
        <Support />
        <Roadmap />
        <Review />
      </Stack>
    ),
  },
  // Формы на сайте здесь больше нет: у интеграций свой раздел кабинета,
  // и пока страница жила в обоих местах, два раздела показывали одно
  // и то же. Старый адрес /settings/integrations уводит туда — в App.tsx.
];
