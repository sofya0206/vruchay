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

say "1/5 Обновление системы"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
ok "система обновлена"

say "2/5 Установка пакетов"
# docker.io и docker-compose-v2 из репозитория Ubuntu: версии чуть старше
# официальных, зато обновляются вместе с системой и не требуют отдельного
# репозитория, который потом забывают обновлять.
apt-get install -y -qq \
  docker.io docker-compose-v2 \
  age awscli \
  ufw curl ca-certificates
systemctl enable --now docker
ok "docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
ok "age, awscli, ufw"

say "3/5 Пользователь приложения"
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

say "4/5 Межсетевой экран"
# Порядок важен: сначала разрешаем SSH, потом включаем экран. Иначе
# включение отрежет вас от собственного сервера.
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ok "открыты только 22, 80 и 443"

say "5/5 Каталог приложения"
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

Дальше — docs/launch-day.md, шаг 6.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INFO
