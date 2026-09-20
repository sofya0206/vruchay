import { useNavigate } from 'react-router-dom';
import { FilePlus2, Plus } from 'lucide-react';
import { useOverview } from '../api/overview';
import { useAnalyticsSummary } from '../api/analytics';
import { useMe } from '../auth/useAuth';
import { onboarding } from '../onboarding/store';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/ErrorState';
import { Loading } from '../ui/Loading';
import { NextAction } from '../ui/NextAction';
import { Happening } from './Happening';
import { Metrics } from './Metrics';
import { RegistryBlock } from './RegistryBlock';

/** Окно создания живёт в библиотеке — главная только ведёт к нему. */
const NEW_DOCUMENT = '/documents?new=1';

/**
 * Главная кабинета — одно действие и три блока.
 *
 * Заголовка у страницы нет: в колонке слева подсвечена «Главная», и
 * второе слово «Главная» над цифрами ничего к этому не добавляло.
 * Сверху четыре плитки (остаток, выпуск за месяц, доставка писем,
 * проверки по QR), ниже — реестр выданного на три колонки и четвёртая
 * колонка «Что происходит»: идущий выпуск, недошедшие письма, а в простое —
 * последние документы. Сетка одна на всё: четвёртая плитка и колонка справа
 * стоят на одной линии.
 *
 * Единственная залитая кнопка страницы — «Создать документ» — открывает
 * окно создания в библиотеке, а не заводит документ молча с автоназванием:
 * основу и размер листа выбирают там.
 *
 * Реестр стоит в теле страницы, потому что ради него сюда и возвращаются:
 * «найдите и перешлите грамоту Ивановой» — самый частый вопрос после
 * мероприятия.
 */
export function OverviewPage() {
  const me = useMe();
  const overview = useOverview();
  const summary = useAnalyticsSummary('30d');
  const navigate = useNavigate();
  // Ждём и того, кто вошёл: без почты не сказать, видел ли этот человек
  // обучение, а показать его на миг и убрать — хуже, чем секунда загрузки.
  if (overview.isPending || me.isPending) return <Loading />;

  if (overview.isError || !overview.data) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorState
          title="Сводка не загрузилась"
          onRetry={() => void overview.refetch()}
          retrying={overview.isFetching}
          code={String(overview.error)}
        />
      </main>
    );
  }

  const data = overview.data;

  // Организация ещё ничего не начинала: нули в плитках и пустой реестр
  // ничего не скажут — вместо сводки одно приглашение.
  if (data.materials === 0) {
    return (
      <main className="grid min-w-0 flex-1 place-items-center px-4 py-8 sm:px-6">
        <NextAction
          icon={FilePlus2}
          title="Создайте первый документ"
          text="Загрузите свой бланк, расставьте поля и выпустите документы списком. Сводка, реестр и письма появятся здесь сами."
          primary={
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              data-tour="create-document"
              onClick={() => navigate(NEW_DOCUMENT)}
            >
              Создать документ
            </Button>
          }
          secondary={{ label: 'Как это работает', onClick: () => onboarding.open() }}
        />
      </main>
    );
  }

  // Поля те же, что у остальных разделов (SectionLayout): под колонкой
  // слева главная начинается на той же линии, что документы и реестр.
  return (
    <main className="min-w-0 flex-1 px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex justify-end max-md:hidden">
        <Button
          variant="primary"
          icon={<Plus size={16} />}
          data-tour="create-document"
          onClick={() => navigate(NEW_DOCUMENT)}
        >
          Создать документ
        </Button>
      </div>
      {/* На телефоне главное действие — внизу, под большим пальцем, а не
          в правом верхнем углу, куда одной рукой не дотянуться. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-4 pt-3 md:hidden"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <Button
          variant="primary"
          size="lg"
          icon={<Plus size={20} />}
          data-tour="create-document"
          className="w-full"
          onClick={() => navigate(NEW_DOCUMENT)}
        >
          Создать документ
        </Button>
      </div>
      {/* Одна сетка на плитки и на нижний ряд: реестр занимает три
          колонки, «Что происходит» — четвёртую, ровно под четвёртой
          плиткой. Плитки на телефоне — два на два: организатор на
          мероприятии смотрит сводку одним взглядом, без прокрутки. */}
      <div className="grid grid-cols-2 items-start gap-3 sm:gap-4 lg:grid-cols-4">
        <Metrics data={data} summary={summary.data} />
        <div className="col-span-2 min-w-0 lg:col-span-3">
          <RegistryBlock />
        </div>
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <Happening data={data} />
        </div>
      </div>
      {/* Место под приклеенной кнопкой, чтобы она не закрывала конец страницы. */}
      <div aria-hidden className="h-20 md:hidden" />
    </main>
  );
}
