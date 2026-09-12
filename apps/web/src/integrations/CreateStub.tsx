import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';

/**
 * Экран интеграции, у которой ещё нет серверной части.
 *
 * Говорим прямо, что готовим подключение, и даём дорогу — написать нам:
 * кнопка «Создать», которая ничего не делает, читалась бы как поломка.
 */
export function CreateStub({
  icon,
  title,
  about,
}: {
  icon: LucideIcon;
  title: string;
  about: string;
}) {
  return (
    <div className="card">
      <EmptyState icon={icon} title={title} action={
        <Link to="/settings/support">
          <Button>Написать в поддержку</Button>
        </Link>
      }>
        {about}
        <span className="mt-2 block">Подключение готовится — напишите нам, и мы расскажем, когда оно появится.</span>
      </EmptyState>
    </div>
  );
}
