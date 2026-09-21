#!/usr/bin/env bash
#
# Подготовка чистого сервера к работе. Запускается один раз, от root.
#
#   ssh root@СЕРВЕР 'bash -s' < scripts/server-bootstrap.sh
#
# Или скопировать файл на сервер и запустить: bash server-bootstrap.sh
#
# Скрипт можно запускать повторно: он проверяет, что уже сделано, и не ломает
# существующее. Это важно — половина проблем с настройкой серверов возникает
# из-за боязни запустить шаг второй раз.
#
# Что делает:
#   1. Обновляет систему и ставит Docker, age, awscli
#   2. Заводит пользователя vruchay — приложение не должно работать от root
#   3. Закрывает всё, кроме SSH, HTTP и HTTPS
#   4. Готовит /opt/vruchay под файлы приложения
#
# Чего НЕ делает намеренно:
#   - не отключает вход по паролю (сделаете сами, убедившись, что ключ работает)
#   - не создаёт .env с секретами — они не должны проходить через скрипт
set -euo pipefail

APP_USER=vruchay
APP_DIR=/opt/vruchay

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()  { printf '  ✓ %s\n' "$1"; }

[ "$(id -u)" -eq 0 ] || { echo "Запускать нужно от root"; exit 1; }

say "1/7 Обновление системы"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
ok "система обновлена"

say "2/7 Установка пакетов"
# docker.io и docker-compose-v2 из репозитория Ubuntu: версии чуть старше
# официальных, зато обновляются вместе с системой и не требуют отдельного
# репозитория, который потом забывают обновлять.
apt-get install -y -qq \
  docker.io docker-compose-v2 \
  age \
  ufw curl unzip ca-certificates

# Журналы контейнеров по умолчанию не ограничены ничем и растут, пока
# не кончится диск. Заметить это заранее нельзя: место кончается тихо,
# а падает при этом база — она первой не сможет записать.
if [ ! -f /etc/docker/daemon.json ]; then
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" }
}
JSON
  ok "журналы контейнеров ограничены (5 файлов по 20 МБ)"
fi

systemctl enable --now docker
ok "docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
ok "age, ufw"

# awscli из архива Ubuntu 24.04 убран — ставим официальный AWS CLI v2.
# Это не прихоть: пакета `awscli` в noble просто нет, и apt обрывается
# на «has no installation candidate», не поставив ничего следом.
if command -v aws >/dev/null 2>&1; then
  ok "aws $(aws --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) уже стоит"
else
  TMP=$(mktemp -d)
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "$TMP/awscli.zip"
  unzip -q "$TMP/awscli.zip" -d "$TMP"
  "$TMP/aws/install" >/dev/null
  rm -rf "$TMP"
  ok "aws $(aws --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
fi

say "3/7 Пользователь приложения"
if id "$APP_USER" &>/dev/null; then
  ok "пользователь $APP_USER уже есть"
else
  adduser --disabled-password --gecos '' "$APP_USER"
  ok "создан пользователь $APP_USER"
fi
usermod -aG docker "$APP_USER"
ok "$APP_USER добавлен в группу docker"

# Ключ доступа копируется от root: тот же ключ, которым вы вошли сюда.
if [ -f /root/.ssh/authorized_keys ]; then
  mkdir -p "/home/$APP_USER/.ssh"
  cp /root/.ssh/authorized_keys "/home/$APP_USER/.ssh/authorized_keys"
  chown -R "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh"
  chmod 700 "/home/$APP_USER/.ssh"
  chmod 600 "/home/$APP_USER/.ssh/authorized_keys"
  ok "ключ доступа скопирован пользователю $APP_USER"
fi

say "4/7 Межсетевой экран"
# Порядок важен: сначала разрешаем SSH, потом включаем экран. Иначе
# включение отрежет вас от собственного сервера.
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ok "открыты только 22, 80 и 443"

say "5/7 Файл подкачки"
# На машине с 4 ГБ подкачка — не оптимизация, а страховка. Сборка образа
# и Chromium в пике вместе перекрывают физическую память; без подкачки ядро
# в этот момент убивает процесс, и чаще всего не тот, который виноват.
# Подкачка делает пик медленным вместо смертельного.
if swapon --show | grep -q .; then
  ok "подкачка уже включена ($(free -h | awk '/Swap:/{print $2}'))"
else
  fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Подкачка нужна как аварийный запас, а не как повседневная память:
  # на сетевом диске обращение к ней медленное.
  sysctl -q vm.swappiness=10
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  ok "подкачка 4 ГБ включена"
fi

say "6/7 Ежедневный присмотр за диском"
# Каждая сборка образа оставляет прежние слои: сервер весит 3,2 ГБ, и
# несколько сборок подряд занимают диск целиком. Первой от этого падает
# база — PostgreSQL не может записать контрольную точку, аварийно
# завершается и уходит в бесконечное восстановление, а сервис отвечает
# пятисотой ошибкой на каждый вход. Так уже случилось однажды.
#
# Еженедельной уборки для этого мало: за день активной работы бывает
# несколько сборок. Проверяем ежедневно и убираем, не дожидаясь, пока
# место кончится совсем.
#
# Именно `image prune` без -a: он трогает только слои, на которые ничего
# не ссылается. С -a снёс бы и базовые образы, и каждая сборка начиналась бы
# с повторной загрузки node и caddy.
CLEANUP=/etc/cron.daily/vruchay-disk-watch
rm -f /etc/cron.weekly/vruchay-docker-prune
cat > "$CLEANUP" <<'SH'
#!/bin/sh
# Порог 25%: ниже него до полного диска остаётся одна сборка.
FREE=$(df --output=pcent / | tail -1 | tr -dc '0-9')
[ "$((100 - FREE))" -ge 25 ] && exit 0
{
  echo "$(date -Is) свободно $((100 - FREE))% — убираю неиспользуемые слои"
  docker image prune -f
  docker builder prune -f
  df -h /
} >> /var/log/vruchay-disk.log 2>&1
SH
chmod +x "$CLEANUP"
ok "ежедневный присмотр за диском включён (порог 25% свободного)"

say "7/7 Каталог приложения"
mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"
ok "$APP_DIR готов"

cat <<INFO

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Сервер готов.

Что дальше:

1. Проверьте вход новым пользователем — ИЗ ДРУГОГО ОКНА, не закрывая это:
     ssh -i ~/.ssh/vruchay $APP_USER@$(curl -s -4 ifconfig.me 2>/dev/null || echo СЕРВЕР)

2. Убедившись, что вход работает, отключите вход по паролю:
     sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
     systemctl restart ssh

3. Скопируйте файлы приложения (с рабочей машины):
     scp -i ~/.ssh/vruchay docker-compose.prod.yml $APP_USER@СЕРВЕР:$APP_DIR/
     scp -i ~/.ssh/vruchay -r scripts $APP_USER@СЕРВЕР:$APP_DIR/
     scp -i ~/.ssh/vruchay .env.prod.example $APP_USER@СЕРВЕР:$APP_DIR/.env

4. Заполните $APP_DIR/.env и закройте его: chmod 600 $APP_DIR/.env

Дальше — собрать и выкатить приложение.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INFO
