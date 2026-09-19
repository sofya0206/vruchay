import type { CoachText } from './Coach';

/**
 * Подсказки по разделам — 2–4 шага у настоящих элементов экрана.
 *
 * Место ищется по устойчивым признакам: подписи для читалок, заголовку
 * поля, тексту кнопки. Не нашлось (раздел пуст, кнопка спрятана) — шаг
 * пропускается молча, а в статистике он виден отдельно.
 */

type Find = string | { text: string; in?: string };

export interface TipStep extends CoachText {
  /** Первое найденное из списка. */
  at: Find[];
}

export interface Section {
  key: string;
  title: string;
  steps: TipStep[];
}

const RELEASE: TipStep = {
  at: [{ text: 'Выпустить', in: 'header a, header button' }],
  title: 'Выпуск — отсюда',
  text: 'Кнопка всегда на месте: с любой вкладки ведёт к списку, откуда выпускают.',
  placement: 'bottom',
};
const SIDES: TipStep = {
  at: ['nav[aria-label="Стороны материала"]'],
  title: 'Весь путь — по вкладкам',
  text: 'Лист → Получатели → Проверка → Письмо → Подлинность. Идите слева направо.',
  placement: 'bottom',
};

export const SECTIONS: Section[] = [
  {
    key: 'home',
    title: 'Главная',
    steps: [
      {
        at: [{ text: 'Создать документ', in: 'main button, main a' }],
        title: 'Начните с документа',
        text: 'Документ — это макет грамоты и список получателей для одного мероприятия.',
        placement: 'bottom',
      },
      {
        at: ['input[placeholder^="Фамилия"]'],
        title: 'Реестр всего выданного',
        text: 'Найдите документ по фамилии или коду с бланка и перешлите его заново.',
        placement: 'bottom',
      },
      {
        at: ['nav[aria-label="Разделы"]'],
        title: 'Разделы — слева',
        text: 'Документы, письма, реестр, интеграции и оплата. Внизу — обучение.',
        placement: 'right',
      },
    ],
  },
  {
    key: 'documents',
    title: 'Документы',
    steps: [
      {
        at: [{ text: 'Создать документ' }, { text: 'Создать' }],
        title: 'Новый документ',
        text: 'Загрузите свой бланк или начните с пустого листа.',
        placement: 'bottom',
      },
      {
        at: ['nav[aria-label="Разделы библиотеки"]'],
        title: 'Папки и архив',
        text: 'Раскладывайте документы по мероприятиям. Удалённые хранятся в архиве.',
        placement: 'right',
      },
      {
        at: ['main li.card'],
        title: 'Карточка документа',
        text: 'Нажмите, чтобы открыть. В меню «…» — копия под новое мероприятие.',
        placement: 'right',
      },
    ],
  },
  {
    key: 'editor',
    title: 'Лист',
    steps: [
      SIDES,
      {
        at: [{ text: 'Вставить' }, '[aria-label="Вставить"]'],
        title: 'Текст, картинка, QR',
        text: 'Добавляйте на лист блоки и двигайте мышью.',
        placement: 'bottom',
      },
      {
        at: ['[role="tab"][data-panel="fields"]', '[aria-label="Данные"]', { text: 'Данные', in: 'aside button' }],
        title: 'Поля из таблицы',
        text: 'Перетащите поле на лист — в каждом документе подставится значение из своей строки.',
        placement: 'left',
      },
      RELEASE,
    ],
  },
  {
    key: 'recipients',
    title: 'Получатели',
    steps: [
      {
        at: [{ text: 'Загрузить файл' }, '[aria-label^="Загрузить"]'],
        title: 'Список из Excel или CSV',
        text: 'Шапку и пустые строки уберём сами. Можно вставить из буфера — Ctrl+V.',
        placement: 'bottom',
      },
      {
        at: ['[aria-label="Отметить все"]'],
        title: 'Кому выпускать',
        text: 'Выпустятся только отмеченные строки.',
        placement: 'right',
      },
      {
        at: ['[aria-label="Проверить строки"]'],
        title: 'Проверка перед выпуском',
        text: 'Найдём пустые ФИО, ошибки в почте и текст, который не влезает.',
        placement: 'bottom',
      },
      { ...RELEASE, title: 'Выпустить отмеченных', text: 'Каждая строка станет отдельным PDF с QR-кодом.' },
    ],
  },
  {
    key: 'check',
    title: 'Проверка',
    steps: [
      {
        at: [{ text: 'Проверить отмеченные' }, { text: 'Проверить' , in: 'main button' }],
        title: 'Проверьте до выпуска',
        text: 'Ничего не меняем и не выпускаем — только показываем, что пойдёт не так.',
        placement: 'bottom',
      },
      SIDES,
    ],
  },
  {
    key: 'material',
    title: 'Материал',
    steps: [SIDES, RELEASE],
  },
  {
    key: 'mailing',
    title: 'Письма',
    steps: [
      {
        at: ['nav[aria-label="Папки писем"]'],
        title: 'Письма по состоянию',
        text: 'Отправленные, доставленные и недошедшие — в отдельных папках.',
        placement: 'right',
      },
      {
        at: ['[aria-label="Поиск в письмах"]'],
        title: 'Поиск по адресу',
        text: 'Найдите письмо конкретного человека и отправьте заново.',
        placement: 'bottom',
      },
    ],
  },
  {
    key: 'registry',
    title: 'Реестр',
    steps: [
      {
        at: ['input[placeholder^="Фамилия, адрес"]'],
        title: 'Поиск выданного',
        text: 'По фамилии, почте или проверочному коду с бланка.',
        placement: 'bottom',
      },
      {
        at: ['[aria-label="Разделы реестра"]'],
        title: 'Выданные и отозванные',
        text: 'Отозванный документ на странице проверки покажется недействительным.',
        placement: 'bottom',
      },
    ],
  },
];

/** Какой раздел открыт: по адресу и вкладке материала. */
export function sectionOf(pathname: string, search: string): Section | null {
  const tab = new URLSearchParams(search).get('tab');
  const key =
    pathname === '/'
      ? 'home'
      : /^\/documents\/?$|^\/documents\/(archive|folder)/.test(pathname)
        ? 'documents'
        : /^\/documents\/[^/]+$/.test(pathname)
          ? 'editor'
          : /^\/mailing\/[^/]+$/.test(pathname)
            ? !tab || tab === 'table'
              ? 'recipients'
              : tab === 'check'
                ? 'check'
                : 'material'
            : pathname.startsWith('/mailing')
              ? 'mailing'
              : pathname.startsWith('/registry')
                ? 'registry'
                : null;
  return SECTIONS.find((s) => s.key === key) ?? null;
}

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Первый видимый элемент по списку признаков. */
export function findAnchor(list: Find[]): Element | null {
  for (const f of list) {
    if (typeof f === 'string') {
      const el = [...document.querySelectorAll(f)].find(visible);
      if (el) return el;
      continue;
    }
    const el = [...document.querySelectorAll(f.in ?? 'button, a, [role="tab"]')].find(
      (e) => visible(e) && (e.textContent ?? '').trim().startsWith(f.text),
    );
    if (el) return el;
  }
  return null;
}
