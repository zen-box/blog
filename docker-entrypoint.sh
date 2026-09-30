#!/bin/sh
set -e

# 以 root 启动时：确保数据目录（通常是挂载进来的 ./data）归 blog 用户所有，然后降权运行
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  if [ "$(stat -c %u "$DATA_DIR")" != "1001" ]; then
    chown -R blog:blog "$DATA_DIR"
  fi
  exec setpriv --reuid=blog --regid=blog --init-groups "$@"
fi

exec "$@"
