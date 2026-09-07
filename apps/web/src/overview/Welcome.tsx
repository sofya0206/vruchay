import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { WALKTHROUGH, WalkthroughPanel, WalkthroughTabs } from '../landing/HowItWorks';
import { Button } from '../ui/Button';

/**
 * Первый экран новой организации.
 *
 * Человек только что зарегистрировался: показывать ему четыре ноля и
 * пустые списки значит сообщить лишь то, что сервис пуст. Вместо этого
 * повторяем рассказ с посадочной — те же четыре шага на живых экранах
 * продукта, — чтобы вход в кабинет продолжал разговор, который начался
 * до регистрации, а не начинал новый.
 *
 * Слов вокруг рассказа нет намеренно: заголовок и подводка пересказывали
 * то, что и так написано на самих шагах. Ведёт по шагам стрелка, на
 * последнем она сменяется галочкой — обучение закончилось.
 *
 * Экран занимает всю высоту окна: шаг стоит посередине, закладки прижаты
 * к низу. Иначе рассказ жался к шапке, а под ним оставалось пустое поле
 * в пол-экрана.
 *
 * Галочка закрывает экран навсегда, а не до перезагрузки: подсказка,
 * которую нельзя убрать, из помощи превращается в помеху.
 */
export function Welcome({ onDone }: { onDone: () => void }) {
  const [at, setAt] = useState(0);
  const step = WALKTHROUGH[at];
  const last = at === WALKTHROUGH.length - 1;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-center py-4">
        <div className="w-full">
          <WalkthroughPanel step={step} as="h1" />
        </div>
      </div>

      <div className="mt-10 flex items-end gap-4">
        <WalkthroughTabs
          value={step.id}
          onChange={(id) => setAt(WALKTHROUGH.findIndex((s) => s.id === id))}
          arrows={false}
          className="vru-tabbar--flat min-w-0 flex-1"
        />
        {/*
         * Кнопка одна и стоит на одном месте: подпись ей не нужна, а вот
         * доступное имя нужно — без него на месте кнопки читается «кнопка».
         * Цвет держит сама иконка, а не кнопка: у ghost на наведение свой
         * цвет текста, и заданный на кнопке синий он бы перебил.
         */}
        <Button
          variant="ghost"
          className="mb-2 shrink-0 px-3"
          onClick={last ? onDone : () => setAt(at + 1)}
          aria-label={last ? 'Завершить обучение' : 'Следующий шаг'}
          title={last ? 'Завершить обучение' : 'Следующий шаг'}
          icon={
            last ? (
              <Check size={20} className="text-[var(--accent)]" />
            ) : (
              <ArrowRight size={20} className="text-[var(--accent)]" />
            )
          }
        />
      </div>
    </div>
  );
}
