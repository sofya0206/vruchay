import { useState } from 'react';
import { useOverview } from '../api/overview';
import { useMe } from '../auth/useAuth';
import { Loading } from '../ui/Loading';
import { DocsLinks } from './DocsLinks';
import { Happening } from './Happening';
import { MyDocuments } from './MyDocuments';
import { RegistryBlock } from './RegistryBlock';
import { SiteEmbed } from './SiteEmbed';
import { Welcome } from './Welcome';
import { markWelcomeSeen, welcomeSeen } from './welcome-seen';

/**
 * Рабочий стол кабинета — полоса из четырёх блоков, которую листают.
 *
 * Главная перестала быть оглавлением. Плитки разделов отвечали на вопрос
 * «что здесь есть», которого никто не задаёт дважды: человек приходит
 * делать одну из четырёх работ, и полоса выложена в том порядке, в котором
 * эти работы идут в жизни организации.
 *
 * 1. Мои документы — то, над чем работали, и кнопка завести новое.
 * 2. Письма — выпуск и судьба писем: единственное на главной,
 *    что меняется само.
 * 3. Добавьте на свой сайт — выдача документов посетителям, развёрнутая
 *    настройкой, а не ссылкой.
 * 4. Реестр — поиск по фамилии и последние выданные.
 *
 * Полоса не помещается в экран намеренно. Помещалась она только пока
 * состояла из ссылок; как только на ней встала работа, экран кончился —
 * и это правильнее, чем держать работу за ссылками ради одного экрана.
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

  // Полоса прижата к левому краю, а не поставлена колонкой по центру:
  // Колонка по центру: раньше главная прижималась к левому краю ради
  // кнопки «Главная» в шапке, но шапка теперь во всю ширину и своего
  // левого края у неё нет — а полоса блоков, прибитая к левому краю
  // широкого монитора, читалась как съехавшая. Во всю ширину не
  // растягиваем: список из пяти фамилий на двух тысячах пикселей нечитаем.
  return (
    <>
      <main className="mx-auto w-full max-w-6xl px-6 pt-8 pb-12">
        {/* Линия между блоками — единственное, что их разделяет: рамка
            у каждого превратила бы полосу обратно в набор карточек. */}
        <div className="divide-y divide-[var(--line)]">
          <MyDocuments data={data} />
          <Happening data={data} />
          <SiteEmbed />
          <RegistryBlock />
        </div>
      </main>
      {/* Снаружи `main`: подвал должен прижиматься к низу окна, а внутри
          страницы он прижимался бы к концу текста. */}
      <DocsLinks />
    </>
  );
}
