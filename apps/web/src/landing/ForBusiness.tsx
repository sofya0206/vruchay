import { Building2, FileCheck2, Scale, Users } from 'lucide-react';
import { Button } from '../ui/Button';

/**
 * Блок для юридических лиц.
 *
 * Организация покупает иначе, чем частный организатор: сначала юридический
 * отдел смотрит, где лежат данные, потом бухгалтерия спрашивает про счёт
 * и закрывающие документы, и только потом кто-то нажимает кнопку. Поэтому
 * здесь не «Начать», а «Запросить счёт»: предлагать организации самой
 * оплатить картой годовой тариф — значит не понимать, как это происходит.
 *
 * Круг покупателей шире федераций: спортшколы, вузы, клубы, учебные центры,
 * организаторы соревнований, компании с внутренними награждениями.
 */

const AUDIENCE = [
  'Спортивные федерации и клубы',
  'Спортшколы и училища олимпийского резерва',
  'Вузы, колледжи и учебные центры',
  'Организаторы соревнований и забегов',
  'Компании с внутренними награждениями',
];

const ARGUMENTS = [
  {
    icon: Scale,
    title: 'Юридический отдел пропустит',
    text: 'Данные участников хранятся в России, как требует часть 5 статьи 18 152-ФЗ. Договор-поручение на обработку персональных данных со всеми обязательными условиями — приложение к договору. Уведомление оператора подано в Роскомнадзор.',
  },
  {
    icon: FileCheck2,
    title: 'Бухгалтерия закроет период',
    text: 'Договор с российским индивидуальным предпринимателем, счёт на организацию, акт оказанных услуг. Оплата по безналичному расчёту, авансом. НДС не начисляется — упрощённая система налогообложения.',
  },
  {
    icon: Users,
    title: 'Работать будут несколько человек',
    text: 'На тарифах от «Про» доступ получают до пяти сотрудников, на верхнем — без ограничений. Каждый видит только документы своей организации.',
  },
  {
    icon: Building2,
    title: 'Встанет в ваши процессы',
    text: 'Форма на сайте организации, интеграция с Тильдой, доступ по API. Импорт протоколов соревнований и правила награждения по занятым местам — на верхнем тарифе.',
  },
];

export function ForBusiness() {
  return (
    <section
      id="federatsiyam"
      className="scroll-mt-16 border-y border-[var(--line)] bg-[var(--surface)]"
    >
      <div className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="font-serif text-3xl">Организациям</h2>
        <p className="mt-2 max-w-2xl text-[var(--text-muted)]">
          Если наградные документы выдаёт юридическое лицо, вопросов больше,
          чем «красиво ли получится». Вот ответы на те, что задают до подписания.
        </p>

        <ul className="mt-6 flex flex-wrap gap-2">
          {AUDIENCE.map((a) => (
            <li
              key={a}
              className="rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-sm text-[var(--text-muted)]"
            >
              {a}
            </li>
          ))}
        </ul>

        <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {ARGUMENTS.map((item) => (
            <div key={item.title} className="flex gap-4">
              <span className="mt-0.5 shrink-0 text-[var(--accent)]">
                <item.icon size={20} strokeWidth={1.75} />
              </span>
              <div>
                <h3 className="font-medium">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
                  {item.text}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4 rounded-xl bg-[var(--accent-soft)] p-6">
          <div className="min-w-64 flex-1">
            <h3 className="font-serif text-xl text-[var(--accent)]">
              Пришлём счёт и договор
            </h3>
            <p className="mt-2 text-sm leading-relaxed">
              Напишите, сколько документов в год выдаёте и на какое юридическое
              лицо оформлять. В ответ придут договор, договор-поручение
              и счёт — их можно сразу отдать юристу и в бухгалтерию.
            </p>
          </div>
          <a href="mailto:info@vruchay.ru?subject=Запрос%20счёта%20—%20Вручай">
            <Button variant="primary">Запросить счёт</Button>
          </a>
        </div>
      </div>
    </section>
  );
}
