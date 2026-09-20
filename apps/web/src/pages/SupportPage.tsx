import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Support } from '../settings/Support';
import { Roadmap } from '../settings/Roadmap';
import { Review } from '../settings/Review';
import { PageHeader } from '../ui/PageHeader';
import { PageLayout } from '../ui/SectionLayout';
import { SettingsStack } from '../ui/Settings';

/**
 * Поддержка: обращения, дорожная карта и отзыв — одной страницей.
 *
 * Раньше это лежало в настройках, хотя ничего не настраивает. Теперь
 * открывается из меню «Помощь» внизу колонки разделов; якоря
 * `#roadmap` и `#review` ведут к нужной части.
 */
export function SupportPage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <PageLayout head={<PageHeader title="Поддержка" />}>
      <div className="mx-auto max-w-3xl">
        <SettingsStack>
          <Support />
          <div id="roadmap" className="scroll-mt-24">
            <Roadmap />
          </div>
          <div id="review" className="scroll-mt-24">
            <Review />
          </div>
        </SettingsStack>
      </div>
    </PageLayout>
  );
}
