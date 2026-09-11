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
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="mt-2.5 max-w-3xl text-[var(--text-muted)]">{about}</p>

      <Button variant="primary" size="lg" className="mt-6" disabled>
        Создать интеграцию
      </Button>
      <p className="mt-2 text-sm text-[var(--text-muted)]">Раздел готовится</p>
    </section>
  );
}
