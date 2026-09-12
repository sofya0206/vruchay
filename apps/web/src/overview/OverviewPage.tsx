import { useState } from 'react';
import { useOverview } from '../api/overview';
import { useMe } from '../auth/useAuth';
import { Loading } from '../ui/Loading';
import { DocsLinks } from './DocsLinks';
import { Flow } from './Flow';
import { Happening } from './Happening';
import { Metrics } from './Metrics';
import { RecentDocuments } from './RecentDocuments';
import { RegistryBlock } from './RegistryBlock';
import { Welcome } from './Welcome';
import { markWelcomeSeen, welcomeSeen } from './welcome-seen';

/**
 * Главная кабинета — сводка и реестр, а не оглавление.
 *
 * Сверху вниз: путь награждения с единственной залитой кнопкой, четыре
 * плитки (остаток, выпуск за месяц, доставка писем, проверки по QR),
 * ниже — реестр выданного во всю ширину и колонка справа: что идёт
 * сейчас и недавние документы.
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

  // Во всю ширину окна и с теми же полями, что у шапки: первая карточка
  // начинается ровно под знаком, а справа не остаётся пустого поля,
  // из-за которого вся страница выглядела сдвинутой влево.
  return (
    <>
      <main className="w-full px-3 pt-5 pb-10 sm:px-5">
        <div className="grid gap-4">
          <Flow data={data} />
          <Metrics data={data} />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <RegistryBlock />
            <div className="grid gap-4">
              <Happening data={data} />
              <RecentDocuments data={data} />
            </div>
          </div>
        </div>
      </main>
      {/* Снаружи `main`: подвал должен прижиматься к низу окна, а внутри
          страницы он прижимался бы к концу текста. */}
      <DocsLinks />
    </>
  );
}
