import { Button } from '../ui/Button';

/**
 * Экран интеграции, у которой ещё нет серверной части.
 *
 * Показываем ровно то, что человек увидит и потом: заголовок площадки
 * и кнопку «Создать интеграцию». Кнопка неактивна — обещать нажатие,
 * которое ничего не сделает, хуже, чем честно показать, что раздел
 * готовится.
 */
export function CreateStub({ title, about }: { title: string; about: string }) {
  return (
    <section>
      <h2 className="font-serif text-xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">{about}</p>

      <Button variant="primary" className="mt-5" disabled>
        Создать интеграцию
      </Button>
      <p className="mt-2 text-xs text-[var(--text-muted)]">Раздел готовится</p>
    </section>
  );
}
