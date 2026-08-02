# День запуска

Порядок действий на первый выкат `vruchay.ru`. Рассчитан на один вечер.
Каждый шаг заканчивается проверяемым признаком — если признака нет,
дальше идти не нужно, проблема не рассосётся сама.

Что уже решено и обсуждать заново не надо: провайдер — Selectel
([ADR-0002](adr/0002-hosting-provider.md)), контур российский, продавец —
ИП РФ ([ADR-0003](adr/0003-jurisdiction-rf-rb.md)), PostgreSQL в контейнере
с обязательным ежедневным дампом.

---

## 1. Заказать сервер и хранилище

**Сервер.** Selectel, облачный сервер в зоне `ru-1`:

| Параметр | Значение | Почему так |
|---|---|---|
| vCPU | 4 | Chromium печатает страницы; на 2 ядрах пакет из 500 грамот растянется |
| RAM | 8 ГБ | воркеру отдано 2 ГБ, базе 2 ГБ, остальное — приложение и запас |
| Диск | 80 ГБ NVMe | база, образы, временные файлы печати |
| ОС | Ubuntu 24.04 LTS | |
| Сеть | публичный IPv4 | |

**Объектное хранилище.** Два бакета, оба приватные:

- `vruchay-prod` — фоны и готовые документы;
- `vruchay-backups` — резервные копии, **с отдельным ключом доступа**.
  Разные ключи здесь не формальность: ключ боевого бакета лежит на сервере
  и утечёт вместе с ним, а копии должны пережить именно этот случай.

**Признак готовности:** `ssh root@<ip>` пускает, в панели видны оба бакета
и по паре ключей к ним.

---

## 2. Записи DNS для vruchay.ru

В панели Selectel, раздел DNS. Значение `<ip>` — адрес сервера.

| Тип | Имя | Значение | Зачем |
|---|---|---|---|
| A | `@` | `<ip>` | сам сайт |
| A | `www` | `<ip>` | привычная форма адреса |
| TXT | `@` | `v=spf1 include:<из кабинета DashaMail> ~all` | наши письма проходят проверку отправителя |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:postmaster@vruchay.ru` | отчёты о доставке; строгую политику включим позже |
| CNAME/TXT | по инструкции DashaMail | DKIM | подпись писем |
| CAA | `@` | `0 issue "letsencrypt.org"` | сертификат нашему домену не выпустит посторонний центр |

Почтовые записи нужны для писем **от самого сервиса** (коды подтверждения).
Домены клиентов подключаются отдельно, в кабинете.

**Признак готовности:** `dig +short vruchay.ru` возвращает адрес сервера.
Записи расходятся до двух суток — начинать с них разумно с утра.

---

## 3. Подготовить сервер

```bash
ssh root@<ip>
apt-get update && apt-get install -y docker.io docker-compose-v2 age awscli ufw
```

Отдельный пользователь — приложение не должно работать от root:

```bash
adduser --disabled-password --gecos '' vruchay
usermod -aG docker vruchay
mkdir -p /opt/vruchay && chown vruchay:vruchay /opt/vruchay
```

Межсетевой экран — снаружи открыты только два порта плюс SSH:

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

Вход по паролю отключить (`PasswordAuthentication no` в `/etc/ssh/sshd_config`,
затем `systemctl restart ssh`) — предварительно убедившись, что вход по ключу
работает **из другого окна терминала**.

**Признак готовности:** `docker run --rm hello-world` отрабатывает от
пользователя `vruchay`; `ufw status` показывает три разрешённых порта.

---

## 4. Ключ шифрования копий

На **своей машине**, не на сервере:

```bash
age-keygen -o vruchay-backup-key.txt
```

Секретную часть — в менеджер паролей. Больше нигде. Потеря = потеря всех копий.
Публичную строку (`age1…`) — в `/etc/vruchay-backup.env` на сервере.

---

## 5. Выложить файлы и окружение

С рабочей машины:

```bash
scp docker-compose.prod.yml vruchay@<ip>:/opt/vruchay/
scp -r scripts vruchay@<ip>:/opt/vruchay/
scp .env.prod.example vruchay@<ip>:/opt/vruchay/.env
```

На сервере заполнить `/opt/vruchay/.env` (комментарии внутри объясняют каждое
поле) и закрыть его от посторонних:

```bash
chmod 600 /opt/vruchay/.env
```

Пароли и секреты — сгенерировать, а не придумать:

```bash
openssl rand -base64 32 | tr -d '/+='   # пароль базы
openssl rand -base64 48                  # SESSION_SECRET
```

**Признак готовности:** в `.env` не осталось ни одного `CHANGE_ME`
(`grep CHANGE_ME /opt/vruchay/.env` ничего не выводит).

---

## 6. Собрать и выкатить

Собирает CI: push в `main` → образы в GHCR с тегом, равным хешу коммита.
Выкат — вручную, через `Deploy prod` в GitHub Actions, с этим же хешем.

Секреты репозитория: `PROD_SSH_HOST`, `PROD_SSH_USER` (`vruchay`), `PROD_SSH_KEY`,
плюс семь секретов `OPERATOR_*` и `POLICY_DATE` для страницы политики (см. пункт 10).

Первый раз можно и с сервера напрямую:

```bash
cd /opt/vruchay
echo "<токен GHCR>" | docker login ghcr.io -u <логин> --password-stdin
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --wait api worker web
```

Служба `migrate` выполнит миграции и завершится; `api` и `worker` стартуют
только после её успеха.

**Признак готовности:**

```bash
./scripts/smoke.sh https://vruchay.ru
```

Все строки со знаком ✓. Сертификат Caddy получает сам — если записи DNS
ещё не разошлись, HTTPS не поднимется, это не поломка, а ожидание.

---

## 7. Создать владельца

```bash
cd /opt/vruchay
docker compose -f docker-compose.prod.yml run --rm \
  -e OWNER_EMAIL='...' -e OWNER_PASSWORD='...' -e ORG_NAME='...' \
  api node dist/cli.js create-owner
```

Пароль передаётся окружением, а не аргументом: аргументы видны в списке
процессов любому пользователю сервера.

**Признак готовности:** вход на `https://vruchay.ru` работает.

---

## 8. Включить резервное копирование

```bash
sudo tee /etc/vruchay-backup.env > /dev/null <<'ENV'
POSTGRES_USER=vruchay
POSTGRES_DB=vruchay
BACKUP_AGE_RECIPIENT=age1...
BACKUP_S3_BUCKET=s3://vruchay-backups
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_ENDPOINT_URL=https://s3.ru-1.storage.selcloud.ru
ENV
sudo chmod 600 /etc/vruchay-backup.env

crontab -e
# 0 3 * * * . /etc/vruchay-backup.env && /opt/vruchay/scripts/backup.sh >> /var/log/vruchay-backup.log 2>&1
```

Не ждать ночи — прогнать руками сразу:

```bash
. /etc/vruchay-backup.env && /opt/vruchay/scripts/backup.sh
```

**Признак готовности:** в бакете лежит файл `.sql.gz.age` правдоподобного
размера, а `scripts/restore-drill.sh` разворачивает его в отдельную базу.
Пока учебное восстановление не проведено — копий считайте что нет.

---

## 9. Наблюдение

- UptimeRobot: `GET https://vruchay.ru/health`, интервал 5 минут,
  оповещение в Telegram. Бесплатного тарифа достаточно.
- Журналы: `docker compose -f docker-compose.prod.yml logs -f api`.
- Место на диске: `df -h` — образы и временные файлы печати растут незаметно.

---

## 10. Перед первой боевой выдачей

- [ ] Уведомление оператора персональных данных в Роскомнадзор — **до**
      первого реального участника, не после. Подаётся через портал РКН,
      данные оператора берутся из `docs/business/requisites.md`.
- [ ] Секреты GitHub для политики обработки данных заданы: `OPERATOR_NAME`,
      `OPERATOR_INN`, `OPERATOR_OGRNIP`, `OPERATOR_ADDRESS`, `OPERATOR_EMAIL`,
      `OPERATOR_PHONE`, `POLICY_DATE`. Без них страница `/privacy` соберётся,
      но честно сообщит, что опубликована не полностью.
- [ ] Открыть `https://vruchay.ru/privacy` и убедиться, что данные на месте
      и нет фигурных скобок.
- [ ] Договор-поручение с Selectel запрошен тикетом (выдают бесплатно).
- [ ] Домен отправки клиента подтверждён, тестовое письмо дошло во
      «Входящие» Gmail, Яндекса и Mail.ru, SPF и DKIM — `pass`.
- [ ] Пройдены обе ручные проверки: [генерация](e2e-generation.md)
      и [форма на сайте](e2e-tilda.md), последняя — на настоящей странице Тильды.

---

## Если что-то пошло не так

| Симптом | Куда смотреть |
|---|---|
| HTTPS не поднимается | записи DNS ещё не разошлись; `docker compose logs web` |
| `migrate` завершается с ошибкой | `docker compose logs migrate`; api и worker при этом не стартуют — это защита, а не поломка |
| Документы не создаются | `docker compose logs worker`; чаще всего не хватило памяти Chromium. Если браузер вообще не стартует — образ собран неправильно, но это ловится при сборке |
| Письма не уходят | домен не подтверждён, либо неверные `SMTP_*`; смотреть журнал писем в кабинете |
| Нужен откат | вернуть прежний `IMAGE_TAG` в `.env` и `docker compose up -d --wait api worker web` |
