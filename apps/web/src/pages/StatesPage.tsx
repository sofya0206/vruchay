import { useEffect, useState, type ReactNode } from 'react';
import { FileText, Users } from 'lucide-react';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBar, ErrorState } from '../ui/ErrorState';
import { Outcome } from '../ui/Outcome';
import { ProgressBar } from '../ui/Progress';
import { SkeletonCards, SkeletonForm, SkeletonRows, SkeletonTiles } from '../ui/Skeleton';

/**
 * Витрина состояний: пустое, загрузка, ошибка, частичный успех, прогресс.
 *
 * Только в разработке (см. App.tsx): здесь состояния видно без того,
 * чтобы ронять сервер или ждать выпуск на триста строк. Дизайнер
 * и разработчик смотрят на одно и то же.
 */
export function StatesPage() {
  const [done, setDone] = useState(0);
  const total = 300;
  useEffect(() => {
    const t = setInterval(() => setDone((d) => (d >= total ? 0 : d + 7)), 900);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-8">
      <h1 className="text-2xl font-medium">Состояния экрана</h1>

      <Block title="Пустое">
        <div className="card">
          <EmptyState
            icon={Users}
            title="Здесь появятся получатели"
            action={
              <>
                <Button variant="primary">Загрузить таблицу</Button>
                <Button variant="ghost">Скачать пример</Button>
              </>
            }
          >
            Хватит колонок «Фамилия», «Имя» и «Почта»
          </EmptyState>
        </div>
      </Block>

      <Block title="Загрузка">
        <SkeletonTiles />
        <SkeletonCards count={3} />
        <div className="card overflow-hidden p-0">
          <SkeletonRows rows={4} />
        </div>
        <div className="card max-w-md">
          <SkeletonForm fields={2} />
        </div>
      </Block>

      <Block title="Долгая операция">
        <div className="card">
          <ProgressBar
            done={done}
            failed={Math.floor(done / 25)}
            total={total}
            running={done < total}
          />
        </div>
      </Block>

      <Block title="Ошибка">
        <div className="card">
          <ErrorState title="Документы не открылись" onRetry={() => undefined} />
        </div>
        <ErrorBar onRetry={() => undefined}>
          Файл не читается: он в кодировке Windows‑1251, так сохраняет 1С. Преобразуем
          автоматически.
        </ErrorBar>
      </Block>

      <Block title="Частичный успех">
        <div className="card">
          <Outcome
            done={287}
            failed={13}
            doneLabel="выпущено"
            action={
              <>
                <Button variant="primary">Показать 13 строк</Button>
                <Button>Скачать 287 PDF</Button>
              </>
            }
          />
        </div>
        <div className="card">
          <Outcome done={412} skipped={6} doneLabel="отправлено" skippedLabel="без адреса" />
        </div>
      </Block>

      <Block title="Пустое: поиск">
        <div className="card">
          <EmptyState icon={FileText} title="Ничего не нашлось">
            Измените запрос или откройте другую папку
          </EmptyState>
        </div>
      </Block>
    </main>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium tracking-wider text-[var(--text-muted)] uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
