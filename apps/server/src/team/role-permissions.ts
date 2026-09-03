import type { OrgRole } from '@prisma/client';

/**
 * Что может каждая роль — единый список для кабинета.
 *
 * Права на самом деле проверяет сервер, декораторами @Roles на маршрутах.
 * Этот список — их человекочитаемое отражение: чтобы владелец, выбирая
 * роль сотруднику, видел последствия, а не гадал по названию. Меняя
 * @Roles на маршруте, поправьте и строку здесь: тест рядом следит только
 * за полнотой таблицы, а не за её правдивостью.
 */
export interface Permission {
  key: string;
  title: string;
  roles: Record<OrgRole, boolean>;
}

const all = { owner: true, admin: true, member: true } as const;
const managers = { owner: true, admin: true, member: false } as const;
const ownerOnly = { owner: true, admin: false, member: false } as const;

export const PERMISSIONS: Permission[] = [
  { key: 'documents.edit', title: 'Готовить макеты и списки получателей', roles: all },
  { key: 'documents.issue', title: 'Выпускать документы и рассылать письма', roles: all },
  { key: 'registry.view', title: 'Смотреть реестр и проверять подлинность', roles: all },
  { key: 'registry.revoke', title: 'Отзывать выданные документы', roles: managers },
  { key: 'documents.purge', title: 'Окончательно удалять материалы', roles: managers },
  {
    key: 'org.settings',
    title: 'Менять название, публичную страницу и реквизиты',
    roles: managers,
  },
  { key: 'mail.domains', title: 'Подключать домены и адреса отправки', roles: managers },
  { key: 'integrations', title: 'Настраивать формы на сайте и токены API', roles: managers },
  { key: 'team.manage', title: 'Приглашать сотрудников и менять их права', roles: managers },
  { key: 'audit.view', title: 'Читать журнал действий организации', roles: managers },
  { key: 'billing', title: 'Оплачивать тариф и получать закрывающие', roles: ownerOnly },
  { key: 'org.transfer', title: 'Передавать организацию другому владельцу', roles: ownerOnly },
];

export const ROLE_TITLE: Record<OrgRole, string> = {
  owner: 'Владелец',
  admin: 'Управляющий',
  member: 'Сотрудник',
};
