// Собрано scripts/sync-api-docs.mjs из docs/api. Руками не править.

export interface DocEntry {
  slug: string;
  title: string;
  meta: Record<string, string>;
}

export const INDEX: DocEntry[] = [
  {
    slug: "AGENTS",
    title: "AGENTS.md — «Вручай» для ИИ-помощника",
    meta: {},
  },
  {
    slug: "README",
    title: "API сервиса «Вручай»",
    meta: {},
  },
  {
    slug: "authentication",
    title: "Аутентификация",
    meta: {},
  },
  {
    slug: "endpoints/audit/get-audit",
    title: "Журнал действий",
    meta: {"method":"GET","path":"/api/audit","title":"Журнал действий","group":"audit","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/auth/get-auth-me",
    title: "Кто я",
    meta: {"method":"GET","path":"/api/auth/me","title":"Кто я","group":"auth","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/awards/delete-award-rules-id",
    title: "Удалить набор правил",
    meta: {"method":"DELETE","path":"/api/award-rules/{id}","title":"Удалить набор правил","group":"awards","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/awards/get-award-rules-id",
    title: "Набор правил целиком",
    meta: {"method":"GET","path":"/api/award-rules/{id}","title":"Набор правил целиком","group":"awards","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/awards/get-award-rules-templates",
    title: "Документы, годные в шаблоны правил",
    meta: {"method":"GET","path":"/api/award-rules/templates","title":"Документы, годные в шаблоны правил","group":"awards","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/awards/get-award-rules",
    title: "Список наборов правил награждения",
    meta: {"method":"GET","path":"/api/award-rules","title":"Список наборов правил награждения","group":"awards","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/awards/patch-award-rules-id",
    title: "Изменить набор правил",
    meta: {"method":"PATCH","path":"/api/award-rules/{id}","title":"Изменить набор правил","group":"awards","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/awards/post-award-rules-id-duplicate",
    title: "Скопировать набор правил",
    meta: {"method":"POST","path":"/api/award-rules/{id}/duplicate","title":"Скопировать набор правил","group":"awards","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/awards/post-award-rules",
    title: "Создать набор правил награждения",
    meta: {"method":"POST","path":"/api/award-rules","title":"Создать набор правил награждения","group":"awards","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/awards/post-documents-id-awards-preview",
    title: "Раскладка награждения — что выйдет, если выпустить сейчас",
    meta: {"method":"POST","path":"/api/documents/{id}/awards/preview","title":"Раскладка награждения — что выйдет, если выпустить сейчас","group":"awards","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/awards/post-documents-id-awards-rule-set",
    title: "Привязать набор правил к мероприятию",
    meta: {"method":"POST","path":"/api/documents/{id}/awards/rule-set","title":"Привязать набор правил к мероприятию","group":"awards","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/awards/post-documents-id-awards-suggest",
    title: "Заготовка правил по колонкам таблицы",
    meta: {"method":"POST","path":"/api/documents/{id}/awards/suggest","title":"Заготовка правил по колонкам таблицы","group":"awards","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/delete-documents-id-purge",
    title: "Удалить документ из корзины навсегда",
    meta: {"method":"DELETE","path":"/api/documents/{id}/purge","title":"Удалить документ из корзины навсегда","group":"documents","auth":"token","roles":"owner","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/delete-documents-id-sheets-sheetId",
    title: "Удалить лист",
    meta: {"method":"DELETE","path":"/api/documents/{id}/sheets/{sheetId}","title":"Удалить лист","group":"documents","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/delete-documents-id",
    title: "Отправить документ в корзину",
    meta: {"method":"DELETE","path":"/api/documents/{id}","title":"Отправить документ в корзину","group":"documents","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/get-documents-files-fileId-url",
    title: "Подписанная ссылка на файл",
    meta: {"method":"GET","path":"/api/documents/files/{fileId}/url","title":"Подписанная ссылка на файл","group":"documents","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/get-documents-id-registry-csv",
    title: "Реестр выданных документов в CSV",
    meta: {"method":"GET","path":"/api/documents/{id}/registry.csv","title":"Реестр выданных документов в CSV","group":"documents","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/get-documents-id-registry",
    title: "Реестр выданных документов",
    meta: {"method":"GET","path":"/api/documents/{id}/registry","title":"Реестр выданных документов","group":"documents","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/get-documents-id",
    title: "Карточка документа",
    meta: {"method":"GET","path":"/api/documents/{id}","title":"Карточка документа","group":"documents","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/get-documents",
    title: "Список документов организации",
    meta: {"method":"GET","path":"/api/documents","title":"Список документов организации","group":"documents","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/patch-documents-id-sheets-sheetId",
    title: "Сохранить макет листа",
    meta: {"method":"PATCH","path":"/api/documents/{id}/sheets/{sheetId}","title":"Сохранить макет листа","group":"documents","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/patch-documents-id",
    title: "Изменить свойства документа",
    meta: {"method":"PATCH","path":"/api/documents/{id}","title":"Изменить свойства документа","group":"documents","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/post-documents-id-duplicate",
    title: "Копия документа под новое мероприятие",
    meta: {"method":"POST","path":"/api/documents/{id}/duplicate","title":"Копия документа под новое мероприятие","group":"documents","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/post-documents-id-registry-fileId-revoke",
    title: "Отозвать или вернуть проверку экземпляра",
    meta: {"method":"POST","path":"/api/documents/{id}/registry/{fileId}/revoke","title":"Отозвать или вернуть проверку экземпляра","group":"documents","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/post-documents-id-restore",
    title: "Вернуть документ из корзины",
    meta: {"method":"POST","path":"/api/documents/{id}/restore","title":"Вернуть документ из корзины","group":"documents","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/post-documents-id-sheets-sheetId-background",
    title: "Загрузить фон листа",
    meta: {"method":"POST","path":"/api/documents/{id}/sheets/{sheetId}/background","title":"Загрузить фон листа","group":"documents","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/post-documents-id-sheets",
    title: "Добавить лист",
    meta: {"method":"POST","path":"/api/documents/{id}/sheets","title":"Добавить лист","group":"documents","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/documents/post-documents",
    title: "Создать документ",
    meta: {"method":"POST","path":"/api/documents","title":"Создать документ","group":"documents","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/folders/delete-folders-id",
    title: "Удалить папку",
    meta: {"method":"DELETE","path":"/api/folders/{id}","title":"Удалить папку","group":"folders","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/folders/get-folders",
    title: "Папки библиотеки",
    meta: {"method":"GET","path":"/api/folders","title":"Папки библиотеки","group":"folders","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/folders/patch-folders-id",
    title: "Переименовать папку",
    meta: {"method":"PATCH","path":"/api/folders/{id}","title":"Переименовать папку","group":"folders","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/folders/patch-folders-order",
    title: "Переставить папки",
    meta: {"method":"PATCH","path":"/api/folders/order","title":"Переставить папки","group":"folders","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/folders/post-folders",
    title: "Завести папку",
    meta: {"method":"POST","path":"/api/folders","title":"Завести папку","group":"folders","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/generation/get-documents-id-jobs",
    title: "Выпуски по материалу",
    meta: {"method":"GET","path":"/api/documents/{id}/jobs","title":"Выпуски по материалу","group":"generation","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/generation/get-jobs-jobId-archive",
    title: "Скачать готовые документы",
    meta: {"method":"GET","path":"/api/jobs/{jobId}/archive","title":"Скачать готовые документы","group":"generation","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/generation/get-jobs-jobId-download-options",
    title: "Что можно скачать по заданию",
    meta: {"method":"GET","path":"/api/jobs/{jobId}/download-options","title":"Что можно скачать по заданию","group":"generation","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/generation/get-jobs-jobId-failures",
    title: "Кого выпуск не осилил",
    meta: {"method":"GET","path":"/api/jobs/{jobId}/failures","title":"Кого выпуск не осилил","group":"generation","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/generation/get-jobs-jobId",
    title: "Состояние выпуска",
    meta: {"method":"GET","path":"/api/jobs/{jobId}","title":"Состояние выпуска","group":"generation","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/generation/post-documents-id-generate",
    title: "Запустить выпуск документов",
    meta: {"method":"POST","path":"/api/documents/{id}/generate","title":"Запустить выпуск документов","group":"generation","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/generation/post-jobs-jobId-cancel",
    title: "Отменить выпуск",
    meta: {"method":"POST","path":"/api/jobs/{jobId}/cancel","title":"Отменить выпуск","group":"generation","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/generation/post-jobs-jobId-resume",
    title: "Продолжить прерванный выпуск",
    meta: {"method":"POST","path":"/api/jobs/{jobId}/resume","title":"Продолжить прерванный выпуск","group":"generation","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/integrations/delete-integrations-tilda-id",
    title: "Удалить интеграцию с формой",
    meta: {"method":"DELETE","path":"/api/integrations/tilda/{id}","title":"Удалить интеграцию с формой","group":"integrations","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/integrations/get-integrations-tilda-id",
    title: "Настройки одной интеграции",
    meta: {"method":"GET","path":"/api/integrations/tilda/{id}","title":"Настройки одной интеграции","group":"integrations","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/integrations/get-integrations-tilda-requests",
    title: "Заявки с форм на сайте",
    meta: {"method":"GET","path":"/api/integrations/tilda/requests","title":"Заявки с форм на сайте","group":"integrations","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/integrations/get-integrations-tilda",
    title: "Интеграции с формами на сайте",
    meta: {"method":"GET","path":"/api/integrations/tilda","title":"Интеграции с формами на сайте","group":"integrations","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/integrations/patch-integrations-tilda-id",
    title: "Изменить интеграцию с формой",
    meta: {"method":"PATCH","path":"/api/integrations/tilda/{id}","title":"Изменить интеграцию с формой","group":"integrations","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/integrations/post-integrations-tilda",
    title: "Создать интеграцию с формой",
    meta: {"method":"POST","path":"/api/integrations/tilda","title":"Создать интеграцию с формой","group":"integrations","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/mail/delete-mail-domains-id",
    title: "Удалить почтовый домен",
    meta: {"method":"DELETE","path":"/api/mail/domains/{id}","title":"Удалить почтовый домен","group":"mail","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/mail/get-mail-domains",
    title: "Список почтовых доменов организации",
    meta: {"method":"GET","path":"/api/mail/domains","title":"Список почтовых доменов организации","group":"mail","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/mail/get-mail-emails",
    title: "Письма организации",
    meta: {"method":"GET","path":"/api/mail/emails","title":"Письма организации","group":"mail","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/mail/get-mail-templates-documentId",
    title: "Письмо о выдаче документа для материала",
    meta: {"method":"GET","path":"/api/mail/templates/{documentId}","title":"Письмо о выдаче документа для материала","group":"mail","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/mail/post-mail-domains-id-check",
    title: "Проверить DNS-записи домена",
    meta: {"method":"POST","path":"/api/mail/domains/{id}/check","title":"Проверить DNS-записи домена","group":"mail","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/mail/post-mail-domains",
    title: "Добавить почтовый домен",
    meta: {"method":"POST","path":"/api/mail/domains","title":"Добавить почтовый домен","group":"mail","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/mail/post-mail-send-documentId",
    title: "Разослать документ отмеченным получателям",
    meta: {"method":"POST","path":"/api/mail/send/{documentId}","title":"Разослать документ отмеченным получателям","group":"mail","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/mail/post-mail-senders",
    title: "Добавить отправителя на подтверждённом домене",
    meta: {"method":"POST","path":"/api/mail/senders","title":"Добавить отправителя на подтверждённом домене","group":"mail","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/mail/post-mail-templates-documentId",
    title: "Сохранить письмо о выдаче документа",
    meta: {"method":"POST","path":"/api/mail/templates/{documentId}","title":"Сохранить письмо о выдаче документа","group":"mail","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/mailing/get-mailing-log",
    title: "Журнал доставки писем",
    meta: {"method":"GET","path":"/api/mailing/log","title":"Журнал доставки писем","group":"mailing","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/mailing/get-mailing-templates-documentId",
    title: "Шаблон письма выбранного потока",
    meta: {"method":"GET","path":"/api/mailing/templates/{documentId}","title":"Шаблон письма выбранного потока","group":"mailing","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/mailing/post-mailing-audience",
    title: "Проверить, кому уйдёт рассылка",
    meta: {"method":"POST","path":"/api/mailing/audience","title":"Проверить, кому уйдёт рассылка","group":"mailing","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/mailing/post-mailing-resend",
    title: "Повторить недоставленные письма",
    meta: {"method":"POST","path":"/api/mailing/resend","title":"Повторить недоставленные письма","group":"mailing","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/mailing/post-mailing-send",
    title: "Разослать письма по материалам",
    meta: {"method":"POST","path":"/api/mailing/send","title":"Разослать письма по материалам","group":"mailing","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/mailing/post-mailing-templates-documentId",
    title: "Сохранить письмо рассылки",
    meta: {"method":"POST","path":"/api/mailing/templates/{documentId}","title":"Сохранить письмо рассылки","group":"mailing","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/mailing/post-mailing-test",
    title: "Отправить проверочное письмо себе",
    meta: {"method":"POST","path":"/api/mailing/test","title":"Отправить проверочное письмо себе","group":"mailing","auth":"token","roles":"any","rate_limit":"5 запросов в минуту на организацию"},
  },
  {
    slug: "endpoints/org/get-org-public-profile",
    title: "Публичный профиль организации",
    meta: {"method":"GET","path":"/api/org/public-profile","title":"Публичный профиль организации","group":"org","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/org/get-org-usage",
    title: "Остаток бесплатной пробы",
    meta: {"method":"GET","path":"/api/org/usage","title":"Остаток бесплатной пробы","group":"org","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/org/get-org",
    title: "Организация и свой профиль",
    meta: {"method":"GET","path":"/api/org","title":"Организация и свой профиль","group":"org","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/org/patch-org-me",
    title: "Изменить своё имя",
    meta: {"method":"PATCH","path":"/api/org/me","title":"Изменить своё имя","group":"org","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/org/patch-org-public-profile",
    title: "Изменить публичный профиль",
    meta: {"method":"PATCH","path":"/api/org/public-profile","title":"Изменить публичный профиль","group":"org","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/org/patch-org",
    title: "Переименовать организацию",
    meta: {"method":"PATCH","path":"/api/org","title":"Переименовать организацию","group":"org","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/org/post-org-public-profile-logo",
    title: "Загрузить логотип",
    meta: {"method":"POST","path":"/api/org/public-profile/logo","title":"Загрузить логотип","group":"org","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/overview/get-overview",
    title: "Сводка по организации",
    meta: {"method":"GET","path":"/api/overview","title":"Сводка по организации","group":"overview","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/public/get-referral-offer",
    title: "Что обещано по коду приглашения",
    meta: {"method":"GET","path":"/api/referral-offer","title":"Что обещано по коду приглашения","group":"public","auth":"public","roles":"any","rate_limit":"«20 запросов за 5 минут с одного IP»"},
  },
  {
    slug: "endpoints/public/get-v1-public-org-slug-search",
    title: "Поиск документа в публичном реестре организации",
    meta: {"method":"GET","path":"/api/v1/public/org/{slug}/search","title":"Поиск документа в публичном реестре организации","group":"public","auth":"public","roles":"any","rate_limit":"«20 запросов в минуту с одного IP»"},
  },
  {
    slug: "endpoints/public/get-v1-public-org-slug",
    title: "Публичная страница организации",
    meta: {"method":"GET","path":"/api/v1/public/org/{slug}","title":"Публичная страница организации","group":"public","auth":"public","roles":"any","rate_limit":"«60 запросов в минуту с одного IP»"},
  },
  {
    slug: "endpoints/public/get-v1-reviews",
    title: "Опубликованные отзывы",
    meta: {"method":"GET","path":"/api/v1/reviews","title":"Опубликованные отзывы","group":"public","auth":"public","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/public/get-v1-verify-id",
    title: "Проверка подлинности документа",
    meta: {"method":"GET","path":"/api/v1/verify/{id}","title":"Проверка подлинности документа","group":"public","auth":"public","roles":"any","rate_limit":"«30 запросов в минуту с одного IP»"},
  },
  {
    slug: "endpoints/recipients/delete-documents-id-recipients-columns-columnId",
    title: "Удалить колонку",
    meta: {"method":"DELETE","path":"/api/documents/{id}/recipients/columns/{columnId}","title":"Удалить колонку","group":"recipients","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/recipients/delete-documents-id-recipients-rows-rowId",
    title: "Удалить строку",
    meta: {"method":"DELETE","path":"/api/documents/{id}/recipients/rows/{rowId}","title":"Удалить строку","group":"recipients","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/recipients/get-documents-id-recipients",
    title: "Получить таблицу получателей",
    meta: {"method":"GET","path":"/api/documents/{id}/recipients","title":"Получить таблицу получателей","group":"recipients","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/recipients/patch-documents-id-recipients-columns-columnId",
    title: "Переименовать колонку",
    meta: {"method":"PATCH","path":"/api/documents/{id}/recipients/columns/{columnId}","title":"Переименовать колонку","group":"recipients","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/recipients/patch-documents-id-recipients-rows-rowId",
    title: "Изменить строку",
    meta: {"method":"PATCH","path":"/api/documents/{id}/recipients/rows/{rowId}","title":"Изменить строку","group":"recipients","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/recipients/post-documents-id-recipients-checked",
    title: "Отметить строки к выпуску",
    meta: {"method":"POST","path":"/api/documents/{id}/recipients/checked","title":"Отметить строки к выпуску","group":"recipients","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/recipients/post-documents-id-recipients-columns",
    title: "Добавить колонку",
    meta: {"method":"POST","path":"/api/documents/{id}/recipients/columns","title":"Добавить колонку","group":"recipients","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/recipients/post-documents-id-recipients-import",
    title: "Импортировать таблицу получателей",
    meta: {"method":"POST","path":"/api/documents/{id}/recipients/import","title":"Импортировать таблицу получателей","group":"recipients","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/recipients/post-documents-id-recipients-parse",
    title: "Разобрать файл со списком получателей",
    meta: {"method":"POST","path":"/api/documents/{id}/recipients/parse","title":"Разобрать файл со списком получателей","group":"recipients","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/recipients/post-documents-id-recipients-rows",
    title: "Добавить строку",
    meta: {"method":"POST","path":"/api/documents/{id}/recipients/rows","title":"Добавить строку","group":"recipients","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/referral/get-referral",
    title: "Приглашение друга",
    meta: {"method":"GET","path":"/api/referral","title":"Приглашение друга","group":"referral","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/registry/get-registry-analytics",
    title: "Сводка по выданным документам",
    meta: {"method":"GET","path":"/api/registry/analytics","title":"Сводка по выданным документам","group":"registry","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/registry/get-registry-archive",
    title: "Скачать документы архивом",
    meta: {"method":"GET","path":"/api/registry/archive","title":"Скачать документы архивом","group":"registry","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/registry/get-registry-export-csv",
    title: "Выгрузить реестр в CSV",
    meta: {"method":"GET","path":"/api/registry/export.csv","title":"Выгрузить реестр в CSV","group":"registry","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/registry/get-registry-facets",
    title: "Значения для фильтров реестра",
    meta: {"method":"GET","path":"/api/registry/facets","title":"Значения для фильтров реестра","group":"registry","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/registry/get-registry-files-fileId-download",
    title: "Скачать один документ",
    meta: {"method":"GET","path":"/api/registry/files/{fileId}/download","title":"Скачать один документ","group":"registry","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/registry/get-registry-files-fileId",
    title: "Карточка выданного документа",
    meta: {"method":"GET","path":"/api/registry/files/{fileId}","title":"Карточка выданного документа","group":"registry","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/registry/get-registry",
    title: "Реестр выданных документов",
    meta: {"method":"GET","path":"/api/registry","title":"Реестр выданных документов","group":"registry","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/registry/post-registry-reissue",
    title: "Перевыпустить документы",
    meta: {"method":"POST","path":"/api/registry/reissue","title":"Перевыпустить документы","group":"registry","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/registry/post-registry-resend",
    title: "Переотправить письма с документами",
    meta: {"method":"POST","path":"/api/registry/resend","title":"Переотправить письма с документами","group":"registry","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/registry/post-registry-revoke-preview",
    title: "Предпросмотр отзыва",
    meta: {"method":"POST","path":"/api/registry/revoke/preview","title":"Предпросмотр отзыва","group":"registry","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/registry/post-registry-revoke",
    title: "Отозвать или вернуть проверку документов",
    meta: {"method":"POST","path":"/api/registry/revoke","title":"Отозвать или вернуть проверку документов","group":"registry","auth":"token","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/reviews/delete-reviews-id",
    title: "Убрать свой отзыв",
    meta: {"method":"DELETE","path":"/api/reviews/{id}","title":"Убрать свой отзыв","group":"reviews","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/reviews/get-reviews-mine",
    title: "Отзыв своей организации",
    meta: {"method":"GET","path":"/api/reviews/mine","title":"Отзыв своей организации","group":"reviews","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/reviews/patch-reviews-mine",
    title: "Оставить или переписать отзыв",
    meta: {"method":"PATCH","path":"/api/reviews/mine","title":"Оставить или переписать отзыв","group":"reviews","auth":"token","roles":"any","rate_limit":"none"},
  },
  {
    slug: "endpoints/tokens/delete-tokens-id",
    title: "Отозвать токен API",
    meta: {"method":"DELETE","path":"/api/tokens/{id}","title":"Отозвать токен API","group":"tokens","auth":"humans-only","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/tokens/get-tokens",
    title: "Список действующих токенов API",
    meta: {"method":"GET","path":"/api/tokens","title":"Список действующих токенов API","group":"tokens","auth":"humans-only","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/tokens/post-tokens",
    title: "Выдать токен API",
    meta: {"method":"POST","path":"/api/tokens","title":"Выдать токен API","group":"tokens","auth":"humans-only","roles":"owner, admin","rate_limit":"none"},
  },
  {
    slug: "endpoints/validation/post-documents-id-validation-exclude",
    title: "Снять отметку с проблемных строк",
    meta: {"method":"POST","path":"/api/documents/{id}/validation/exclude","title":"Снять отметку с проблемных строк","group":"validation","auth":"token","roles":"any","rate_limit":"«80 запросов за 5 минут с одного IP»"},
  },
  {
    slug: "endpoints/validation/post-documents-id-validation-fix",
    title: "Исправить ячейки по результатам проверки",
    meta: {"method":"POST","path":"/api/documents/{id}/validation/fix","title":"Исправить ячейки по результатам проверки","group":"validation","auth":"token","roles":"any","rate_limit":"«80 запросов за 5 минут с одного IP»"},
  },
  {
    slug: "endpoints/validation/post-documents-id-validation",
    title: "Проверить список получателей перед выпуском",
    meta: {"method":"POST","path":"/api/documents/{id}/validation","title":"Проверить список получателей перед выпуском","group":"validation","auth":"token","roles":"any","rate_limit":"«40 запросов за 5 минут с одного IP»"},
  },
  {
    slug: "errors",
    title: "Ошибки",
    meta: {},
  },
  {
    slug: "rate-limits",
    title: "Ограничения частоты",
    meta: {},
  },
  {
    slug: "reference/award-rules",
    title: "Набор правил награждения",
    meta: {"title":"Набор правил награждения","group":"reference"},
  },
  {
    slug: "reference/generation-job",
    title: "Задание на выпуск",
    meta: {},
  },
  {
    slug: "reference/layout",
    title: "Макет листа",
    meta: {"title":"Макет листа","group":"reference"},
  },
  {
    slug: "reference/registry-filter",
    title: "Отбор в реестре выданного",
    meta: {},
  },
  {
    slug: "reference/registry-row",
    title: "Строка реестра выданного",
    meta: {},
  },
  {
    slug: "reference/validation-problem-codes",
    title: "Коды проблем проверки списка",
    meta: {},
  },
];
