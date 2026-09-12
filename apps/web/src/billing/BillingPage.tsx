import { Link } from 'react-router-dom';
import { Building2, MessageCircle } from 'lucide-react';
import { useOverview } from '../api/overview';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Loading } from '../ui/Loading';
import { PageLayout, SectionTitle } from '../ui/SectionLayout';

/**
 * Оплата: сколько осталось по плану, реквизиты и как договориться о продлении.
 *
 * Публичных цен нет — единственный путь дальше «Обсудить условия». Реквизиты
 * живут в настройках организации, отсюда только дорога к ним.
 */
export function BillingPage() {
  const overview = useOverview();

  if (overview.isPending) return <Loading />;

  const usage = overview.data?.usage;
  const unlimited = !usage || usage.limit === null || usage.left === null;
  const low =
    usage?.warn === 'critical' || usage?.warn === 'exhausted' || usage?.warn === 'expired';

  return (
    <PageLayout head={<SectionTitle>Оплата</SectionTitle>}>
      {/* Две колонки, а не три: «Продлить» и «Реквизиты» — равные по весу
          пути, и делить их как 2:1 было нечем. Верхняя карточка — во всю
          ширину над ними. */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card
          title={usage?.source === 'trial' ? 'Бесплатная проба' : (usage?.planName ?? 'План')}
          className="lg:col-span-2"
        >
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p
                className={`text-4xl font-semibold tabular-nums ${low ? 'text-[var(--danger)]' : ''}`}
              >
                {unlimited ? '∞' : (usage?.left ?? 0)}
              </p>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                {usage?.source === 'trial' ? 'осталось на пробе' : 'осталось по плану'}
              </p>
            </div>
            {!unlimited && usage && (
              <div>
                <p className="text-4xl font-semibold tabular-nums">{usage.used}</p>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                  использовано из {usage.limit}
                </p>
              </div>
            )}
            {usage?.expired && (
              <p className="basis-full text-sm text-[var(--text-muted)]">
                Срок плана закончился — выданные документы остаются действительными.
              </p>
            )}
          </div>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Считаются только созданные файлы. Черновики, правки макета и повторные просмотры не
            тратят ничего.
          </p>
        </Card>

        <Card title="Продлить или расширить">
          <p className="text-sm text-[var(--text-muted)]">
            Расскажите, сколько документов и как часто вы выдаёте, — подберём условия и выставим
            счёт на организацию.
          </p>
          <a href="/obsudit" target="_blank" rel="noopener noreferrer" className="mt-4 inline-block">
            <Button variant="primary" icon={<MessageCircle size={16} />}>
              Обсудить условия
            </Button>
          </a>
        </Card>

        <Card title="Реквизиты">
          <p className="text-sm text-[var(--text-muted)]">
            Название, ИНН и адрес для счетов и закрывающих документов — в настройках организации.
          </p>
          <Link to="/settings/organization" className="mt-4 inline-block">
            <Button icon={<Building2 size={16} />}>Открыть реквизиты</Button>
          </Link>
        </Card>
      </div>
    </PageLayout>
  );
}
