#!/usr/bin/env bash
#=====================================================================
#  server-init.sh —— Linux 服务器初始化 / 安全加固(交互式菜单)
#
#  用法:
#    curl -fsSL https://你的域名/server-init.sh | bash
#    curl -fsSL https://你的域名/server-init.sh | bash -s -- --help
#    # 非交互示例:
#    curl -fsSL https://你的域名/server-init.sh | bash -s -- -y --all \
#         --user deploy --ssh-port 22222 --pubkey "ssh-ed25519 AAAA..."
#
#  设计要点:
#    * 所有函数先定义, 最后一行才调用 main, 下载中断不会执行半截脚本
#    * 交互输入走 /dev/tty (curl | bash 时 stdin 已被脚本占用)
#    * 每个步骤在独立子 shell 中运行, 单步失败不影响其他步骤
#    * 改配置前自动备份到 /root/init-backup/<时间戳>/
#    * 绝不删除当前 sshd 正在使用的端口的防火墙放行规则
#    * 禁用 root / 密码登录是独立的"收尾"步骤, 需要你确认已测试登录
#=====================================================================

SCRIPT_VERSION="1.0.0"
LOG_FILE="/var/log/server-init.log"
STATE_DIR="/etc/server-init"
STATE_FILE="$STATE_DIR/state"
BACKUP_ROOT="/root/init-backup"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$TS"
SSH_DROPIN="/etc/ssh/sshd_config.d/00-server-init.conf"
SSH_MARK_BEGIN="# BEGIN server-init"
SSH_MARK_END="# END server-init"

WORK=""
NONINTERACTIVE=0
RUN_ALL=0
STEPS_ARG=""
OPT_USER="" OPT_SSH_PORT="" OPT_PUBKEY="" OPT_TZ="" OPT_SWAP_MB=""
OPT_MIRROR="" OPT_REGION=""
OPT_DISABLE_PASSWORD=0 OPT_DISABLE_ROOT=0

OS_ID="" OS_LIKE="" OS_VER="" OS_CODENAME="" OS_NAME=""
PM="" FAMILY="" FW=""
SELECTED=()
RECOMMENDED=(1 2 3 5 6 7 8 9)

# ------------------------- 颜色与输出 -------------------------
if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'; C_BLU=$'\033[34m'
  C_CYN=$'\033[36m'; C_BLD=$'\033[1m'; C_RST=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YLW=""; C_BLU=""; C_CYN=""; C_BLD=""; C_RST=""
fi

_log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*" >>"$LOG_FILE" 2>/dev/null || true; }
info() { printf '%s[信息]%s %s\n' "$C_BLU" "$C_RST" "$*"; _log "INFO $*"; }
ok()   { printf '%s[完成]%s %s\n' "$C_GRN" "$C_RST" "$*"; _log "OK $*"; }
warn() { printf '%s[警告]%s %s\n' "$C_YLW" "$C_RST" "$*" >&2; _log "WARN $*"; }
err()  { printf '%s[错误]%s %s\n' "$C_RED" "$C_RST" "$*" >&2; _log "ERR $*"; }
die()  { err "$*"; exit 1; }

# 安静执行(输出写日志, 失败时返回非 0)
run() {
  _log "RUN $*"
  if "$@" >>"$LOG_FILE" 2>&1; then
    return 0
  else
    local rc=$?
    _log "FAIL($rc) $*"
    return "$rc"
  fi
}

# 实时显示输出并写日志, 返回命令本身的退出码
run_v() {
  _log "RUN(v) $*"
  local rc=0
  "$@" 2>&1 | tee -a "$LOG_FILE" && rc=0 || rc=${PIPESTATUS[0]}
  return "$rc"
}

note()        { printf '%s\n' "$*" >>"$WORK/summary"; }
need_reboot() { : >"$WORK/reboot"; }

# ------------------------- 交互输入 -------------------------
ask_input() { # ask_input "提示" "默认值"  -> stdout 输出结果
  local prompt=$1 def=${2:-} ans=""
  if (( NONINTERACTIVE )); then printf '%s' "$def"; return 0; fi
  printf '%s%s%s [%s]: ' "$C_CYN" "$prompt" "$C_RST" "$def" >&2
  IFS= read -r -u 3 ans || ans=""
  printf '%s' "${ans:-$def}"
}

ask_yn() { # ask_yn "提示" y|n   返回 0=是 1=否
  local prompt=$1 def=${2:-n} ans="" hint="y/N"
  if (( NONINTERACTIVE )); then [[ $def == y ]]; return; fi
  [[ $def == y ]] && hint="Y/n"
  while :; do
    printf '%s%s%s [%s]: ' "$C_CYN" "$prompt" "$C_RST" "$hint" >&2
    IFS= read -r -u 3 ans || ans=""
    ans=${ans:-$def}
    case ${ans,,} in
      y|yes|是) return 0 ;;
      n|no|否)  return 1 ;;
    esac
  done
}

ask_word() { # 必须输入指定单词才算确认
  local prompt=$1 word=$2 ans=""
  if (( NONINTERACTIVE )); then return 1; fi
  printf '%s%s%s (输入 %s 确认, 其他内容取消): ' "$C_YLW" "$prompt" "$C_RST" "$word" >&2
  IFS= read -r -u 3 ans || ans=""
  [[ $ans == "$word" ]]
}

# ------------------------- 小工具 -------------------------
gen_password() {
  local p
  p=$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')
  printf '%s' "${p:0:20}"
}

valid_port() { [[ $1 =~ ^[0-9]+$ ]] && (( $1 >= 1 && $1 <= 65535 )); }
valid_addr() { [[ $1 =~ ^[0-9a-fA-F:.]+(/[0-9]{1,3})?$ ]]; }

port_in_use() {
  ss -ltn 2>/dev/null | awk -v p="$1" 'NR>1 {n=split($4,a,":"); if (a[n]==p) f=1} END{exit !f}'
}

parse_size_mb() {
  local s=${1// /}
  s=${s^^}
  if [[ $s =~ ^([0-9]+)G(B)?$ ]]; then
    echo $(( BASH_REMATCH[1] * 1024 ))
  elif [[ $s =~ ^([0-9]+)(M(B)?)?$ ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    echo 0
  fi
}

server_ip() {
  local ip
  ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}') || true
  [[ -n $ip ]] || ip=$(hostname -I 2>/dev/null | awk '{print $1}') || true
  printf '%s' "${ip:-<服务器IP>}"
}

backup_file() {
  local f=$1
  [[ -e $f ]] || return 0
  mkdir -p "$BACKUP_DIR"
  cp -a --parents "$f" "$BACKUP_DIR/" 2>/dev/null || true
}

cred_save() {
  mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_ROOT" "$BACKUP_DIR" 2>/dev/null || true
  umask 077
  printf '%s\n' "$*" >>"$BACKUP_DIR/credentials.txt"
  chmod 600 "$BACKUP_DIR/credentials.txt"
}

state_get() {
  if [[ -f $STATE_FILE ]]; then
    sed -n "s/^$1=//p" "$STATE_FILE" | tail -n1 | tr -d '"' || true
  fi
  return 0
}

state_set() {
  mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
  touch "$STATE_FILE"; chmod 600 "$STATE_FILE"
  sed -i "/^$1=/d" "$STATE_FILE"
  printf '%s="%s"\n' "$1" "$2" >>"$STATE_FILE"
}

in_container() { systemd-detect-virt -c >/dev/null 2>&1; }

# ------------------------- 系统识别 -------------------------
detect_os() {
  [[ -r /etc/os-release ]] || die "无法识别系统: 缺少 /etc/os-release"
  local _o
  mapfile -t _o < <( . /etc/os-release; printf '%s\n' "${ID:-}" "${ID_LIKE:-}" "${VERSION_ID:-}" "${VERSION_CODENAME:-}" "${PRETTY_NAME:-}" )
  OS_ID=${_o[0]:-}; OS_LIKE=${_o[1]:-}; OS_VER=${_o[2]:-}; OS_CODENAME=${_o[3]:-}; OS_NAME=${_o[4]:-$OS_ID}
  case $OS_ID in
    alpine|arch|manjaro|nixos|void) die "暂不支持 $OS_NAME (仅支持 Debian/Ubuntu/RHEL 系/openSUSE)" ;;
  esac
  if command -v apt-get >/dev/null 2>&1; then PM=apt; FAMILY=debian
  elif command -v dnf >/dev/null 2>&1; then PM=dnf; FAMILY=rhel
  elif command -v yum >/dev/null 2>&1; then PM=yum; FAMILY=rhel
  elif command -v zypper >/dev/null 2>&1; then PM=zypper; FAMILY=suse
  else die "未找到受支持的包管理器 (apt/dnf/yum/zypper)"
  fi
}

detect_fw() {
  if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
    FW=firewalld
  elif [[ $FAMILY == debian ]]; then
    FW=ufw
  else
    FW=firewalld
  fi
}

# ------------------------- 包管理 -------------------------
apt_refresh() {
  [[ -f $WORK/apt_updated ]] && return 0
  run_v apt-get update -o Acquire::Retries=3 -o DPkg::Lock::Timeout=120 || warn "apt-get update 失败, 继续尝试"
  : >"$WORK/apt_updated"
}

pkg_install() {
  case $PM in
    apt)
      apt_refresh
      run_v apt-get install -y -o Acquire::Retries=3 -o DPkg::Lock::Timeout=120 \
        -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold "$@" ;;
    dnf)    run_v dnf -y install "$@" ;;
    yum)    run_v yum -y install "$@" ;;
    zypper) run_v zypper -n install "$@" ;;
  esac
}

pkg_installed() {
  case $PM in
    apt) dpkg -s "$1" >/dev/null 2>&1 ;;
    *)   rpm -q "$1" >/dev/null 2>&1 ;;
  esac
}

ensure_epel() {
  [[ $FAMILY == rhel ]] || return 0
  pkg_installed epel-release && return 0
  pkg_install epel-release || warn "epel-release 安装失败, 部分软件可能无法安装"
}

svc_name_ssh() {
  local s
  if [[ $FAMILY == debian ]]; then
    for s in ssh sshd; do
      systemctl list-unit-files "$s.service" 2>/dev/null | grep -q "^$s.service" && { echo "$s"; return 0; }
    done
    echo ssh
  else
    for s in sshd ssh; do
      systemctl list-unit-files "$s.service" 2>/dev/null | grep -q "^$s.service" && { echo "$s"; return 0; }
    done
    echo sshd
  fi
}

# ------------------------- 地区检测 -------------------------
get_region() { if [[ -s $WORK/region ]]; then cat "$WORK/region"; else echo intl; fi; }
set_region() { printf '%s' "$1" >"$WORK/region"; }

detect_region() {
  if [[ -n $OPT_REGION ]]; then set_region "$OPT_REGION"; return 0; fi
  local loc="" t_cn t_gl
  loc=$(curl -fsS --connect-timeout 4 --max-time 6 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null \
        | sed -n 's/^loc=//p' | tr -d '\r') || true
  if [[ $loc == CN ]]; then set_region cn; return 0; fi
  if [[ -n $loc ]]; then set_region intl; return 0; fi
  # Cloudflare 不可达: 用实测速度比较
  t_cn=$(curl -o /dev/null -sS -m 6 -w '%{time_total}' https://mirrors.aliyun.com/ 2>/dev/null) || t_cn=99
  t_gl=$(curl -o /dev/null -sS -m 6 -w '%{time_total}' https://deb.debian.org/ 2>/dev/null) || t_gl=99
  if awk -v a="$t_cn" -v b="$t_gl" 'BEGIN{exit !(a<b)}'; then set_region cn; else set_region intl; fi
}

# ------------------------- 防火墙抽象层 -------------------------
fw_available() {
  case $FW in
    ufw) command -v ufw >/dev/null 2>&1 ;;
    firewalld) command -v firewall-cmd >/dev/null 2>&1 ;;
  esac
}

fw_ensure_installed() {
  case $FW in
    ufw)
      command -v ufw >/dev/null 2>&1 || pkg_install ufw ;;
    firewalld)
      command -v firewall-cmd >/dev/null 2>&1 || pkg_install firewalld
      systemctl is-active --quiet firewalld 2>/dev/null || run systemctl enable --now firewalld ;;
  esac
}

fw_active() {
  case $FW in
    ufw) ufw status 2>/dev/null | grep -q '^Status: active' ;;
    firewalld) firewall-cmd --state >/dev/null 2>&1 ;;
  esac
}

fw_allow_port() { # port [proto]
  local port=$1 proto=${2:-tcp}
  case $FW in
    ufw) run ufw allow "${port}/${proto}" ;;
    firewalld)
      run firewall-cmd --permanent --add-port="${port}/${proto}"
      firewall-cmd --add-port="${port}/${proto}" >/dev/null 2>&1 || true ;;
  esac
}

fw_allow_from() { # 源地址 端口 [proto]
  local src=$1 port=$2 proto=${3:-tcp} fam=ipv4 rule
  case $FW in
    ufw)
      if [[ $src == "0.0.0.0/0" || $src == any ]]; then
        run ufw allow "${port}/${proto}"
      else
        run ufw allow proto "$proto" from "$src" to any port "$port"
      fi ;;
    firewalld)
      [[ $src == *:* ]] && fam=ipv6
      if [[ $src == "0.0.0.0/0" || $src == any ]]; then
        fw_allow_port "$port" "$proto"
      else
        rule="rule family=\"$fam\" source address=\"$src\" port port=\"$port\" protocol=\"$proto\" accept"
        run firewall-cmd --permanent --add-rich-rule="$rule"
        firewall-cmd --add-rich-rule="$rule" >/dev/null 2>&1 || true
      fi ;;
  esac
}

fw_allow_iface() { # 网卡
  case $FW in
    ufw) run ufw allow in on "$1" ;;
    firewalld)
      run firewall-cmd --permanent --zone=trusted --add-interface="$1" || true
      firewall-cmd --zone=trusted --add-interface="$1" >/dev/null 2>&1 || true ;;
  esac
}

fw_reload() { [[ $FW == firewalld ]] && firewall-cmd --reload >/dev/null 2>&1 || true; }

# 当前所有需要保护的 SSH 端口(配置中的 + 实际监听的 + 状态文件记录的)
ssh_config_ports() { sshd -T 2>/dev/null | awk '$1=="port"{print $2}' || true; }
ssh_listen_ports() { ss -ltnp 2>/dev/null | awk 'NR>1 && /sshd/ {n=split($4,a,":"); print a[n]}' || true; }
ssh_protected_ports() {
  { ssh_config_ports; ssh_listen_ports; state_get SSH_PORTS | tr ' ' '\n'; } \
    | awk 'NF && $1 ~ /^[0-9]+$/' | sort -un | tr '\n' ' ' | sed 's/ *$//'
}
is_ssh_port() { local p; for p in $(ssh_protected_ports); do [[ $p == "$1" ]] && return 0; done; return 1; }

fw_delete_port() { # 带保护: 绝不删除 SSH 端口
  local port=$1 proto=${2:-tcp}
  if is_ssh_port "$port"; then
    warn "拒绝删除 SSH 端口 $port 的放行规则"
    return 1
  fi
  case $FW in
    ufw) ufw --force delete allow "${port}/${proto}" >/dev/null 2>&1 || true ;;
    firewalld)
      firewall-cmd --permanent --remove-port="${port}/${proto}" >/dev/null 2>&1 || true
      firewall-cmd --remove-port="${port}/${proto}" >/dev/null 2>&1 || true ;;
  esac
  return 0
}

fw_delete_ssh_old_port() { # 仅在该端口确认已不再被 sshd 使用时才删除
  local p=$1
  fw_delete_port "$p" tcp || return 0
  if [[ $p == 22 ]]; then
    case $FW in
      ufw) ufw --force delete allow OpenSSH >/dev/null 2>&1 || true ;;
      firewalld)
        firewall-cmd --permanent --remove-service=ssh >/dev/null 2>&1 || true
        firewall-cmd --remove-service=ssh >/dev/null 2>&1 || true ;;
    esac
  fi
}

fw_open_web() {
  if [[ $(state_get CF_ENABLED) == yes ]]; then
    info "已启用 Cloudflare 回源限制, 不再放行全网 80/443"
    return 0
  fi
  if ! fw_available; then
    note "提示: 未安装防火墙, 80/443 未做任何限制 (可执行第 6 项)"
    return 0
  fi
  fw_allow_port 80 tcp; fw_allow_port 443 tcp
  fw_reload
  ok "已放行 80/443"
}

# ------------------------- SSH 配置辅助 -------------------------
ssh_has_include() { grep -qiE '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/' /etc/ssh/sshd_config 2>/dev/null; }

ssh_write_conf() { # 依据 state 生成受管配置
  local ports pub pw root body="" p
  ports=$(state_get SSH_PORTS); pub=$(state_get SSH_PUBKEY)
  pw=$(state_get SSH_PASSWORD); root=$(state_get SSH_ROOT)
  body+="# 由 server-init.sh 生成, 请勿手动编辑 (状态保存在 $STATE_FILE)"$'\n'
  for p in $ports; do body+="Port $p"$'\n'; done
  [[ -n $pub ]] && body+="PubkeyAuthentication yes"$'\n'
  if [[ $pw == no ]]; then
    body+="PasswordAuthentication no"$'\n'
    body+="ChallengeResponseAuthentication no"$'\n'
  fi
  [[ -n $root ]] && body+="PermitRootLogin $root"$'\n'

  if ssh_has_include; then
    mkdir -p /etc/ssh/sshd_config.d
    printf '%s' "$body" >"$SSH_DROPIN"
    chmod 644 "$SSH_DROPIN"
  else
    # 老系统没有 Include: 把受管块放在主配置最前面 (sshd 以第一个出现的值为准)
    sed -i "/^$SSH_MARK_BEGIN\$/,/^$SSH_MARK_END\$/d" /etc/ssh/sshd_config
    { printf '%s\n' "$SSH_MARK_BEGIN"; printf '%s' "$body"; printf '%s\n' "$SSH_MARK_END"; cat /etc/ssh/sshd_config; } >"$WORK/sshd_config.new"
    cat "$WORK/sshd_config.new" >/etc/ssh/sshd_config
  fi
}

ssh_snapshot() {
  local items=(etc/ssh/sshd_config)
  [[ -d /etc/ssh/sshd_config.d ]] && items+=(etc/ssh/sshd_config.d)
  tar czf "$WORK/ssh-snap.tgz" -C / "${items[@]}"
}

ssh_validate() { mkdir -p /run/sshd; sshd -t; }

ssh_restart() {
  local svc; svc=$(svc_name_ssh)
  if systemctl is-active --quiet ssh.socket 2>/dev/null; then
    info "检测到 ssh.socket 激活模式, 切换为常规 ssh 服务以便端口配置生效"
    run systemctl disable --now ssh.socket || true
    run systemctl enable "$svc" || true
  fi
  run systemctl restart "$svc"
}

ssh_rollback() {
  warn "SSH 配置出错, 正在回滚..."
  rm -f "$SSH_DROPIN"
  [[ -f $WORK/ssh-snap.tgz ]] && tar xzf "$WORK/ssh-snap.tgz" -C /
  ssh_restart || true
}

ssh_wait_listen() { # 等待端口监听, 最多 8 秒
  local p=$1 i
  for i in 1 2 3 4 5 6 7 8; do port_in_use "$p" && return 0; sleep 1; done
  return 1
}

selinux_allow_ssh_port() {
  local p=$1
  [[ $p == 22 ]] && return 0
  command -v getenforce >/dev/null 2>&1 || return 0
  [[ $(getenforce) == Disabled ]] && return 0
  command -v semanage >/dev/null 2>&1 || pkg_install policycoreutils-python-utils || pkg_install policycoreutils-python
  semanage port -a -t ssh_port_t -p tcp "$p" >/dev/null 2>&1 || semanage port -m -t ssh_port_t -p tcp "$p"
}

install_authorized_key() { # 用户 家目录 公钥
  local u=$1 home=$2 key=$3 g
  g=$(id -gn "$u")
  install -d -m 700 -o "$u" -g "$g" "$home/.ssh"
  touch "$home/.ssh/authorized_keys"
  grep -qxF "$key" "$home/.ssh/authorized_keys" || printf '%s\n' "$key" >>"$home/.ssh/authorized_keys"
  chmod 600 "$home/.ssh/authorized_keys"
  chown "$u:$g" "$home/.ssh/authorized_keys"
  command -v restorecon >/dev/null 2>&1 && restorecon -R "$home/.ssh" >/dev/null 2>&1 || true
}

valid_pubkey() {
  local f="$WORK/pub.check"
  printf '%s\n' "$1" >"$f"
  ssh-keygen -l -f "$f" >/dev/null 2>&1
}

sudoer_with_key() {
  local g m h
  for g in sudo wheel; do
    for m in $(getent group "$g" 2>/dev/null | cut -d: -f4 | tr ',' ' '); do
      h=$(getent passwd "$m" | cut -d: -f6)
      if [[ -s $h/.ssh/authorized_keys ]]; then echo "$m"; return 0; fi
    done
  done
  return 1
}

# ------------------------- fail2ban -------------------------
fail2ban_configure() {
  command -v fail2ban-client >/dev/null 2>&1 || return 0
  local ports ignore="127.0.0.1/8 ::1" backend=auto extra=""
  ports=$(ssh_protected_ports | tr ' ' ',')
  [[ -n $ports ]] || ports=22
  [[ -n ${SSH_CLIENT:-} ]] && ignore+=" ${SSH_CLIENT%% *}"
  python3 -c 'import systemd.journal' >/dev/null 2>&1 && backend=systemd
  if [[ $FW == firewalld ]]; then
    extra=$'banaction = firewallcmd-rich-rules\nbanaction_allports = firewallcmd-allports'
  fi
  mkdir -p /etc/fail2ban/jail.d
  cat >/etc/fail2ban/jail.d/server-init.local <<EOF
# 由 server-init.sh 生成
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
ignoreip = $ignore
$extra

[sshd]
enabled = true
port    = $ports
backend = $backend
EOF
  run systemctl enable fail2ban || true
  run systemctl restart fail2ban || { warn "fail2ban 启动失败, 请查看: journalctl -u fail2ban"; return 0; }
  sleep 2
  if fail2ban-client status sshd >/dev/null 2>&1; then
    ok "fail2ban 已运行 (sshd jail, 端口: $ports)"
  else
    warn "fail2ban 的 sshd jail 未正常运行, 请检查日志后端 (journalctl -u fail2ban)"
  fi
}

# ------------------------- 步骤 1: 软件源 -------------------------
MIRROR_HOST=""

mirror_backup() {
  mkdir -p "$BACKUP_ROOT"
  local orig="$BACKUP_ROOT/original-sources.tar.gz" paths=() p
  for p in etc/apt/sources.list etc/apt/sources.list.d etc/yum.repos.d; do
    [[ -e /$p ]] && paths+=("$p")
  done
  [[ ${#paths[@]} -gt 0 ]] || return 0
  if [[ ! -f $orig ]]; then
    tar czf "$orig" -C / "${paths[@]}"
    info "已保存原始软件源备份: $orig"
  fi
  mkdir -p "$BACKUP_DIR"
  tar czf "$BACKUP_DIR/sources-before.tar.gz" -C / "${paths[@]}"
}

mirror_restore_orig() {
  local orig="$BACKUP_ROOT/original-sources.tar.gz"
  [[ -f $orig ]] || { warn "没有找到原始软件源备份"; return 1; }
  tar xzf "$orig" -C /
}

mirror_apply_apt() {
  local scheme=http base f
  [[ -f /etc/ssl/certs/ca-certificates.crt ]] && scheme=https
  base="$scheme://$MIRROR_HOST"
  local files=()
  [[ -f /etc/apt/sources.list ]] && files+=(/etc/apt/sources.list)
  for f in /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
    [[ -f $f ]] && files+=("$f")
  done
  [[ ${#files[@]} -gt 0 ]] || { warn "未找到 apt 源文件"; return 1; }
  for f in "${files[@]}"; do
    sed -i -E \
      -e "s#https?://(deb|security)\.debian\.org/debian-security#$base/debian-security#g" \
      -e "s#https?://(deb|ftp\.[a-z]+)\.debian\.org/debian#$base/debian#g" \
      -e "s#https?://([a-z0-9.-]+\.)?archive\.ubuntu\.com/ubuntu#$base/ubuntu#g" \
      -e "s#https?://security\.ubuntu\.com/ubuntu#$base/ubuntu#g" \
      -e "s#https?://ports\.ubuntu\.com(/ubuntu-ports)?#$base/ubuntu-ports#g" \
      "$f"
  done
  rm -f "$WORK/apt_updated"
  run apt-get update -o Acquire::Retries=2
}

mirror_apply_rhel() {
  local base="https://$MIRROR_HOST" f
  case $OS_ID in
    rocky)
      for f in /etc/yum.repos.d/[Rr]ocky*.repo; do
        [[ -f $f ]] || continue
        sed -i -E -e 's|^mirrorlist=|#mirrorlist=|' \
          -e "s|^#? ?baseurl=https?://dl\.rockylinux\.org/\\\$contentdir|baseurl=$base/rockylinux|" "$f"
      done ;;
    almalinux)
      for f in /etc/yum.repos.d/almalinux*.repo; do
        [[ -f $f ]] || continue
        sed -i -E -e 's|^mirrorlist=|#mirrorlist=|' \
          -e "s|^#? ?baseurl=https?://repo\.almalinux\.org/almalinux|baseurl=$base/almalinux|" "$f"
      done ;;
    *)
      warn "$OS_NAME 暂不支持自动换源, 已跳过"
      return 2 ;;
  esac
  run "$PM" -y clean all
  run "$PM" -y makecache
}

step_mirror() {
  local region opt choice mc rc=0
  region=$(get_region)
  info "地区检测结果: $([[ $region == cn ]] && echo '中国大陆 (cn)' || echo '境外 (intl)')"
  if (( NONINTERACTIVE )); then
    opt=${OPT_MIRROR:-auto}
  else
    echo "  1) 自动(推荐): 境内换国内镜像, 境外保持官方源"
    echo "  2) 强制使用国内镜像"
    echo "  3) 保持官方源不动"
    choice=$(ask_input "请选择" 1)
    case $choice in 2) opt=cn ;; 3) opt=off ;; *) opt=auto ;; esac
  fi
  case $opt in
    off) info "保持官方源不变"; return 0 ;;
    cn)  set_region cn ;;
    auto) if [[ $region != cn ]]; then info "境外机器, 保持官方源"; return 0; fi ;;
  esac

  echo "  可选镜像: 1) 阿里云 mirrors.aliyun.com  2) 清华 mirrors.tuna.tsinghua.edu.cn  3) 中科大 mirrors.ustc.edu.cn"
  mc=$(ask_input "镜像站" 1)
  case $mc in
    2) MIRROR_HOST=mirrors.tuna.tsinghua.edu.cn ;;
    3) MIRROR_HOST=mirrors.ustc.edu.cn ;;
    *) MIRROR_HOST=mirrors.aliyun.com ;;
  esac

  mirror_backup
  case $FAMILY in
    debian) mirror_apply_apt || rc=$? ;;
    rhel)   mirror_apply_rhel || rc=$? ;;
    *)      warn "$OS_NAME 暂不支持自动换源"; return 0 ;;
  esac
  if (( rc == 2 )); then return 0; fi
  if (( rc != 0 )); then
    warn "换源后刷新软件索引失败, 正在还原原始源..."
    mirror_restore_orig || true
    rm -f "$WORK/apt_updated"
    return 1
  fi
  ok "已切换到镜像: $MIRROR_HOST (原始源备份: $BACKUP_ROOT/original-sources.tar.gz, 可用第 18 项还原)"
  note "软件源: 已切换为 $MIRROR_HOST"
}

step_restore_mirror() {
  ask_yn "确认将软件源还原为最初的官方配置?" y || return 0
  mirror_restore_orig || return 1
  rm -f "$WORK/apt_updated"
  case $FAMILY in
    debian) run_v apt-get update || true ;;
    rhel)   run "$PM" -y clean all || true ;;
  esac
  ok "软件源已还原"
  note "软件源: 已还原为官方源"
}

# ------------------------- 步骤 2: 更新 / 升级内核 -------------------------
step_update() {
  info "更新软件包(含内核), 视网络情况可能需要几分钟..."
  case $PM in
    apt)
      apt_refresh
      run_v apt-get -y -o Acquire::Retries=3 -o DPkg::Lock::Timeout=120 \
        -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold full-upgrade
      run_v apt-get -y autoremove ;;
    dnf|yum) run_v "$PM" -y upgrade ;;
    zypper)  run_v zypper -n update ;;
  esac
  local reboot=0 running latest
  if [[ -f /var/run/reboot-required ]]; then
    reboot=1
  elif [[ $FAMILY == rhel ]]; then
    running=$(uname -r)
    latest=$(rpm -q kernel --qf '%{VERSION}-%{RELEASE}.%{ARCH}\n' 2>/dev/null | sort -V | tail -n1) || true
    [[ -n $latest && $latest != "$running" ]] && reboot=1
  fi
  if (( reboot )); then
    need_reboot
    note "需要重启以加载新内核 (脚本不会自动重启)"
    warn "已安装新内核, 需要重启后生效"
  fi
  ok "软件包更新完成"
}

# ------------------------- 步骤 3: 时区与时间同步 -------------------------
step_time() {
  local cur def tz tries=0 conf svc
  cur=$(timedatectl show -p Timezone --value 2>/dev/null) || cur=""
  def=${cur:-UTC}
  [[ $(get_region) == cn ]] && def=Asia/Shanghai
  [[ -n $OPT_TZ ]] && def=$OPT_TZ
  [[ -d /usr/share/zoneinfo ]] || pkg_install tzdata
  while :; do
    tz=$(ask_input "时区 (如 Asia/Shanghai, Asia/Singapore, UTC)" "$def")
    [[ -f /usr/share/zoneinfo/$tz ]] && break
    tries=$((tries+1))
    warn "无效的时区: $tz"
    (( NONINTERACTIVE || tries >= 3 )) && return 1
  done
  if command -v timedatectl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
    run timedatectl set-timezone "$tz"
  else
    ln -sf "/usr/share/zoneinfo/$tz" /etc/localtime
    [[ $FAMILY == debian ]] && echo "$tz" >/etc/timezone
  fi
  ok "时区已设置为 $tz"

  if in_container; then
    warn "容器环境无法设置系统时间, 跳过时间同步"
    return 0
  fi
  pkg_installed chrony || pkg_install chrony
  conf=/etc/chrony/chrony.conf; [[ -f $conf ]] || conf=/etc/chrony.conf
  if [[ -f $conf && $(get_region) == cn ]]; then
    backup_file "$conf"
    sed -i '/^# BEGIN server-init-ntp$/,/^# END server-init-ntp$/d' "$conf"
    sed -i -E 's/^(pool|server)[[:space:]]/# &/' "$conf"
    cat >>"$conf" <<'EOF'
# BEGIN server-init-ntp
server ntp.aliyun.com iburst
server ntp.tencent.com iburst
server cn.pool.ntp.org iburst
# END server-init-ntp
EOF
  fi
  for svc in chrony chronyd; do
    systemctl list-unit-files "$svc.service" 2>/dev/null | grep -q "^$svc.service" && break
  done
  run systemctl enable --now "$svc" || true
  run systemctl restart "$svc" || true
  sleep 2
  chronyc makestep >/dev/null 2>&1 || true
  ok "时间同步 (chrony) 已启用"
  note "时区: $tz, 时间同步: chrony"
}

# ------------------------- 步骤 4: DNS -------------------------
step_dns() {
  local def=1 choice dns="" fallback="" ip tries=0 nm_conf="/etc/NetworkManager/conf.d/90-server-init-dns.conf"
  [[ $(get_region) == cn ]] || def=3
  echo "  1) 阿里 DNS    223.5.5.5 223.6.6.6"
  echo "  2) 腾讯 + 阿里 119.29.29.29 223.5.5.5"
  echo "  3) Cloudflare + Google 1.1.1.1 8.8.8.8"
  echo "  4) 自定义"
  echo "  5) 跳过"
  choice=$(ask_input "请选择" "$def")
  case $choice in
    1) dns="223.5.5.5 223.6.6.6"; fallback="119.29.29.29" ;;
    2) dns="119.29.29.29 223.5.5.5"; fallback="223.6.6.6" ;;
    3) dns="1.1.1.1 8.8.8.8"; fallback="1.0.0.1 8.8.4.4" ;;
    4) dns=$(ask_input "DNS 服务器 (空格分隔)" "")
       for ip in $dns; do valid_addr "$ip" || { err "无效地址: $ip"; return 1; }; done
       fallback="" ;;
    *) info "已跳过"; return 0 ;;
  esac
  [[ -n $dns ]] || return 1

  backup_file /etc/resolv.conf
  mkdir -p "$BACKUP_DIR"
  cp -aL /etc/resolv.conf "$BACKUP_DIR/resolv.conf.before" 2>/dev/null || true

  if systemctl is-active --quiet systemd-resolved 2>/dev/null; then
    mkdir -p /etc/systemd/resolved.conf.d
    printf '[Resolve]\nDNS=%s\nFallbackDNS=%s\n' "$dns" "$fallback" >/etc/systemd/resolved.conf.d/90-server-init.conf
    run systemctl restart systemd-resolved
  elif systemctl is-active --quiet NetworkManager 2>/dev/null && grep -qi networkmanager /etc/resolv.conf 2>/dev/null; then
    printf '[global-dns-domain-*]\nservers=%s\n' "$(echo "$dns" | tr ' ' ',')" >"$nm_conf"
    nmcli general reload conf >/dev/null 2>&1 || true
    nmcli general reload dns-rc >/dev/null 2>&1 || true
  else
    [[ -L /etc/resolv.conf ]] && rm -f /etc/resolv.conf
    { echo "# 由 server-init.sh 生成"; for ip in $dns $fallback; do echo "nameserver $ip"; done; } >/etc/resolv.conf
    note "提示: /etc/resolv.conf 可能被 DHCP/云厂商 agent 覆盖, 如被覆盖请改网络配置"
  fi

  local host=www.baidu.com
  [[ $(get_region) == cn ]] || host=www.cloudflare.com
  sleep 1
  while (( tries < 3 )); do
    getent ahosts "$host" >/dev/null 2>&1 && { ok "DNS 已设置为: $dns (解析测试通过)"; note "DNS: $dns"; return 0; }
    tries=$((tries+1)); sleep 2
  done
  err "DNS 解析测试失败, 正在回滚..."
  rm -f /etc/systemd/resolved.conf.d/90-server-init.conf "$nm_conf"
  if [[ -f $BACKUP_DIR/resolv.conf.before ]] && ! systemctl is-active --quiet systemd-resolved 2>/dev/null; then
    rm -f /etc/resolv.conf; cp -a "$BACKUP_DIR/resolv.conf.before" /etc/resolv.conf
  fi
  systemctl is-active --quiet systemd-resolved 2>/dev/null && systemctl restart systemd-resolved || true
  return 1
}

# ------------------------- 步骤 5: 用户 + SSH -------------------------
ssh_create_user() {
  local u=$1 grp pw nopw=0
  command -v sudo >/dev/null 2>&1 || pkg_install sudo
  if getent group sudo >/dev/null 2>&1; then grp=sudo
  elif getent group wheel >/dev/null 2>&1; then grp=wheel
  else groupadd sudo; grp=sudo; fi

  if id "$u" >/dev/null 2>&1; then
    info "用户 $u 已存在, 仅确保其在 $grp 组"
    usermod -aG "$grp" "$u"
  else
    useradd -m -s /bin/bash -G "$grp" "$u"
    pw=$(gen_password)
    echo "$u:$pw" | chpasswd
    cred_save "用户: $u  密码: $pw  (用于 sudo, 请保存后删除本文件)"
    printf '\n%s======== 新用户账号 ========%s\n  用户名: %s\n  密  码: %s%s%s   (用于 sudo; 请立即保存)\n%s============================%s\n\n' \
      "$C_YLW" "$C_RST" "$u" "$C_BLD" "$pw" "$C_RST" "$C_YLW" "$C_RST"
  fi
  if ask_yn "是否让 $u 执行 sudo 时免密 (NOPASSWD)?" n; then nopw=1; fi
  if (( nopw )); then
    echo "$u ALL=(ALL) NOPASSWD:ALL" >"$WORK/sudoers.tmp"
    if visudo -cf "$WORK/sudoers.tmp" >/dev/null 2>&1; then
      install -m 440 "$WORK/sudoers.tmp" "/etc/sudoers.d/90-server-init-$u"
    else
      warn "sudoers 校验失败, 未启用免密"
    fi
  fi
  note "已创建/配置用户: $u (加入 $grp 组)"
}

step_ssh() {
  mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
  if ! command -v sshd >/dev/null 2>&1; then
    info "未检测到 sshd, 正在安装 openssh-server"
    pkg_install openssh-server
    run systemctl enable --now "$(svc_name_ssh)" || true
  fi
  command -v ssh-keygen >/dev/null 2>&1 || pkg_install openssh-client || pkg_install openssh-clients
  mkdir -p /run/sshd

  local cur_ports old_state_ports
  cur_ports=$(ssh_protected_ports)
  [[ -n $cur_ports ]] || cur_ports=22
  old_state_ports=$(state_get SSH_PORTS)
  [[ -n $old_state_ports ]] || state_set SSH_PORTS "$cur_ports"
  [[ -n $(state_get SSH_PRIMARY) ]] || state_set SSH_PRIMARY "${cur_ports%% *}"
  backup_file /etc/ssh/sshd_config
  [[ -d /etc/ssh/sshd_config.d ]] && { mkdir -p "$BACKUP_DIR"; cp -a /etc/ssh/sshd_config.d "$BACKUP_DIR/" 2>/dev/null || true; }
  ssh_snapshot

  # ---- 1) 用户 ----
  local target_user=root target_home=/root def=y u
  if (( NONINTERACTIVE )) && [[ -z $OPT_USER ]]; then def=n; fi
  if ask_yn "是否创建普通用户并加入 sudo 组? (选否则继续使用 root)" "$def"; then
    u=$(ask_input "用户名" "${OPT_USER:-admin}")
    [[ $u =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || { err "用户名不合法: $u"; return 1; }
    [[ $u != root ]] || { err "不能使用 root 作为新用户名"; return 1; }
    ssh_create_user "$u"
    target_user=$u
    target_home=$(getent passwd "$u" | cut -d: -f6)
  fi
  state_set SSH_USER "$target_user"

  # ---- 2) 密钥 ----
  local pub="" kdir priv="" auto=0 choice i saved=0
  if ask_yn "是否启用 SSH 密钥登录?" y; then
    if [[ -n $OPT_PUBKEY ]]; then
      pub=$OPT_PUBKEY
    elif (( ! NONINTERACTIVE )); then
      echo "  1) 自动生成密钥对 (默认)"
      echo "  2) 粘贴我自己的公钥"
      choice=$(ask_input "请选择" 1)
      if [[ $choice == 2 ]]; then
        pub=$(ask_input "请粘贴公钥 (整行, 留空则自动生成)" "")
      fi
    fi
    if [[ -n $pub ]] && ! valid_pubkey "$pub"; then
      warn "公钥格式无效, 将改为自动生成"
      pub=""
    fi
    if [[ -z $pub ]]; then
      auto=1
      kdir=$(mktemp -d "$WORK/key.XXXXXX")
      ssh-keygen -q -t ed25519 -N "" -C "${target_user}@$(hostname)-$TS" -f "$kdir/id_ed25519"
      pub=$(cat "$kdir/id_ed25519.pub")
      priv="$kdir/id_ed25519"
    fi
    install_authorized_key "$target_user" "$target_home" "$pub"
    state_set SSH_PUBKEY yes
    ok "公钥已写入 $target_home/.ssh/authorized_keys"

    if (( auto )); then
      if (( NONINTERACTIVE )); then
        mkdir -p "$BACKUP_DIR"; umask 077
        cp "$priv" "$BACKUP_DIR/ssh-key-$target_user"; chmod 600 "$BACKUP_DIR/ssh-key-$target_user"
        cred_save "私钥文件: $BACKUP_DIR/ssh-key-$target_user (请取回后删除)"
        warn "私钥已保存到 $BACKUP_DIR/ssh-key-$target_user, 请立即取回并删除"
      else
        printf '\n%s========== 私钥 (请完整复制, 包含 BEGIN/END 行, 保存为本地文件) ==========%s\n' "$C_YLW" "$C_RST"
        cat "$priv"
        printf '%s========== 公钥 ==========%s\n%s\n\n' "$C_YLW" "$C_RST" "$pub"
        warn "私钥只显示这一次, 服务器上不会保留。本地保存后请执行: chmod 600 私钥文件"
        for i in 1 2 3 4 5; do
          if ask_word "我已保存好私钥" yes; then saved=1; break; fi
        done
        if (( ! saved )); then
          mkdir -p "$BACKUP_DIR"; umask 077
          cp "$priv" "$BACKUP_DIR/ssh-key-$target_user"
          cred_save "私钥文件: $BACKUP_DIR/ssh-key-$target_user (请取回后删除)"
          warn "未确认保存, 私钥已备份到 $BACKUP_DIR/ssh-key-$target_user"
        fi
      fi
      shred -u "$priv" 2>/dev/null || rm -f "$priv"
    fi
  fi

  # ---- 3) 端口 ----
  local new_port="" primary
  primary=$(state_get SSH_PRIMARY)
  if [[ -n $OPT_SSH_PORT ]]; then
    new_port=$OPT_SSH_PORT
  elif (( ! NONINTERACTIVE )) && ask_yn "是否修改 SSH 端口? (当前: $cur_ports)" n; then
    new_port=$(ask_input "新端口 (1024-65535)" "$(( RANDOM % 40000 + 20000 ))")
  fi
  if [[ -n $new_port ]]; then
    valid_port "$new_port" || { err "端口不合法: $new_port"; return 1; }
    if [[ " $cur_ports " != *" $new_port "* ]] && port_in_use "$new_port"; then
      err "端口 $new_port 已被其他程序占用"; return 1
    fi
    if (( new_port < 1024 )); then warn "使用 1024 以下端口不推荐"; fi
    # 先放行, 后切换; 旧端口暂时保留, 等你确认新端口可用后再用第 17 项关闭
    if fw_available; then fw_allow_port "$new_port" tcp; fw_reload; fi
    selinux_allow_ssh_port "$new_port"
    state_set SSH_PORTS "$(printf '%s\n' $(state_get SSH_PORTS) "$new_port" | awk '!s[$0]++' | tr '\n' ' ' | sed 's/ *$//')"
    state_set SSH_PRIMARY "$new_port"
  fi

  # ---- 4) 写入并生效 ----
  ssh_write_conf
  if ! ssh_validate; then
    ssh_rollback
    state_set SSH_PORTS "${old_state_ports:-$cur_ports}"
    err "sshd 配置校验失败, 已回滚"
    return 1
  fi
  ssh_restart || { ssh_rollback; return 1; }
  primary=$(state_get SSH_PRIMARY)
  if ! ssh_wait_listen "$primary"; then
    ssh_rollback
    err "sshd 未在端口 $primary 监听, 已回滚"
    return 1
  fi
  ok "SSH 配置已生效 (监听端口: $(state_get SSH_PORTS))"

  local ip; ip=$(server_ip)
  printf '\n%s请不要关闭当前窗口! 另开一个终端测试登录:%s\n' "$C_YLW" "$C_RST"
  printf '  ssh -p %s %s@%s%s\n\n' "$primary" "$target_user" "$ip" "$([[ -n $(state_get SSH_PUBKEY) ]] && echo ' -i <你保存的私钥文件>')"
  [[ -n $new_port ]] && warn "云服务器请到云厂商控制台的安全组/防火墙放行 TCP $new_port, 否则无法连接"
  note "SSH: 用户=$target_user 端口=$(state_get SSH_PORTS) (旧端口保留, 确认新端口可用后用第 17 项收尾)"
  note "登录命令: ssh -p $primary $target_user@$ip"
}

# ------------------------- 步骤 6: 防火墙 + fail2ban -------------------------
step_firewall() {
  fw_ensure_installed
  local ports p extra
  ports=$(ssh_protected_ports)
  [[ -n $ports ]] || { err "无法确定 SSH 端口, 为避免失联已中止"; return 1; }
  info "将放行 SSH 端口: $ports"
  for p in $ports; do fw_allow_port "$p" tcp; done
  extra=$(ask_input "额外放行的 TCP 端口 (空格分隔, 如 80 443, 留空跳过)" "")
  for p in $extra; do
    valid_port "$p" && fw_allow_port "$p" tcp || warn "忽略无效端口: $p"
  done
  case $FW in
    ufw)
      run ufw default deny incoming
      run ufw default allow outgoing
      run ufw --force enable ;;
    firewalld)
      fw_reload ;;
  esac
  # 最终校验: 所有 SSH 端口必须已被放行, 否则不允许保持启用
  local missing=""
  for p in $ports; do
    case $FW in
      ufw) ufw status | grep -Eq "^${p}(/tcp)?[[:space:]]+ALLOW" || missing+="$p " ;;
      firewalld) firewall-cmd --list-ports | tr ' ' '\n' | grep -qx "${p}/tcp" || missing+="$p " ;;
    esac
  done
  if [[ -n $missing ]]; then
    err "SSH 端口 $missing 未在防火墙放行, 为防止失联已中止"
    [[ $FW == ufw ]] && ufw --force disable >/dev/null 2>&1 || true
    return 1
  fi
  ok "防火墙 ($FW) 已启用, SSH 端口 [$ports] 已放行"
  note "防火墙: $FW 已启用, 放行 SSH [$ports] ${extra:+及 $extra}"

  info "安装并配置 fail2ban..."
  case $FAMILY in
    debian) pkg_install fail2ban python3-systemd || pkg_install fail2ban ;;
    rhel)   ensure_epel; pkg_install fail2ban; pkg_install fail2ban-firewalld || true ;;
    *)      pkg_install fail2ban ;;
  esac
  fail2ban_configure
  note "fail2ban: 已启用 (sshd jail)"
}

# ------------------------- 步骤 7: SWAP -------------------------
step_swap() {
  if in_container; then warn "容器环境通常无法创建 swap, 已跳过"; return 0; fi
  local cur mem_mb def_mb size_in size_mb avail fstype
  cur=$(swapon --show=NAME,SIZE --noheadings 2>/dev/null) || cur=""
  if [[ -n $cur ]]; then
    info "已有 swap:"; echo "$cur"
    ask_yn "仍要新建/调整 /swapfile?" n || return 0
  fi
  mem_mb=$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo)
  if (( mem_mb <= 4096 )); then def_mb=2048; else def_mb=4096; fi
  [[ -n $OPT_SWAP_MB ]] && def_mb=$OPT_SWAP_MB
  size_in=$(ask_input "SWAP 大小 (如 2G / 2048M, 输入 0 跳过) 当前内存 ${mem_mb}MB" "${def_mb}M")
  size_mb=$(parse_size_mb "$size_in")
  (( size_mb > 0 )) || { info "已跳过"; return 0; }
  avail=$(df -Pm / | awk 'NR==2{print $4}')
  (( avail > size_mb + 1024 )) || { err "磁盘剩余空间不足 (可用 ${avail}MB)"; return 1; }

  if swapon --show=NAME --noheadings 2>/dev/null | grep -qx /swapfile; then run swapoff /swapfile; fi
  rm -f /swapfile
  fstype=$(stat -f -c %T / 2>/dev/null) || fstype=""
  mk_swap_dd() {
    : >/swapfile
    [[ $fstype == btrfs ]] && chattr +C /swapfile 2>/dev/null || true
    dd if=/dev/zero of=/swapfile bs=1M count="$size_mb" status=none
    chmod 600 /swapfile; mkswap /swapfile >/dev/null
  }
  info "正在创建 ${size_mb}MB swap..."
  if [[ $fstype != btrfs ]] && fallocate -l "${size_mb}M" /swapfile 2>/dev/null; then
    chmod 600 /swapfile; mkswap /swapfile >/dev/null
  else
    mk_swap_dd
  fi
  if ! swapon /swapfile 2>/dev/null; then
    warn "fallocate 方式失败, 改用 dd 重建..."
    swapoff /swapfile 2>/dev/null || true
    rm -f /swapfile
    mk_swap_dd
    swapon /swapfile
  fi
  backup_file /etc/fstab
  grep -qE '^/swapfile[[:space:]]' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  echo 'vm.swappiness = 10' >/etc/sysctl.d/99-server-init-swap.conf
  sysctl -q -p /etc/sysctl.d/99-server-init-swap.conf >/dev/null 2>&1 || true
  ok "SWAP 已启用: ${size_mb}MB (/swapfile)"
  note "SWAP: ${size_mb}MB, swappiness=10"
}

# ------------------------- 步骤 8: BBR -------------------------
step_bbr() {
  if in_container; then warn "容器环境无法修改内核网络参数, 已跳过"; return 0; fi
  local kver; kver=$(uname -r | cut -d. -f1,2)
  if [[ $(printf '%s\n' 4.9 "$kver" | sort -V | head -n1) != 4.9 ]]; then
    warn "内核 $kver 低于 4.9, 不支持 BBR, 请先升级内核"
    return 1
  fi
  modprobe tcp_bbr 2>/dev/null || true
  if ! grep -qw bbr /proc/sys/net/ipv4/tcp_available_congestion_control 2>/dev/null; then
    warn "当前内核未提供 BBR 模块"
    return 1
  fi
  echo tcp_bbr >/etc/modules-load.d/server-init-bbr.conf
  cat >/etc/sysctl.d/99-server-init-net.conf <<'EOF'
# 由 server-init.sh 生成
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_syncookies = 1
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
EOF
  sysctl -q -p /etc/sysctl.d/99-server-init-net.conf >/dev/null 2>&1 || true
  if [[ $(sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null) == bbr ]]; then
    ok "BBR 已启用 (qdisc=$(sysctl -n net.core.default_qdisc))"
    note "BBR: 已启用"
  else
    warn "BBR 设置未生效, 可能需要重启"
    return 1
  fi
}

# ------------------------- 步骤 9: 自动安全更新 + journald -------------------------
step_auto() {
  if ask_yn "启用自动安全更新 (不会自动重启)?" y; then
    case $FAMILY in
      debian)
        pkg_install unattended-upgrades
        cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
        run systemctl enable --now apt-daily.timer apt-daily-upgrade.timer || true
        ok "unattended-upgrades 已启用" ;;
      rhel)
        if [[ $PM == dnf ]]; then
          pkg_install dnf-automatic
          sed -i -E 's/^(apply_updates[[:space:]]*=).*/\1 yes/; s/^(upgrade_type[[:space:]]*=).*/\1 security/' /etc/dnf/automatic.conf
          run systemctl enable --now dnf-automatic.timer
          ok "dnf-automatic 已启用 (仅安全更新)"
        else
          warn "yum 环境请自行配置 yum-cron"
        fi ;;
      *) warn "$OS_NAME 暂不支持自动配置自动更新" ;;
    esac
    note "自动安全更新: 已启用"
  fi
  if ask_yn "限制 journald 日志大小, 防止磁盘被日志占满?" y; then
    local sz
    sz=$(ask_input "journald 最大占用 (如 200M)" 200M)
    [[ $sz =~ ^[0-9]+[KMG]$ ]] || sz=200M
    mkdir -p /etc/systemd/journald.conf.d
    printf '[Journal]\nSystemMaxUse=%s\n' "$sz" >/etc/systemd/journald.conf.d/90-server-init.conf
    run systemctl restart systemd-journald || true
    ok "journald 上限: $sz"
    note "journald: 上限 $sz"
  fi
}

# ------------------------- 步骤 10: Nginx -------------------------
step_nginx() {
  if ! command -v nginx >/dev/null 2>&1; then
    if [[ $FAMILY == rhel && $PM == yum ]]; then ensure_epel; fi
    pkg_install nginx
  else
    info "Nginx 已安装: $(nginx -v 2>&1)"
  fi
  run systemctl enable --now nginx
  ok "Nginx 已启动"
  fw_open_web
  state_set NGINX yes
  note "Nginx: 已安装并启动"
}

# ------------------------- 步骤 11: Docker -------------------------
docker_install_apt() {
  local base=$1 id=$OS_ID code=$OS_CODENAME
  case $OS_ID in
    debian|ubuntu) ;;
    *) return 1 ;;
  esac
  pkg_install ca-certificates curl gnupg || return 1
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL --connect-timeout 10 --max-time 60 "$base/linux/$id/gpg" -o /etc/apt/keyrings/docker.asc || return 1
  chmod a+r /etc/apt/keyrings/docker.asc
  [[ -n $code ]] || code=$(lsb_release -cs 2>/dev/null) || return 1
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] $base/linux/$id $code stable" \
    >/etc/apt/sources.list.d/docker.list
  rm -f "$WORK/apt_updated"
  pkg_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || return 1
}

docker_install_rpm() {
  local base=$1 repo=centos
  [[ $OS_ID == fedora ]] && repo=fedora
  [[ $OS_ID == rhel ]] && repo=rhel
  if [[ $PM == dnf ]]; then pkg_install dnf-plugins-core || true; else pkg_install yum-utils || true; fi
  curl -fsSL --connect-timeout 10 --max-time 60 "$base/linux/$repo/docker-ce.repo" -o /etc/yum.repos.d/docker-ce.repo || return 1
  pkg_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || return 1
}

step_docker() {
  if command -v docker >/dev/null 2>&1; then
    info "已安装: $(docker --version)"
    ask_yn "仍要继续安装/配置?" n || return 0
  fi
  local region base ok_flag=0 f
  region=$(get_region)
  if [[ $region == cn ]]; then base="https://mirrors.aliyun.com/docker-ce"; else base="https://download.docker.com"; fi
  info "使用 Docker 仓库: $base"
  case $FAMILY in
    debian) if docker_install_apt "$base"; then ok_flag=1; fi ;;
    rhel)   if docker_install_rpm "$base"; then ok_flag=1; fi ;;
  esac
  if (( ! ok_flag )); then
    warn "仓库方式安装失败, 改用 get.docker.com 官方脚本"
    f="$WORK/get-docker.sh"
    curl -fsSL --connect-timeout 10 --max-time 60 https://get.docker.com -o "$f" || { err "下载 get.docker.com 失败"; return 1; }
    if [[ $region == cn ]]; then run_v sh "$f" --mirror Aliyun; else run_v sh "$f"; fi
  fi
  run systemctl enable --now docker

  if [[ ! -f /etc/docker/daemon.json ]]; then
    local mirror=""
    if (( ! NONINTERACTIVE )); then
      mirror=$(ask_input "镜像加速地址 (如 https://xxx.example.com, 留空跳过)" "")
    fi
    mkdir -p /etc/docker
    if [[ -n $mirror ]]; then
      printf '{\n  "log-driver": "json-file",\n  "log-opts": {"max-size": "50m", "max-file": "3"},\n  "registry-mirrors": ["%s"]\n}\n' "$mirror" >/etc/docker/daemon.json
    else
      printf '{\n  "log-driver": "json-file",\n  "log-opts": {"max-size": "50m", "max-file": "3"}\n}\n' >/etc/docker/daemon.json
    fi
    run systemctl restart docker
  else
    warn "/etc/docker/daemon.json 已存在, 未改动 (建议自行加上日志轮转 log-opts)"
  fi
  ok "Docker 已安装: $(docker --version)"
  warn "Docker 发布的端口 (-p) 会绕过 UFW/firewalld 规则, 请只发布必要端口或绑定到 127.0.0.1"
  state_set DOCKER yes
  note "Docker: 已安装 (注意: 发布端口会绕过防火墙)"
}

# ------------------------- 步骤 12: Tailscale -------------------------
step_tailscale() {
  local f="$WORK/tailscale-install.sh" key exitnode=0
  if ! command -v tailscale >/dev/null 2>&1; then
    info "下载 Tailscale 官方安装脚本..."
    curl -fsSL --connect-timeout 10 --max-time 60 https://tailscale.com/install.sh -o "$f" \
      || { err "下载失败 (可能是网络原因), 可稍后重试"; return 1; }
    info "安装脚本 sha256: $(sha256sum "$f" | awk '{print $1}')"
    run_v sh "$f"
  else
    info "Tailscale 已安装: $(tailscale version 2>/dev/null | head -n1)"
  fi
  run systemctl enable --now tailscaled

  if ask_yn "是否现在登录/加入 tailnet?" y; then
    key=$(ask_input "Auth Key (留空则生成登录链接, 需浏览器打开)" "")
    if ask_yn "是否作为出口节点 (exit node)?" n; then exitnode=1; fi
    local args=()
    (( exitnode )) && args+=(--advertise-exit-node)
    if (( exitnode )); then
      printf 'net.ipv4.ip_forward = 1\nnet.ipv6.conf.all.forwarding = 1\n' >/etc/sysctl.d/99-server-init-tailscale.conf
      sysctl -q -p /etc/sysctl.d/99-server-init-tailscale.conf >/dev/null 2>&1 || true
    fi
    if [[ -n $key ]]; then
      tailscale up --authkey="$key" "${args[@]}" || warn "tailscale up 失败"
    else
      timeout 300 tailscale up "${args[@]}" <&3 || warn "tailscale up 未完成, 稍后可手动执行: tailscale up"
    fi
  fi
  if fw_available && fw_active && ask_yn "是否信任 tailscale0 网卡 (允许 tailnet 内设备访问本机所有端口)?" y; then
    fw_allow_iface tailscale0
    fw_reload
  fi
  ok "Tailscale 步骤完成"
  note "Tailscale: 已安装"
}

# ------------------------- 步骤 13: Tinyproxy -------------------------
step_tinyproxy() {
  local conf=/etc/tinyproxy/tinyproxy.conf port allow def_allow user="" pass="" auth src a ip svc
  [[ $FAMILY == rhel ]] && ensure_epel
  pkg_installed tinyproxy || pkg_install tinyproxy
  [[ -f $conf ]] || { err "未找到 $conf"; return 1; }

  port=$(ask_input "监听端口" 8888)
  valid_port "$port" || { err "端口不合法"; return 1; }
  def_allow=127.0.0.1
  [[ -n ${SSH_CLIENT:-} ]] && def_allow=${SSH_CLIENT%% *}
  allow=$(ask_input "允许使用代理的来源 IP/网段 (空格分隔; 填 0.0.0.0/0 表示所有人)" "$def_allow")
  for a in $allow; do
    [[ $a == "0.0.0.0/0" ]] || valid_addr "$a" || { err "无效地址: $a"; return 1; }
  done
  auth=n
  if [[ " $allow " == *" 0.0.0.0/0 "* ]]; then
    warn "你选择了对所有人开放, 必须启用账号密码认证, 否则会被当作开放代理滥用"
    auth=y
  elif ask_yn "是否启用账号密码认证 (BasicAuth)?" y; then
    auth=y
  fi
  if [[ $auth == y ]]; then
    user=proxy; pass=$(gen_password)
  fi

  backup_file "$conf"
  sed -i '/^# BEGIN server-init$/,/^# END server-init$/d' "$conf"
  sed -i -E '/^(Port|Listen|Allow|BasicAuth)[[:space:]]/d' "$conf"
  {
    echo "# BEGIN server-init"
    echo "Port $port"
    for a in $allow; do echo "Allow $a"; done
    [[ -n $user ]] && echo "BasicAuth $user $pass"
    echo "# END server-init"
  } >>"$conf"
  if [[ -n $user ]]; then
    chmod 640 "$conf"
    getent group tinyproxy >/dev/null 2>&1 && chgrp tinyproxy "$conf" || true
  fi
  svc=tinyproxy
  run systemctl enable "$svc" || true
  run systemctl restart "$svc" || { err "tinyproxy 启动失败, 查看: journalctl -u tinyproxy"; return 1; }

  if fw_available && fw_active; then
    for src in $allow; do fw_allow_from "$src" "$port" tcp; done
    fw_reload
  else
    warn "防火墙未启用, 代理端口 $port 目前对外可达 (仅靠 Allow 白名单保护)"
  fi
  ip=$(server_ip)
  ok "Tinyproxy 已启动: 端口 $port, 允许来源: $allow"
  if [[ -n $user ]]; then
    printf '\n  代理地址: http://%s:%s@%s:%s\n\n' "$user" "$pass" "$ip" "$port"
    cred_save "Tinyproxy: http://$user:$pass@$ip:$port"
  fi
  note "Tinyproxy: 端口 $port, 允许 $allow${user:+, 认证用户 $user (密码见 $BACKUP_DIR/credentials.txt)}"
}

# ------------------------- 步骤 14: Cloudflare 回源限制 -------------------------
CF_BUILTIN_IPS='173.245.48.0/20
103.21.244.0/22
103.22.200.0/22
103.31.4.0/22
141.101.64.0/18
108.162.192.0/18
190.93.240.0/20
188.114.96.0/20
197.234.240.0/22
198.41.128.0/17
162.158.0.0/15
104.16.0.0/13
104.24.0.0/14
172.64.0.0/13
131.0.72.0/22
2400:cb00::/32
2606:4700::/32
2803:f800::/32
2405:b500::/32
2405:8100::/32
2a06:98c0::/29
2c0f:f248::/32'

write_cf_updater() {
  cat >/usr/local/sbin/cf-fw-update <<'UPDATER'
#!/usr/bin/env bash
# cf-fw-update: 同步 Cloudflare IP 段到防火墙 (由 server-init.sh 生成, 请勿手动修改)
set -u
FW="__FW__"
PORTS="80 443"
DIR=/etc/server-init
LIST=$DIR/cf-ips.txt
BUILTIN=$DIR/cf-ips-builtin.txt
TAG="cf-origin"
LOG=/var/log/server-init.log
FORCE=0; [[ ${1:-} == "--force" ]] && FORCE=1
log() { printf '[%s] cf-fw-update: %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }

exec 9>/var/lock/cf-fw-update.lock
flock -n 9 || exit 0
NEW=$(mktemp); trap 'rm -f "$NEW"' EXIT

fetch() { curl -fsSL --connect-timeout 10 --max-time 30 "https://www.cloudflare.com/$1" 2>/dev/null | tr -d '\r' | grep -E '^[0-9a-fA-F:.]+/[0-9]{1,3}$'; }
{ fetch ips-v4; fetch ips-v6; } | tr 'A-F' 'a-f' | sort -u >"$NEW"
n4=$(grep -c '\.' "$NEW"); n6=$(grep -c ':' "$NEW")
if (( n4 < 5 || n6 < 3 )); then
  if [[ -s $LIST ]]; then log "获取 Cloudflare IP 列表失败, 保持现有规则"; exit 0; fi
  log "获取 Cloudflare IP 列表失败, 使用内置列表"
  sort -u "$BUILTIN" >"$NEW"
fi
if (( ! FORCE )) && [[ -s $LIST ]] && cmp -s "$NEW" "$LIST"; then exit 0; fi

ufw_apply() {
  local c p
  while read -r c; do
    for p in $PORTS; do
      ufw allow proto tcp from "$c" to any port "$p" comment "$TAG" >/dev/null 2>&1 || true
    done
  done <"$NEW"
  # 先加后删: 删除不在新列表中的旧规则 (按编号从大到小删)
  ufw status numbered | sed -nE "s/^\[ *([0-9]+)\] .*ALLOW IN +([^ ]+) +# ${TAG}.*/\1 \2/p" | sort -rn | \
  while read -r n src; do
    grep -qxF "$src" "$NEW" || ufw --force delete "$n" >/dev/null 2>&1
  done
}

fwd_apply() {
  local fam ipset opt e p rule want
  for fam in 4 6; do
    ipset="cf$fam"; opt=""
    [[ $fam == 6 ]] && opt="--option=family=inet6"
    if ! firewall-cmd --permanent --get-ipsets | tr ' ' '\n' | grep -qx "$ipset"; then
      firewall-cmd --permanent --new-ipset="$ipset" --type=hash:net $opt >/dev/null
    fi
    if [[ $fam == 4 ]]; then want=$(grep '\.' "$NEW"); else want=$(grep ':' "$NEW"); fi
    for e in $(firewall-cmd --permanent --ipset="$ipset" --get-entries); do
      grep -qxF "$e" <<<"$want" || firewall-cmd --permanent --ipset="$ipset" --remove-entry="$e" >/dev/null
    done
    for e in $want; do
      firewall-cmd --permanent --ipset="$ipset" --add-entry="$e" >/dev/null 2>&1 || true
    done
    for p in $PORTS; do
      rule="rule family=\"ipv$fam\" source ipset=\"$ipset\" port port=\"$p\" protocol=\"tcp\" accept"
      firewall-cmd --permanent --query-rich-rule="$rule" >/dev/null 2>&1 || firewall-cmd --permanent --add-rich-rule="$rule" >/dev/null
    done
  done
  firewall-cmd --reload >/dev/null
}

case $FW in
  ufw) ufw_apply ;;
  firewalld) fwd_apply ;;
esac

if [[ -f $DIR/cf-realip ]] && command -v nginx >/dev/null 2>&1; then
  RIP=/etc/nginx/conf.d/cloudflare-realip.conf
  {
    echo "# 由 cf-fw-update 生成"
    while read -r c; do echo "set_real_ip_from $c;"; done <"$NEW"
    echo "real_ip_header CF-Connecting-IP;"
    echo "real_ip_recursive on;"
  } >"$RIP"
  if nginx -t >/dev/null 2>&1; then systemctl reload nginx >/dev/null 2>&1 || true
  else rm -f "$RIP"; log "nginx 配置校验失败, 已移除 real_ip 配置"; fi
fi

cp "$NEW" "$LIST"
log "已同步 $(wc -l <"$LIST") 条 Cloudflare IP 段到防火墙 ($FW)"
UPDATER
  sed -i "s/__FW__/$FW/" /usr/local/sbin/cf-fw-update
  chmod 755 /usr/local/sbin/cf-fw-update
}

step_cf() {
  fw_ensure_installed
  fw_active || { err "防火墙尚未启用, 请先执行第 6 项"; return 1; }
  warn "启用后 80/443 只接受 Cloudflare 的 IP:"
  warn "  - 域名必须开启橙云(代理); 灰云或直接用 IP 访问将打不开"
  warn "  - 申请证书建议用 DNS 验证, 或确保域名走橙云"
  ask_yn "继续?" y || return 0

  mkdir -p "$STATE_DIR"
  printf '%s\n' "$CF_BUILTIN_IPS" >"$STATE_DIR/cf-ips-builtin.txt"
  write_cf_updater
  if command -v nginx >/dev/null 2>&1 && ask_yn "同时配置 Nginx real_ip, 让日志记录真实访客 IP?" y; then
    : >"$STATE_DIR/cf-realip"
  else
    rm -f "$STATE_DIR/cf-realip"
  fi

  info "正在同步 Cloudflare IP 段到防火墙..."
  /usr/local/sbin/cf-fw-update --force || { err "同步失败, 未改动现有 80/443 规则"; return 1; }

  local cnt=0
  case $FW in
    ufw) cnt=$(ufw status | grep -c 'cf-origin') || true ;;
    firewalld) cnt=$(firewall-cmd --permanent --ipset=cf4 --get-entries | wc -w) || true ;;
  esac
  (( cnt > 0 )) || { err "未检测到 Cloudflare 规则, 保留原有 80/443 规则不动"; return 1; }

  # CF 规则生效后, 才移除放行全网的 80/443
  fw_delete_port 80 tcp || true
  fw_delete_port 443 tcp || true
  if [[ $FW == ufw ]]; then
    ufw --force delete allow 'Nginx Full' >/dev/null 2>&1 || true
    ufw --force delete allow 'Nginx HTTP' >/dev/null 2>&1 || true
    ufw --force delete allow 'Nginx HTTPS' >/dev/null 2>&1 || true
  else
    firewall-cmd --permanent --remove-service=http >/dev/null 2>&1 || true
    firewall-cmd --permanent --remove-service=https >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
  fi

  if [[ -d /run/systemd/system ]]; then
    cat >/etc/systemd/system/cf-fw-update.service <<'EOF'
[Unit]
Description=Sync Cloudflare IP ranges to firewall
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/cf-fw-update
EOF
    cat >/etc/systemd/system/cf-fw-update.timer <<'EOF'
[Unit]
Description=Weekly Cloudflare IP sync

[Timer]
OnCalendar=weekly
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF
    run systemctl daemon-reload
    run systemctl enable --now cf-fw-update.timer
  else
    echo '17 4 * * 1 root /usr/local/sbin/cf-fw-update' >/etc/cron.d/cf-fw-update
  fi
  state_set CF_ENABLED yes
  ok "80/443 已限制为仅 Cloudflare 可访问, 每周自动更新 IP 段"
  [[ $(state_get DOCKER) == yes ]] && warn "已安装 Docker: 容器发布的 80/443 会绕过此限制, 请改为只让 Nginx 对外监听"
  note "Cloudflare 回源限制: 已启用 (cf-fw-update 每周更新)"
}

# ------------------------- 步骤 15/16: 第三方测试脚本 -------------------------
run_remote_script() { # 名称 URL
  local name=$1 url=$2 f="$WORK/remote-$name.sh" choice
  if (( NONINTERACTIVE )); then
    warn "非交互模式下不执行第三方脚本 ($name), 已跳过"
    return 0
  fi
  info "下载 $name: $url"
  if ! curl -fsSL --connect-timeout 10 --max-time 60 "$url" -o "$f" || [[ ! -s $f ]]; then
    warn "下载失败, 可能是网络原因, 请稍后重试或跳过"
    return 0
  fi
  head -n1 "$f" | grep -q '^#!' || warn "文件第一行不是脚本声明, 请务必先查看内容"
  printf '  来源: %s\n  大小: %s 字节\n  sha256: %s\n' "$url" "$(wc -c <"$f")" "$(sha256sum "$f" | awk '{print $1}')"
  warn "这是第三方脚本, 将以 root 权限运行。BBR 会影响 TCP 测试结果, 建议在第 8 项之后运行。"
  echo "  1) 运行  2) 先查看内容  3) 取消"
  choice=$(ask_input "请选择" 3)
  if [[ $choice == 2 ]]; then
    if command -v less >/dev/null 2>&1; then less "$f" <&3 >&2; else sed -n '1,200p' "$f"; fi
    choice=$(ask_input "查看完毕, 是否运行? 1) 运行  3) 取消" 3)
  fi
  [[ $choice == 1 ]] || { info "已取消"; return 0; }
  bash "$f" <&3 || warn "$name 退出码非 0"
}

step_nodequality() { run_remote_script NodeQuality "https://run.NodeQuality.com"; }
step_tcpquality()  { run_remote_script TcpQuality "https://raw.githubusercontent.com/ibsgss/TcpQuality/main/runTcpQuality.sh"; }

# ------------------------- 步骤 17: 收尾(禁用 root / 密码 / 旧端口) -------------------------
step_finalize() {
  local do_pw=0 root_mode="" remove_old=0 mykey="" sudoer="" ports primary p choice
  warn "本步骤会收紧 SSH 登录方式。执行前请务必:"
  warn "  1) 另开一个终端, 用【新用户 / 密钥 / 新端口】实际登录成功一次"
  warn "  2) 确认云厂商安全组已放行新端口"
  if (( NONINTERACTIVE )); then
    (( OPT_DISABLE_PASSWORD || OPT_DISABLE_ROOT )) || { warn "非交互模式需要 --disable-password / --disable-root 才会执行本步骤"; return 0; }
    warn "已通过命令行参数视为你确认过登录测试"
  else
    ask_word "我已用新方式成功登录" yes || { info "已取消, 未做任何改动"; return 0; }
  fi

  local have_any_key=0
  { [[ -s /root/.ssh/authorized_keys ]] || sudoer_with_key >/dev/null; } && have_any_key=1
  sudoer=$(sudoer_with_key) || sudoer=""

  # 禁用密码登录
  if (( have_any_key )); then
    if (( NONINTERACTIVE )); then do_pw=$OPT_DISABLE_PASSWORD
    elif ask_yn "禁用密码登录 (仅允许密钥)?" y; then do_pw=1; fi
  else
    warn "未发现任何 authorized_keys, 不允许禁用密码登录 (否则会被锁在门外)"
  fi

  # root 登录
  if (( NONINTERACTIVE )); then
    if (( OPT_DISABLE_ROOT )); then root_mode=no; fi
  else
    echo "  root 登录方式: 1) 保持不变  2) 仅允许密钥 (prohibit-password)  3) 完全禁止"
    choice=$(ask_input "请选择" "$([[ -n $sudoer ]] && echo 3 || echo 1)")
    case $choice in 2) root_mode=prohibit-password ;; 3) root_mode=no ;; esac
  fi
  if [[ $root_mode == prohibit-password && ! -s /root/.ssh/authorized_keys ]]; then
    warn "root 没有配置密钥, 不能设置为仅密钥登录"; root_mode=""
  fi
  if [[ $root_mode == no && -z $sudoer ]]; then
    warn "没有找到配置了密钥的 sudo 用户, 拒绝完全禁止 root 登录"; root_mode=""
  fi

  # 旧端口
  ports=$(state_get SSH_PORTS); primary=$(state_get SSH_PRIMARY)
  if [[ $(wc -w <<<"$ports") -gt 1 && -n $primary ]]; then
    if port_in_use "$primary"; then
      if ask_yn "关闭旧 SSH 端口, 只保留 $primary ?" y; then remove_old=1; fi
    else
      warn "主端口 $primary 当前未监听, 不关闭旧端口"
    fi
  fi

  if (( ! do_pw )) && [[ -z $root_mode ]] && (( ! remove_old )); then
    info "没有需要执行的改动"; return 0
  fi

  local old_pw old_root old_ports
  old_pw=$(state_get SSH_PASSWORD); old_root=$(state_get SSH_ROOT); old_ports=$ports
  ssh_snapshot
  (( do_pw )) && state_set SSH_PASSWORD no
  [[ -n $root_mode ]] && state_set SSH_ROOT "$root_mode"
  if (( remove_old )); then
    state_set SSH_PORTS "$primary"
    local f
    for f in /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf; do
      [[ -f $f && $f != "$SSH_DROPIN" ]] || continue
      backup_file "$f"
      sed -i -E "/^$SSH_MARK_BEGIN\$/,/^$SSH_MARK_END\$/!s/^([[:space:]]*Port[[:space:]]+.*)\$/# server-init disabled: \1/I" "$f"
    done
  fi
  ssh_write_conf
  if ! ssh_validate; then
    ssh_rollback
    state_set SSH_PORTS "$old_ports"; state_set SSH_PASSWORD "$old_pw"; state_set SSH_ROOT "$old_root"
    err "sshd 配置校验失败, 已回滚"; return 1
  fi
  ssh_restart || { ssh_rollback; return 1; }
  p=${primary:-$(ssh_config_ports | head -n1)}
  if ! ssh_wait_listen "$p"; then
    ssh_rollback
    state_set SSH_PORTS "$old_ports"; state_set SSH_PASSWORD "$old_pw"; state_set SSH_ROOT "$old_root"
    err "sshd 未在端口 $p 监听, 已回滚"; return 1
  fi

  if (( remove_old )) && fw_available; then
    for p in $old_ports; do
      [[ $p == "$primary" ]] && continue
      fw_delete_ssh_old_port "$p"
    done
    fw_reload
  fi
  fail2ban_configure
  ok "SSH 收尾完成"
  (( do_pw )) && note "SSH: 已禁用密码登录"
  [[ -n $root_mode ]] && note "SSH: PermitRootLogin = $root_mode"
  (( remove_old )) && note "SSH: 已关闭旧端口, 仅保留 $primary"
  warn "请再另开一个窗口确认仍能正常登录, 确认前不要关闭当前会话"
}

# ------------------------- 步骤注册与菜单 -------------------------
STEP_TITLE=(); STEP_FN=()
reg() { STEP_TITLE[$1]=$2; STEP_FN[$1]=$3; }
reg 1  "配置软件源 (国内镜像, 可还原)"            step_mirror
reg 2  "更新软件包 / 升级内核"                    step_update
reg 3  "设置时区 + 时间同步"                      step_time
reg 4  "校正 DNS"                                 step_dns
reg 5  "创建用户 + SSH 密钥 / 端口"               step_ssh
reg 6  "防火墙 (UFW/firewalld) + fail2ban"        step_firewall
reg 7  "配置 SWAP"                                step_swap
reg 8  "开启 BBR + 网络参数"                      step_bbr
reg 9  "自动安全更新 + journald 限制"             step_auto
reg 10 "Nginx"                                    step_nginx
reg 11 "Docker"                                   step_docker
reg 12 "Tailscale"                                step_tailscale
reg 13 "Tinyproxy (带白名单/认证)"                step_tinyproxy
reg 14 "80/443 仅放行 Cloudflare IP (自动更新)"   step_cf
reg 15 "NodeQuality 综合测试 (第三方, 先确认)"    step_nodequality
reg 16 "TcpQuality TCP 质量测试 (第三方, 先确认)" step_tcpquality
reg 17 "收尾: 禁用 root/密码登录, 关闭旧 SSH 端口" step_finalize
reg 18 "还原软件源为官方源"                       step_restore_mirror

print_group() {
  local title=$1 id mark; shift
  printf '\n%s%s%s\n' "$C_BLD" "$title" "$C_RST"
  for id in "$@"; do
    mark=" "
    [[ " ${RECOMMENDED[*]} " == *" $id "* ]] && mark="*"
    printf '  %s%2d) %s\n' "$mark" "$id" "${STEP_TITLE[$id]}"
  done
}

show_menu() {
  printf '\n%s==== 服务器初始化 v%s ====%s\n' "$C_GRN" "$SCRIPT_VERSION" "$C_RST"
  printf '系统: %s | 包管理: %s | 防火墙: %s | 地区: %s\n' "$OS_NAME" "$PM" "$FW" "$(get_region)"
  print_group "【系统基础】" 1 2 3 4 7 8 9
  print_group "【账号与安全】" 5 6 17
  print_group "【常用软件】" 10 11 12 13 14
  print_group "【测试 / 其他】" 15 16 18
  printf '\n  * = 推荐项 (输入 a 一次选中)。可输入多个编号, 如: 1 2 5 6   或范围 1-3\n'
  printf '  禁用 root / 密码登录在第 17 项, 请在测试新登录方式成功后再执行\n\n'
}

parse_sel() {
  local s=${1//,/ } tok a b i id
  local -a out=()
  for tok in $s; do
    if [[ $tok =~ ^[aA]$ || ${tok,,} == all ]]; then
      out+=("${RECOMMENDED[@]}")
    elif [[ $tok =~ ^[qQ]$ ]]; then
      info "已退出"; exit 0
    elif [[ $tok =~ ^([0-9]+)-([0-9]+)$ ]]; then
      a=${BASH_REMATCH[1]}; b=${BASH_REMATCH[2]}
      for ((i=a; i<=b; i++)); do out+=("$i"); done
    elif [[ $tok =~ ^[0-9]+$ ]]; then
      out+=("$tok")
    else
      warn "忽略无效输入: $tok"
    fi
  done
  SELECTED=()
  [[ ${#out[@]} -gt 0 ]] || return 0
  for id in $(printf '%s\n' "${out[@]}" | sort -un); do
    if [[ -n ${STEP_FN[$id]:-} ]]; then SELECTED+=("$id"); else warn "没有编号 $id"; fi
  done
}

RESULT_OK=(); RESULT_FAIL=()

run_step() {
  local id=$1 fn rc
  fn=${STEP_FN[$id]}
  printf '\n%s===== [%s] %s =====%s\n' "$C_GRN" "$id" "${STEP_TITLE[$id]}" "$C_RST"
  _log "STEP $id start"
  set +e
  ( set -Ee; "$fn" )
  rc=$?
  set -e
  if (( rc == 0 )); then
    RESULT_OK+=("$id"); _log "STEP $id ok"
  else
    RESULT_FAIL+=("$id"); err "步骤 $id (${STEP_TITLE[$id]}) 执行失败 (详见 $LOG_FILE)"
  fi
}

finish() {
  local id
  printf '\n%s================ 执行结果 ================%s\n' "$C_GRN" "$C_RST"
  for id in ${RESULT_OK[@]+"${RESULT_OK[@]}"};   do printf '  %s✔%s %s\n' "$C_GRN" "$C_RST" "${STEP_TITLE[$id]}"; done
  for id in ${RESULT_FAIL[@]+"${RESULT_FAIL[@]}"}; do printf '  %s✘%s %s\n' "$C_RED" "$C_RST" "${STEP_TITLE[$id]}"; done
  if [[ -s $WORK/summary ]]; then
    printf '\n%s记录:%s\n' "$C_BLD" "$C_RST"
    sed 's/^/  - /' "$WORK/summary"
  fi
  [[ -f $STATE_FILE && -n $(state_get SSH_PORTS) ]] && printf '\n当前 SSH 端口: %s\n' "$(state_get SSH_PORTS)"
  printf '\n日志: %s\n备份: %s\n' "$LOG_FILE" "$BACKUP_DIR"
  [[ -f $BACKUP_DIR/credentials.txt ]] && warn "凭据已保存在 $BACKUP_DIR/credentials.txt, 取回后请删除"
  if [[ -f $WORK/reboot ]]; then
    warn "系统需要重启才能完全生效"
    if (( ! NONINTERACTIVE )) && ask_yn "现在重启?" n; then
      info "正在重启..."; systemctl reboot || reboot
    fi
  fi
}

# ------------------------- 参数 / 入口 -------------------------
usage() {
  cat <<EOF
server-init.sh v$SCRIPT_VERSION  Linux 服务器初始化 / 安全加固

用法: server-init.sh [选项]
  无参数                进入交互菜单
  -y, --yes             非交互: 所有提问使用默认值 (配合 --all / --steps)
  --all                 执行全部推荐项 (${RECOMMENDED[*]})
  --steps 1,2,5-7       只执行指定编号
  --user NAME           创建的普通用户名
  --pubkey "KEY"        使用指定公钥 (不指定则自动生成)
  --ssh-port N          新 SSH 端口 (旧端口保留, 用第 17 项收尾)
  --tz ZONE             时区, 如 Asia/Shanghai
  --swap-mb N           SWAP 大小 (MB)
  --mirror auto|cn|off  软件源策略
  --region cn|intl      手动指定地区 (跳过自动检测)
  --disable-password    (第 17 项) 禁用密码登录, 视为你已测试过密钥登录
  --disable-root        (第 17 项) 完全禁止 root 登录, 视为你已测试过新用户登录
  -h, --help            显示本帮助

示例:
  curl -fsSL https://你的域名/server-init.sh | bash
  curl -fsSL https://你的域名/server-init.sh | bash -s -- -y --all --user deploy --ssh-port 22222
EOF
}

parse_args() {
  while (( $# )); do
    case $1 in
      -h|--help) usage; exit 0 ;;
      -v|--version) echo "$SCRIPT_VERSION"; exit 0 ;;
      -y|--yes) NONINTERACTIVE=1 ;;
      --all) RUN_ALL=1 ;;
      --disable-password) OPT_DISABLE_PASSWORD=1 ;;
      --disable-root) OPT_DISABLE_ROOT=1 ;;
      --steps|--user|--pubkey|--ssh-port|--tz|--swap-mb|--mirror|--region)
        [[ $# -ge 2 ]] || die "参数 $1 需要一个值"
        case $1 in
          --steps) STEPS_ARG=$2 ;;
          --user) OPT_USER=$2 ;;
          --pubkey) OPT_PUBKEY=$2 ;;
          --ssh-port) OPT_SSH_PORT=$2 ;;
          --tz) OPT_TZ=$2 ;;
          --swap-mb) OPT_SWAP_MB=$2 ;;
          --mirror) OPT_MIRROR=$2 ;;
          --region) OPT_REGION=$2 ;;
        esac
        shift ;;
      *) die "未知参数: $1 (使用 --help 查看用法)" ;;
    esac
    shift
  done
}

setup_tty() {
  if [[ -t 0 ]]; then
    exec 3<&0
  elif { : </dev/tty; } 2>/dev/null; then
    exec 3</dev/tty
  else
    NONINTERACTIVE=1
  fi
  # 防止子进程读取 stdin 时吞掉 "curl | bash" 的脚本内容
  exec 0</dev/null
}

preflight() {
  (( BASH_VERSINFO[0] >= 4 )) || die "需要 bash 4.0 或更高版本"
  [[ $EUID -eq 0 ]] || die "请使用 root 运行, 例如: curl -fsSL URL | sudo bash"
  export PATH="$PATH:/usr/local/sbin:/usr/sbin:/sbin"
  export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1
  umask 022
  mkdir -p "$(dirname "$LOG_FILE")"; touch "$LOG_FILE"; chmod 600 "$LOG_FILE"
  WORK=$(mktemp -d /tmp/server-init.XXXXXX)
  : >"$WORK/summary"
  if command -v flock >/dev/null 2>&1; then
    exec 9>/var/lock/server-init.lock
    flock -n 9 || die "已有另一个 server-init 实例在运行"
  fi
  [[ -d /run/systemd/system ]] || warn "未检测到 systemd, 部分功能可能无法使用"
}

cleanup() { [[ -n $WORK && -d $WORK ]] && rm -rf "$WORK"; return 0; }

ensure_basic_tools() {
  local need=()
  command -v curl >/dev/null 2>&1 || need+=(curl)
  command -v ss >/dev/null 2>&1 || need+=("$([[ $FAMILY == debian ]] && echo iproute2 || echo iproute)")
  command -v tar >/dev/null 2>&1 || need+=(tar)
  command -v flock >/dev/null 2>&1 || need+=(util-linux)
  if (( ${#need[@]} )); then
    info "安装基础工具: ${need[*]}"
    pkg_install "${need[@]}"
  fi
}

main() {
  parse_args "$@"
  preflight
  trap cleanup EXIT
  trap '_log "ERR rc=$? line=$LINENO cmd=$BASH_COMMAND"' ERR
  set -Eeuo pipefail
  setup_tty
  detect_os
  detect_fw
  _log "=== server-init v$SCRIPT_VERSION 启动: $OS_NAME, PM=$PM, FW=$FW ==="
  printf '%s服务器初始化脚本 v%s%s  (系统: %s)\n' "$C_GRN" "$SCRIPT_VERSION" "$C_RST" "$OS_NAME"
  ensure_basic_tools
  info "正在检测网络地区..."
  detect_region
  info "地区: $(get_region)"

  if (( NONINTERACTIVE )) && [[ -z $STEPS_ARG ]] && (( ! RUN_ALL )); then
    die "没有可用的交互终端, 请使用 --all 或 --steps 指定要执行的步骤 (见 --help)"
  fi

  local ans id
  while :; do
    SELECTED=()
    if [[ -n $STEPS_ARG ]]; then
      parse_sel "$STEPS_ARG"
    elif (( RUN_ALL )); then
      SELECTED=("${RECOMMENDED[@]}")
    else
      show_menu
      ans=$(ask_input "请输入要执行的编号 (a=推荐项, q=退出)" "a")
      parse_sel "$ans"
    fi
    if (( ${#SELECTED[@]} == 0 )); then
      warn "没有选中任何有效步骤"
    else
      printf '\n将依次执行:\n'
      for id in "${SELECTED[@]}"; do printf '  [%s] %s\n' "$id" "${STEP_TITLE[$id]}"; done
      if ask_yn "确认开始?" y; then
        for id in "${SELECTED[@]}"; do run_step "$id"; done
      fi
    fi
    # 命令行指定了步骤 / 非交互时只跑一轮
    if (( NONINTERACTIVE )) || [[ -n $STEPS_ARG ]] || (( RUN_ALL )); then break; fi
    ask_yn "还要继续执行其他项目吗?" n || break
  done
  finish
}

main "$@"
