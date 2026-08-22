import type { FastifyInstance } from 'fastify';

/**
 * Межсайтовый доступ к публичной части.
 *
 * Скрипт формы живёт на сайте клиента, а обращается к нам — то есть все его
 * запросы межсайтовые. Без этих заголовков браузер не даст ни подключить
 * скрипт (мешает политика ресурса), ни отправить заявку (не пройдёт
 * предварительный запрос OPTIONS).
 *
 * Источник здесь не проверяется намеренно: разрешение браузеру отправить
 * запрос — не то же самое, что разрешение его выполнить. Право на выдачу
 * документа проверяется в TildaService по белому списку доменов интеграции,
 * и обойти это, подделав заголовок, нельзя — заголовок Origin браузер
 * ставит сам. Заголовок с разрешением на передачу учётных данных не
 * выставляется сознательно: тогда чужая страница не сможет обратиться
 * к нам от имени вошедшего пользователя.
 */

/** Всё под этим путём встраивается в чужие страницы. */
const PUBLIC_PREFIX = '/api/v1/tilda';

/** Запросы скрипта, которые браузер шлёт из кода и потому проверяет предварительно. */
const CORS_PATHS = [
  '/api/v1/tilda/submit',
  '/api/v1/tilda/confirm',
  '/api/v1/tilda/status/',
  // Приём формы прямо со страницы клиента — тоже межсайтовый запрос.
  '/api/v1/tilda-create',
];

export function registerPublicCors(instance: FastifyInstance): void {
  instance.addHook('onRequest', (req, reply, done) => {
    const path = req.url.split('?')[0];
    if (!path.startsWith(PUBLIC_PREFIX)) return done();

    // Скрипт и стили подключаются со страницы клиента, поэтому общая для API
    // политика «только свой источник» здесь не подходит.
    void reply.header('cross-origin-resource-policy', 'cross-origin');

    if (!CORS_PATHS.some((p) => path.startsWith(p))) return done();

    const origin = req.headers.origin;
    if (origin) {
      void reply.header('access-control-allow-origin', origin);
      // Ответ зависит от источника — иначе промежуточный кеш отдаст чужой заголовок.
      void reply.header('vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      void reply
        .header('access-control-allow-methods', 'GET, POST, OPTIONS')
        .header('access-control-allow-headers', 'content-type')
        .header('access-control-max-age', '600')
        .code(204)
        .send();
      return;
    }

    done();
  });
}
