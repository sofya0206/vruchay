import { Link } from 'react-router-dom';
import { Plug } from 'lucide-react';

/**
 * Первый экран раздела.
 *
 * Раньше здесь была кнопка «Узнать больше», которая уводила в справку.
 * Теперь та же справка стоит прямо на экране: человек, который открыл
 * интеграции впервые, за один взгляд понимает, что тут можно подключить,
 * и уходит сразу в нужный раздел, а не в отдельное окно помощи.
 */
export function Info() {
  return (
    <section>
      <div className="rounded-xl bg-[var(--surface)] p-10 text-center ring-1 ring-[var(--line)]">
        <Plug size={40} className="mx-auto text-[var(--text-muted)]" aria-hidden />
        <h2 className="mt-4 font-serif text-3xl">Интеграции</h2>
        <p className="mt-2 text-[var(--text-muted)]">
          Интеграция Вручая с другими сайтами и сервисами
        </p>
      </div>

      <div className="mt-6 rounded-xl bg-[var(--surface)] p-7 ring-1 ring-[var(--line)]">
        <h3 className="font-serif text-2xl">Интеграции</h3>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">Помощь → Интеграции</p>

        <ul className="mt-5 space-y-3.5">
          <Item to="/integrations/tilda" title="Интеграция с Tilda">
            Создание и публикация документов на сайтах, управляемых Тильдой.
          </Item>
          <Item to="/integrations/google-sheets" title="Интеграция с Google Таблицами">
            Автоматическое создание документов из данных в Google Таблицах.
          </Item>
          <Item to="/integrations/telegram" title="Бот в Telegram">
            Ваши участники смогут получить свои документы, указав свои
            персональные данные, например ФИО или адрес электронной почты.
          </Item>
          <Item to="/integrations/link" title="Форма по ссылке">
            Участник переходит по вашей ссылке, сам заполняет данные документа
            и отправляет его себе на почту.
          </Item>
        </ul>

        <h3 className="mt-9 font-serif text-xl">Нужна помощь?</h3>
        <p className="mt-1.5 text-[var(--text-muted)]">
          Напишите нам в{' '}
          <Link to="/settings/support" className="text-[var(--accent)] hover:underline">
            техническую поддержку
          </Link>
          . Мы с радостью поможем вам.
        </p>
      </div>
    </section>
  );
}

function Item({
  to,
  title,
  children,
}: {
  to: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="list-disc marker:text-[var(--line-strong)] ml-5">
      <Link to={to} className="font-medium text-[var(--accent)] hover:underline">
        {title}
      </Link>
      . {children}
    </li>
  );
}
