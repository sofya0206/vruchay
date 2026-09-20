import { InviteFriend } from '../settings/InviteFriend';
import { PageHeader } from '../ui/PageHeader';
import { PageLayout } from '../ui/SectionLayout';

/** «Пригласить друга» — своя страница из меню «Помощь», а не пункт настроек. */
export function ReferralPage() {
  return (
    <PageLayout head={<PageHeader title="Пригласить друга" />}>
      <div className="mx-auto max-w-3xl">
        <InviteFriend />
      </div>
    </PageLayout>
  );
}
