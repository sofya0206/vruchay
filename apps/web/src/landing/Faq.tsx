import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FAQ_ITEMS } from './faq-items';

/**
 * Вопросы и ответы.
 *
 * Структура взята из блока FAQ 3 каталога 21st.dev, реализация своя: готовый
 * компонент тянет за собой Radix, cva и структуру shadcn, которых в проекте
 * нет. Раскрытие сделано переходом grid-template-rows с 0fr на 1fr — высота
 * анимируется без замеров и без библиотеки.
 *
 * Сами вопросы лежат в faq-items.ts: тот же текст уходит в разметку
 * для поисковиков, и двух копий у него быть не должно.
 */

export function Faq() {
  // Первый вопрос открыт: пустая гармошка не показывает, что внутри вообще есть.
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="border-t border-[var(--line)]">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="font-serif text-3xl">Вопросы, которые задают до подписания</h2>
        <p className="mt-2 text-[var(--text-muted)]">
          Если вашего вопроса здесь нет — напишите, ответим по существу.
        </p>

        <div className="mt-10">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="border-b border-[var(--line)]">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left transition-opacity duration-200 hover:opacity-65"
                >
                  <span className="font-medium">{item.q}</span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-[var(--text-muted)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {/* Высота анимируется переходом строки сетки с 0fr на 1fr:
                    никаких замеров содержимого и никакой библиотеки. */}
                <div
                  id={`faq-answer-${i}`}
                  role="region"
                  className="grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                  style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <p className="pb-4 text-sm leading-relaxed text-[var(--text-muted)]">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
