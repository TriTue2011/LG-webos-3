#!/bin/bash
# Dong goi Live Cam thanh .ipk bang ares-package (ares-install CHI nhan goi do ares-package tao: goi dong tay bang `ar` bi tu choi).
# Dung: ./build_ipk.sh [phien_ban] [full|popup]
#   full  (mac dinh) = com.viet.livecam, day man hinh
#   popup            = com.viet.livecam.popup (cai song song): cua so goc 30% man hinh, nen trong suot
#                      (defaultWindowType=overlay, THU NGHIEM: meo khong co trong tai lieu LG, TV co the tu choi), phim mui ten doi co/goc.
# Can: ARES_BIN (thu muc chua ares-package) va, neu ares nam trong HOME rieng, ARES_HOME.
set -e
V="${1:-1.3.0}"; VARIANT="${2:-full}"
D="$(cd "$(dirname "$0")" && pwd)"; B="$(mktemp -d)"; trap 'rm -rf "$B"' EXIT
cp -r "$D/src" "$B/app"
python3 - "$V" "$VARIANT" "$B/app" <<'PY'
import json, sys
v, variant, app = sys.argv[1:4]
p = app + "/appinfo.json"; d = json.load(open(p)); d["version"] = v
if variant == "popup":
    d["id"] = "com.viet.livecam.popup"; d["title"] = "Live Cam (góc)"
    d["defaultWindowType"] = "overlay"; d["transparent"] = True
    open(app + "/js/config.js", "w").write('window.LIVECAM_DEFAULTS = { corner: "br", size: 30, overlay: true };\n')
json.dump(d, open(p, "w"), separators=(",", ":"), ensure_ascii=False)
PY
cd "$B" && HOME="${ARES_HOME:-$HOME}" "${ARES_BIN:?can ARES_BIN}/ares-package" app -o "$D" | tail -1
