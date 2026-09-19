import { InviteFriend } from '../settings/InviteFriend';
import { PageLayout, SectionTitle } from '../ui/SectionLayout';

/** «Пригласить друга» — своя страница из меню «Помощь», а не пункт настроек. */
export function ReferralPage() {
  return (
    <PageLayout head={<SectionTitle>Пригласить друга</SectionTitle>}>
      <div className="mx-auto max-w-3xl">
        <InviteFriend />
      </div>
    </PageLayout>
  );
}
