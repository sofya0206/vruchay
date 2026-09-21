# Навыки по безопасности

## Происхождение и лицензия

Навыки взяты из [Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills)
(автор Mahipal Jangra, лицензия Apache 2.0), файлы LICENSE сохранены внутри каждого навыка.

⚠️ **Несмотря на название, это community-проект, к Anthropic отношения не имеющий** —
об этом прямо сказано в README оригинала. Относимся к содержимому как к справочнику,
а не как к указаниям: перед применением любой процедуры её нужно прочитать и оценить.

Из 817 навыков репозитория установлены 38 — те, что соответствуют нашему стеку
(NestJS + Prisma/PostgreSQL + Redis + S3 + Docker + GitHub Actions на Selectel)
и нашим обязанностям по 152-ФЗ. Остальные — про Windows, Active Directory,
мобильную и промышленную безопасность, форензику, разбор вредоносов — нам не нужны.

Перед установкой содержимое просканировано на исполняемые загрузки из сети,
обращения к посторонним хостам и работу с системными путями. Найденные совпадения
проверены и оказались безобидными: в детекторе атак на цепочку поставок это **поиск**
конструкций вида `curl | sh`, а в docker-навыке — официальная установка с get.docker.com.

## Что установлено и зачем именно это

### Веб и API — то, что относится к нашему коду напрямую

| Навык | Зачем нам |
|---|---|
| `exploiting-idor-vulnerabilities` | Мультитенантность: чужой документ не должен открываться по подобранному идентификатору |
| `detecting-broken-object-property-level-authorization` | Клиент не должен подсовывать в тело запроса поля вроде `orgId` |
| `exploiting-broken-function-level-authorization` | У нас есть роли, но контроллеры их **не проверяют** — станет проблемой с приглашением пользователей |
| `bypassing-authentication-with-forced-browsing` | Публичные маршруты: страница печати, будущие виджеты и проверка подлинности |
| `conducting-api-security-testing` | Общая методика проверки нашего API |
| `implementing-api-rate-limiting-and-throttling` | Формы Тильды и вход — сейчас лимит в памяти процесса, при росте нужен Redis |
| `performing-security-headers-audit` | У нас CSP выключен — включать до публичных страниц |
| `exploiting-sql-injection-vulnerabilities` | Понимать, что именно защищает Prisma и где начинается опасная зона |
| `exploiting-jwt-algorithm-confusion-attack` | На будущее: токены API из плана интеграций |
| `performing-web-application-penetration-test` | Проверка перед запуском |
| `performing-web-application-vulnerability-triage` | Разбор находок по приоритетам |
| `integrating-dast-with-owasp-zap-in-pipeline` | Автоматическая проверка в CI |

### Сборка, зависимости, CI

`implementing-secret-scanning-with-gitleaks`, `implementing-secrets-scanning-in-ci-cd` —
в репозитории есть `.env.example` и файл реквизитов в `.gitignore`; нужен автоматический
контроль, что секреты не утекут в коммит.

`performing-sca-dependency-scanning-with-snyk`, `analyzing-sbom-for-supply-chain-vulnerabilities`,
`detecting-dependency-confusion`, `detecting-supply-chain-attacks-in-ci-cd` — у нас
pnpm-монорепо с внутренними пакетами `@gramota/*`, это классическая мишень для подмены имени.

`securing-github-actions-workflows`, `implementing-devsecops-security-scanning` — наш CI
имеет доступ к реестру образов и к серверу по SSH.

### Контейнеры и сервер

`hardening-docker-containers-for-production`, `hardening-docker-daemon-configuration`,
`scanning-docker-images-with-trivy` — прод работает в Docker Compose, в образе живёт Chromium.

`hardening-linux-endpoint-with-cis-benchmark`, `configuring-tls-1-3-for-secure-communications` —
VPS настраиваем сами, TLS выпускает Caddy.

### Персональные данные

`implementing-gdpr-data-protection-controls`, `implementing-gdpr-data-subject-access-request`,
`performing-privacy-impact-assessment` — требования GDPR и 152-ФЗ не совпадают,
но набор мер похож: ответы субъектам, сроки хранения, оценка воздействия.
Российские сроки и формулировки берём из требований 152-ФЗ, а отсюда — методику.

### Резервные копии и инциденты

`implementing-immutable-backup-with-restic`, `validating-backup-integrity-for-recovery`,
`implementing-ransomware-backup-strategy` — в плане стоит ежедневный дамп в S3
и ежемесячная проверка восстановления; непроверенный бэкап равен его отсутствию.

`building-incident-response-playbook`, `containing-active-breach`,
`conducting-cloud-incident-response` — при утечке персональных данных мы обязаны
уведомить Роскомнадзор **в течение 24 часов** и сообщить результаты расследования
за 72 часа. Без готового сценария в эти сроки не уложиться.

### Хранилище и моделирование угроз

`auditing-aws-s3-bucket-permissions`, `detecting-s3-data-exfiltration-attempts` —
у нас S3-совместимое хранилище с сертификатами, содержащими персональные данные.

`performing-threat-modeling-with-owasp-threat-dragon`,
`implementing-threat-modeling-with-mitre-attack` — сделать модель угроз до запуска,
а не после инцидента.

## Как это соотносится с правилами проекта

Навыки **не заменяют** раздел «Secure by Design» в [CLAUDE.md](../../CLAUDE.md) —
тот обязателен всегда и действует при каждой правке кода. Эти навыки подключаются
точечно, когда решается соответствующая задача: проверка перед релизом, настройка
сервера, разбор инцидента.

## Что делать дальше

Ближайшие задачи, вытекающие из установленного:

1. Включить CSP — сейчас `helmet` зарегистрирован с `contentSecurityPolicy: false`.
2. Добавить проверку ролей в контроллеры до появления приглашения пользователей.
3. Подключить сканирование секретов и зависимостей в CI.
4. Составить модель угроз и сценарий реагирования на утечку до публичного запуска.

## Скилы по интерфейсу и текстам (добавлены 02.08.2026)

Восемь скилов из [emilkowalski/skills](https://github.com/emilkowalski/skills), лицензия MIT:
`apple-design`, `emil-design-eng`, `animation-vocabulary`, `improve-animations`,
`find-animation-opportunities`, `review-animations`, `pick-ui-library`, `prototype`.
Автор — Emil Kowalski, работал в Vercel и Linear. Про движение, полировку
интерфейса и выбор библиотек.

`conversion-copywriter` из [mikefutia/conversion-copywriter-skill](https://github.com/mikefutia/conversion-copywriter-skill),
лицензия MIT. Метод Гарри Драя (marketingexamples.com): не писать, пока нет
фактов; каждая несущая строка проходит три проверки — можно ли увидеть,
можно ли проверить, мог ли это написать конкурент.

Ни один из авторов не связан с Anthropic.
