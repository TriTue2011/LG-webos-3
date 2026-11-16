#!/bin/bash
# Dong goi com.viet.livecam thanh .ipk (ar: debian-binary, control.tar.gz, data.tar.gz) giong ares-package. Dung: ./build_ipk.sh [phien ban] [full|popup]
#   popup = goi RIENG com.viet.livecam.popup (cai song song voi ban day man hinh): cua so goc 30% man hinh, nen trong suot (defaultWindowType=overlay, THU NGHIEM), phim mui ten doi co/goc.
set -euo pipefail
cd "$(dirname "$0")"
V="${1:-1.1.0}"; VARIANT="${2:-full}"; ID=com.viet.livecam; [ "$VARIANT" = popup ] && ID=com.viet.livecam.popup
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
A="$W/data/usr/palm/applications/$ID"; P="$W/data/usr/palm/packages/$ID"
mkdir -p "$A/js" "$A/css" "$A/lib" "$P" "$W/control"
cp src/index.html src/icon.png src/largeIcon.png "$A/"
cp src/js/*.js "$A/js/"; cp src/css/style.css "$A/css/"; cp src/lib/hls.min.js "$A/lib/"
python3 - "$V" "$A/appinfo.json" "$VARIANT" "$ID" "$A/js/config.js" <<'PY'
import json, sys
d = json.load(open("src/appinfo.json")); d["version"] = sys.argv[1]
if sys.argv[3] == "popup":
    d["id"] = sys.argv[4]; d["title"] = "Live Cam (góc)"
    d["defaultWindowType"] = "overlay"          # THỬ NGHIỆM (webosbrew, không có trong tài liệu LG): vẽ ĐÈ lên nội dung đang chạy, nền trong suốt
    d["transparent"] = True
    open(sys.argv[5], "w").write('window.LIVECAM_DEFAULTS = { corner: "br", size: 30, overlay: true };\n')
json.dump(d, open(sys.argv[2], "w"), separators=(",", ":"), ensure_ascii=False)
PY
printf '{\n  "id": "%s",\n  "version": "%s",\n  "app": "%s"\n}\n' "$ID" "$V" "$ID" > "$P/packageinfo.json"
SIZE=$(find "$W/data" -type f -printf '%s\n' | awk '{s+=$1} END{print s}')
cat > "$W/control/control" <<CTL
Package: $ID
Version: $V
Section: misc
Priority: optional
Architecture: all
Installed-Size: $SIZE
Maintainer: N/A <nobody@example.com>
Description: This is a webOS application.
webOS-Package-Format-Version: 2
webOS-Packager-Version: x.y.x
CTL
find "$W" -type d -exec chmod 755 {} +; find "$W" -type f -exec chmod 644 {} +
tar --owner=0 --group=0 --numeric-owner --sort=name -czf "$W/control.tar.gz" -C "$W/control" .
tar --owner=0 --group=0 --numeric-owner --sort=name -czf "$W/data.tar.gz" -C "$W/data" usr
printf '2.0\n' > "$W/debian-binary"
OUT="$ID"_"$V"_all.ipk; rm -f "$OUT"
(cd "$W" && ar rcD "$OLDPWD/$OUT" debian-binary control.tar.gz data.tar.gz)
echo "$OUT $(stat -c %s "$OUT") byte"
