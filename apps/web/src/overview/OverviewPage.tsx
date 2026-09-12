import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useOverview } from '../api/overview';
import { useMe } from '../auth/useAuth';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { PageHeader } from '../ui/PageHeader';
import { DocsLinks } from './DocsLinks';
import { protocolTitle } from './format';
import { Happening } from './Happening';
import { Metrics } from './Metrics';
import { RecentDocuments } from './RecentDocuments';
import { RegistryBlock } from './RegistryBlock';
import { useCreateMaterial } from './useCreateMaterial';
import { Welcome } from './Welcome';
import { markWelcomeSeen, welcomeSeen } from './welcome-seen';

/**
 * Главная кабинета — сводка и реестр, а не оглавление.
 *
 * Сверху заголовок раздела с единственной залитой кнопкой «Создать
 * документ», под ним четыре плитки (остаток, выпуск за месяц, доставка
 * писем, проверки по QR), ниже — реестр выданного на три колонки
 * и четвёртая колонка: письма и недавние документы. Сетка одна на всё:
 * четвёртая плитка и колонка справа стоят на одной линии.
 *
 * Такой порядок — общий у сервисов, которые смотрели: одно действие
 * в шапке или первой строке, цифры, затем таблица. Реестр стоит в теле
 * страницы, потому что ради него сюда и возвращаются: «найдите и
 * перешлите грамоту Ивановой» — самый частый вопрос после мероприятия.
 *
 * Полоса разделов сверху этой страницы не касается: она общая для всего
 * кабинета и остаётся как есть.
 *
 * У новой организации перед этим стоит входное обучение: пока ничего
 * не выпущено, сводку показывать нечему.
 */
export function OverviewPage() {
  const me = useMe();
  const overview = useOverview();
  const create = useCreateMaterial();
  // Нажатие в этой же вкладке: localStorage мы уже прочитали и второй раз
  // за ним не пойдём, поэтому закрытие держим и в состоянии страницы.
  const [dismissed, setDismissed] = useState(false);

  // Ждём и того, кто вошёл: без почты не сказать, видел ли этот человек
  // обучение, а показать его на миг и убрать — хуже, чем секунда загрузки.
  if (overview.isPending || me.isPending) return <Loading />;

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
  const email = me.data?.email;
  // Обучение — по материалам, а не по выпущенному: организация, у которой
  // материал есть, а документов ещё нет, уже начала работать, и рассказ
  // о том, как здесь выпускают документы, ей только мешает.
  const welcome = data.materials === 0 && !dismissed && !welcomeSeen(email);

  function onDone() {
    markWelcomeSeen(email);
    setDismissed(true);
  }

  if (welcome) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8">
        <Welcome onDone={onDone} />
      </main>
    );
  }

  // Поля те же, что у остальных разделов (SectionLayout): под колонкой
  // слева главная начинается на той же линии, что документы и реестр.
  return (
    <>
      <main className="min-w-0 flex-1 px-6 py-6">
        <PageHeader
          title="Главная"
          about="Сколько осталось, что выпущено за месяц и кому что выдано."
          actions={
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              disabled={create.isPending}
              onClick={() => create.mutate(protocolTitle())}
            >
              Создать документ
            </Button>
          }
        />
        {create.isError && (
          <p role="alert" className="mb-4 text-sm text-[var(--danger)]">
            Не удалось создать документ. Попробуйте ещё раз.
          </p>
        )}
        {/* Одна сетка на плитки и на нижний ряд: реестр занимает три
            колонки, письма с документами — четвёртую, ровно под четвёртой
            плиткой. Две сетки друг под другом ломали эту линию. */}
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metrics data={data} />
          <div className="min-w-0 sm:col-span-2 lg:col-span-3">
            <RegistryBlock />
          </div>
          <div className="grid gap-4 sm:col-span-2 lg:col-span-1">
            <Happening data={data} />
            <RecentDocuments data={data} />
          </div>
        </div>
      </main>
      {/* Снаружи `main`: подвал должен прижиматься к низу окна, а внутри
          страницы он прижимался бы к концу текста. */}
      <DocsLinks />
    </>
  );
}
