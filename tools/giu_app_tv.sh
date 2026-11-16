#!/bin/bash
# Giu app Developer Mode tren TV LG webOS 3: neu TV QUEN app (sau khoi dong lai / rut dien) thi cai lai tu cac goi .ipk trong IPK_DIR.
# Nguyen nhan da do tren 49UH617T: sau khi khoi dong, TV mat DANG KY app dev (tep van con trong /media/developer/apps) -> `ares-install --list` rong.
# Cai lai bang ares-install la hien lai. Script CHI cai cac goi dang thieu, khong bao gio go app.
#
# Dung:   giu_app_tv.sh            # kiem va cai lai goi thieu
#         giu_app_tv.sh --kiem-tra # chi bao thieu gi, khong cai
# Cau hinh bang bien moi truong (hoac tep ./giu_app_tv.env canh script):
#   TV_HOST      dia chi TV (bat buoc)            vi du 192.168.1.50
#   TV_PORT      cong SSH cua Developer Mode      mac dinh 9922
#   DEVICE       ten thiet bi da them bang ares-setup-device / ares-novacom   mac dinh tv
#   ARES_BIN     thu muc chua ares-install        mac dinh: tim trong PATH
#   ARES_HOME    HOME chua .webos/tv/novacom-devices.json va khoa  (neu khong dung HOME cua ban)
#   IPK_DIR      thu muc chua cac goi .ipk (ten dang <id>_<phienban>_all.ipk)   mac dinh ./ipk canh script
#   LOG          tep nhat ky                      mac dinh ./giu_app_tv.log canh script (cat con ~200 dong)
set -u
D="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$D/giu_app_tv.env" ] && . "$D/giu_app_tv.env"
TV_HOST="${TV_HOST:?can TV_HOST}"; TV_PORT="${TV_PORT:-9922}"; DEVICE="${DEVICE:-tv}"
IPK_DIR="${IPK_DIR:-$D/ipk}"; LOG="${LOG:-$D/giu_app_tv.log}"
[ -n "${ARES_HOME:-}" ] && export HOME="$ARES_HOME"
[ -n "${ARES_BIN:-}" ] && export PATH="$ARES_BIN:$PATH"
DRY=0; [ "${1:-}" = "--kiem-tra" ] && DRY=1

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$LOG"; [ "$DRY" = 1 ] && echo "$*"; return 0; }
exec 9>"$D/.giu_app_tv.lock"; flock -n 9 || exit 0          # khong chay chong nhau

# TV tat/dang khoi dong: cong Developer Mode dong -> im lang bo qua (khong phai loi)
timeout 4 bash -c "exec 3<>/dev/tcp/$TV_HOST/$TV_PORT" 2>/dev/null || { [ "$DRY" = 1 ] && echo "TV chua san sang (khong mo duoc $TV_HOST:$TV_PORT)"; exit 0; }

ds="$(timeout 40 ares-install --device "$DEVICE" --list 2>&1)"; rc=$?
if [ $rc -ne 0 ]; then log "KHONG LIET KE DUOC app (ma $rc): $(printf '%s' "$ds" | tail -1 | cut -c1-160) -> bo qua, khong dam doan"; exit 0; fi
co="$(printf '%s\n' "$ds" | grep -E '^[A-Za-z0-9._-]+$' || true)"

thieu=0
for f in "$IPK_DIR"/*.ipk; do
  [ -e "$f" ] || continue
  b="$(basename "$f")"; id="${b%%_*}"
  if printf '%s\n' "$co" | grep -qxF "$id"; then continue; fi
  thieu=$((thieu + 1))
  if [ "$DRY" = 1 ]; then log "THIEU $id (se cai lai tu $b)"; continue; fi
  log "THIEU $id -> cai lai tu $b"
  out="$(timeout 120 ares-install --device "$DEVICE" "$f" 2>&1)"; r=$?
  if [ $r -eq 0 ] && printf '%s' "$out" | grep -q Success; then log "DA CAI LAI $id"; else log "CAI LAI THAT BAI $id (ma $r): $(printf '%s' "$out" | tail -2 | tr '\n' ' ' | cut -c1-200)"; fi
done
[ "$DRY" = 1 ] && [ "$thieu" = 0 ] && echo "Du app, khong thieu gi."
[ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 400 ] && tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit 0
