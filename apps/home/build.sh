#!/bin/bash
# Dong goi com.viet.home thanh .ipk bang ares-package. Dung: ./build.sh [beacon_url]   (beacon = ban thu tren tivi: gui bao cao ve may nay; ban that KHONG dung)
set -e
D="$(cd "$(dirname "$0")" && pwd)"; B="$(mktemp -d)"; cp -r "$D/app" "$B/app"
[ -n "$1" ] && sed -i "s#beacon: null#beacon: \"$1\"#" "$B/app/js/config.js"
cd "$B" && HOME="${ARES_HOME:?can ARES_HOME}" "${ARES_BIN:?can ARES_BIN}/ares-package" app -o "$D" | tail -1
rm -rf "$B"
