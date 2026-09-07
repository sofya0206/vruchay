import { useState } from 'react';
import { useOverview } from '../api/overview';
import { useMe } from '../auth/useAuth';
import { Loading } from '../ui/Loading';
import { DocsLinks } from './DocsLinks';
import { Metrics } from './Metrics';
import { QuickActions } from './QuickActions';
import { SectionNav } from './SectionNav';
import { Welcome } from './Welcome';
import { markWelcomeSeen, welcomeSeen } from './welcome-seen';

/**
 * Рабочий стол кабинета.
 *
 * Первое, что человек видит после входа. Не витрина возможностей:
 * сверху — то, ради чего он пришёл (выпустить документы), под ним —
 * цифры, по которым он решает, хватит ли пробы, и последние мероприятия,
 * чтобы вернуться к вчерашнему списку в одно нажатие.
 *
 * У новой организации перед этим стоит входное обучение: пока ничего
 * не выпущено, рабочий стол показывать нечему.
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

  // Обучение живёт в своей обёртке: ему нужна вся высота окна, а рабочему
  // столу — только высота содержимого. Ширина у обеих одна и та же, что
  // и у шапки: разойдись она — логотип и разделы встали бы не по краю.
  if (welcome) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8">
        <Welcome onDone={onDone} />
      </main>
    );
  }

  // Во всю ширину окна, как шапка: колонка по центру отодвигала цифры
  // и плитки от левого края, тогда как кнопка «Главная» стояла у самого
  // края, — и первая строка страницы не сходилась с шапкой над ней.
  return (
    <>
      <main className="space-y-10 px-6 py-8">
        {/* Цифры стоят первыми и вместо приветствия: верхняя строка экрана
            должна что-то сообщать, а «Здравствуйте» не сообщает ничего. */}
        <Metrics data={data} />
        <QuickActions data={data} />
        {/* Разделы кабинета: главная и есть навигация по сервису, поэтому
            они стоят на ней целиком, а не лентой в шапке. */}
        <SectionNav data={data} />
      </main>
      {/* Снаружи `main`: подвал должен прижиматься к низу окна, а внутри
          страницы он прижимался бы к концу текста. */}
      <DocsLinks />
    </>
  );
}
