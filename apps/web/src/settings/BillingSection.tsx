import { MessageCircle, Receipt } from 'lucide-react';
import { useOverview } from '../api/overview';
import { useMe } from '../auth/useAuth';
import { Button } from '../ui/Button';
import { ErrorBar } from '../ui/ErrorState';
import { SettingsSection, SettingsStack } from '../ui/Settings';
import { SkeletonTiles } from '../ui/Skeleton';
import { Stat } from '../ui/Stat';
import { Billing } from './Billing';

/**
 * Тариф и оплата — одно место, а не два.
 *
 * Раньше «Оплата» стояла пунктом меню и повторялась в настройках
 * организации. Публичных цен нет — единственный путь дальше «Обсудить
 * условия», поэтому и раздел маленький: сколько осталось, как продлить,
 * реквизиты для счёта.
 */
export function BillingSection() {
  const overview = useOverview();
  const me = useMe();
  const usage = overview.data?.usage;
  const unlimited = !usage || usage.limit === null || usage.left === null;
  const low = usage?.warn === 'critical' || usage?.warn === 'exhausted' || usage?.warn === 'expired';

  return (
    <SettingsStack>
      <SettingsSection
        title={usage?.source === 'trial' ? 'Бесплатная проба' : (usage?.planName ?? 'Тариф')}
        about="Считаются только созданные файлы. Черновики, правки макета и повторные просмотры не тратят ничего."
        action={
          <a href="/obsudit" target="_blank" rel="noopener noreferrer">
            <Button variant="primary" icon={<MessageCircle size={16} />}>
              Обсудить условия
            </Button>
          </a>
        }
      >
        {overview.isPending ? (
          <SkeletonTiles count={2} />
        ) : overview.isError ? (
          <ErrorBar onRetry={() => void overview.refetch()}>Остаток не загрузился</ErrorBar>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat
              label={usage?.source === 'trial' ? 'Осталось на пробе' : 'Осталось по плану'}
              value={unlimited ? '∞' : (usage?.left ?? 0)}
              tone={low ? 'danger' : 'default'}
              hint={
                usage?.expired ? 'Срок плана закончился — выданные документы остаются действительными.' : undefined
              }
            />
            {!unlimited && usage && (
              <Stat label="Использовано" value={usage.used} unit={`из ${usage.limit}`} />
            )}
          </div>
        )}
      </SettingsSection>

      <Billing />

      {me.data?.isPlatform && (
        <SettingsSection title="Счета и заявки" about="Для владельца сервиса: кто и что запросил, что оплачено.">
          <Button to="/invoices" icon={<Receipt size={16} />}>
            Открыть счета
          </Button>
        </SettingsSection>
      )}
    </SettingsStack>
  );
}
