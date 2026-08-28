import { Link } from 'react-router-dom';
import { HardHat } from 'lucide-react';
import { Button } from '../ui/Button';
import { SECTIONS } from './sections';

/**
 * Заглушка раздела, который ещё делается.
 *
 * Говорит прямо: раздела пока нет. Пустой экран без объяснения человек
 * читает как поломку и идёт писать в поддержку, а обещание «скоро» без
 * выхода оставляет его в тупике — поэтому внизу стоит ссылка туда, где
 * работа действительно делается.
 */
export function SectionStub({ path }: { path: string }) {
  const section = SECTIONS.find((s) => s.path === path);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold">{section?.label ?? 'Раздел'}</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{section?.about}</p>

      <div className="mt-6 rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-16 text-center">
        <HardHat size={28} className="mx-auto mb-3 text-[var(--text-muted)]" strokeWidth={1.5} />
        <p className="font-medium">Раздел в работе</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--text-muted)]">
          Мы его ещё делаем. Всё, что нужно для награждения, уже работает в материалах: список
          участников, проверка, выпуск и рассылка.
        </p>
        <Link to="/documents" className="mt-5 inline-block">
          <Button variant="primary">Перейти к материалам</Button>
        </Link>
      </div>
    </main>
  );
}
