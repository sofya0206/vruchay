import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useOverview } from '../api/overview';
import { useMe } from '../auth/useAuth';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { PageHeader } from '../ui/PageHeader';
import { allStepsDone, firstSteps } from './desk';
import { DocsLinks } from './DocsLinks';
import { FirstSteps } from './FirstSteps';
import { protocolTitle } from './format';
import { Happening } from './Happening';
import { Metrics } from './Metrics';
import { MyDocuments } from './MyDocuments';
import { RegistryBlock } from './RegistryBlock';
import { markStepsHidden, stepsHidden } from './steps-hidden';
import { useCreateMaterial } from './useCreateMaterial';

/**
 * Главная кабинета — стол, отвечающий на один вопрос: что делать дальше.
 *
 * Сверху вниз, по убыванию частоты:
 *
 * 1. Приветствие и одна большая кнопка — завести документ. Это то, ради
 *    чего сюда приходят чаще всего, и кнопка не должна искаться.
 * 2. Первые шаги — три галочки для новой организации; уходят, как только
 *    всё пройдено или человек их убрал.
 * 3. Цифры — сколько выдано и сколько осталось.
 * 4. Что идёт прямо сейчас — только когда идёт; в тишине блока нет.
 * 5. Последние документы карточками и поиск по реестру одной строкой.
 *
 * Всё остальное — настройки сайта, аналитика, полный реестр — за ссылками
 * и в колонке разделов слева: на главной не должно быть ничего, что нужно
 * реже раза в день.
 */
export function OverviewPage() {
  const me = useMe();
  const overview = useOverview();
  const create = useCreateMaterial();
  // Нажатие в этой же вкладке: localStorage мы уже прочитали и второй раз
  // за ним не пойдём, поэтому закрытие держим и в состоянии страницы.
  const [hidden, setHidden] = useState(false);

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
  const name = me.data?.name?.trim().split(/\s+/)[0];
  const showSteps = !allStepsDone(firstSteps(data)) && !hidden && !stepsHidden(email);

  function hideSteps() {
    markStepsHidden(email);
    setHidden(true);
  }

  return (
    <div className="flex flex-1 flex-col bg-[var(--surface-sunken)]">
      <main className="w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 sm:pt-8">
        <PageHeader
          title={name ? `Здравствуйте, ${name}` : 'Здравствуйте'}
          about="Загрузите бланк, добавьте список получателей — выпустим всё разом."
          actions={
            <Button
              variant="primary"
              size="lg"
              icon={<Plus size={18} />}
              disabled={create.isPending}
              onClick={() => create.mutate(protocolTitle())}
            >
              Создать документ
            </Button>
          }
        />

        {create.isError && (
          <p role="alert" className="mb-4 text-sm text-[var(--danger)]">
            Не удалось создать документ. Попробуйте ещё раз или откройте «Документы».
          </p>
        )}

        <div className="grid gap-4 sm:gap-6">
          {showSteps && <FirstSteps data={data} onHide={hideSteps} />}
          <Metrics data={data} />
          <Happening data={data} />
          <MyDocuments data={data} />
          <RegistryBlock />
        </div>
      </main>
      {/* Подвал прижат к низу окна, а не к концу текста. */}
      <DocsLinks />
    </div>
  );
}
