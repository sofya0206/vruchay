import { Link } from 'react-router-dom';
import { Award, ArrowLeft } from 'lucide-react';
import { Button } from '../ui/Button';
import { Meta } from '../seo/Meta';

/**
 * Страница ненайденного адреса.
 *
 * Сделана в виде наградного документа — шутка уместна ровно настолько,
 * чтобы человек улыбнулся, но она же и объясняет, чем занимается сервис:
 * на эту страницу нередко попадают из поиска или по кривой ссылке, и для
 * части посетителей она оказывается первой.
 *
 * Полезность важнее шутки, поэтому под «грамотой» стоят настоящие выходы:
 * на главную и в кабинет. Тупик без выхода — худшее, чем может быть 404.
 *
 * Закрыта от индексации: страница ошибки в выдаче не нужна никому.
 */
export function NotFoundPage() {
  return (
    <>
      <Meta
        title="Страница не найдена — Вручай"
        description="Такой страницы нет. Вернитесь на главную."
        path="/404"
        noindex
      />

      <div className="grid min-h-full place-items-center bg-[var(--ground)] px-6 py-16">
        <div className="w-full max-w-md text-center">
          <div className="vru-enter relative">
            {/* Второй лист под первым: та же стопка, что на главной, —
                страница ошибки не должна выглядеть из другого сервиса. */}
            <div className="absolute -right-2.5 -bottom-2.5 -z-10 h-full w-full rotate-[2deg] rounded-xl bg-[var(--surface-sunken)] ring-1 ring-[var(--line)]" />
            <div className="rotate-[-1.5deg] rounded-xl bg-[var(--surface)] p-8 shadow-[0_20px_60px_-20px_rgba(20,32,26,0.35)] ring-1 ring-[var(--line)] transition-transform duration-300 hover:rotate-0">
              <div className="rounded-lg border border-[var(--award)]/30 px-6 py-8">
                <span className="mx-auto grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Award size={18} strokeWidth={1.75} />
                </span>
                <p className="mt-5 text-[10px] tracking-[0.25em] text-[var(--text-muted)] uppercase">
                  Награждается
                </p>
                <p className="mt-2 font-serif text-xl">Любознательный посетитель</p>
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  за обнаружение страницы,
                  <br />
                  которой не существует
                </p>
                <p className="mt-6 font-serif text-5xl text-[var(--accent)]">404</p>
              </div>
            </div>
          </div>

          <p className="mt-8 text-[var(--text-muted)]">
            Ссылка устарела или в адресе опечатка. Настоящие документы мы выдаём
            надёжнее — этот, увы, единственный в своём роде.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/">
              <Button variant="primary" icon={<ArrowLeft size={16} />}>
                На главную
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary">Войти в кабинет</Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
