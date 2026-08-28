import { useOverview } from '../api/overview';
import { useMe } from '../auth/useAuth';
import { Loading } from '../ui/Loading';
import { EmptyState } from './EmptyState';
import { Metrics } from './Metrics';
import { QuickActions } from './QuickActions';
import { RecentActivity } from './RecentActivity';

/**
 * Рабочий стол кабинета.
 *
 * Первое, что человек видит после входа. Не витрина возможностей:
 * сверху — то, ради чего он пришёл (выпустить документы), под ним —
 * цифры, по которым он решает, хватит ли пробы, и последние мероприятия,
 * чтобы вернуться к вчерашнему списку в одно нажатие.
 */
export function OverviewPage() {
  const me = useMe();
  const overview = useOverview();

  if (overview.isPending) return <Loading />;

  if (overview.isError || !overview.data) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <p role="alert" className="text-[var(--danger)]">
          Не удалось загрузить сводку. Обновите страницу — данные никуда не делись.
        </p>
      </main>
    );
  }

  const data = overview.data;
  // Пустое состояние — по материалам, а не по выпущенному: организация,
  // у которой материал есть, а документов ещё нет, уже начала работать,
  // и подсказка «с чего начать» ей только мешает.
  const fresh = data.materials === 0;

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      {fresh ? (
        <EmptyState data={data} />
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold">
              {me.data?.name ? `Здравствуйте, ${me.data.name}` : 'Рабочий стол'}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Продолжить награждение или начать новое
            </p>
          </div>

          <QuickActions data={data} />
          <Metrics data={data} />
          <RecentActivity data={data} />
        </>
      )}
    </main>
  );
}
