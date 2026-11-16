/* Man hinh chon app (kieu Android TV / Apple TV) cho webOS 3 (Chromium 38): ES5 thuan, khong CSS grid/bien/vh.
 * Mo app khac bang luna://com.webos.applicationManager/launch {id}. Thanh cong thi app nay xuong nen va KHONG co phan hoi;
 * returnValue:false la that bai -> hien thong bao ngay trong man hinh. */
(function () {
  "use strict";
  var CFG = window.HOME_CONFIG, sys = window.webOSSystem || window.PalmSystem || null;
  var VERSION = "Home 1.0.0";
  var SVG = {
    play: '<rect x="8" y="14" width="48" height="36" rx="9"/><path d="M27 24l14 8-14 8z" fill="#fff"/>',
    cam: '<rect x="6" y="18" width="38" height="28" rx="5"/><path d="M44 28l14-8v24l-14-8z"/>',
    tv: '<rect x="6" y="12" width="52" height="34" rx="4"/><path d="M22 54h20M32 46v8"/>',
    globe: '<circle cx="32" cy="32" r="24"/><ellipse cx="32" cy="32" rx="10" ry="24"/><path d="M8 32h48M12 19h40M12 45h40"/>',
    image: '<rect x="6" y="10" width="52" height="44" rx="5"/><circle cx="22" cy="26" r="5"/><path d="M8 50l16-14 10 8 10-12 12 14"/>',
    music: '<path d="M24 46V14l28-6v32"/><circle cx="17" cy="48" r="7"/><circle cx="45" cy="42" r="7"/>',
    store: '<path d="M10 22h44l-4 32H14z"/><path d="M22 22a10 10 0 0 1 20 0"/>',
    cast: '<path d="M8 18h48v34H32"/><path d="M8 52a10 10 0 0 0-0.01 0M8 42a10 10 0 0 1 10 10M8 32a20 20 0 0 1 20 20"/>',
    gear: '<circle cx="32" cy="32" r="9"/><path d="M32 6v10M32 48v10M6 32h10M48 32h10M14 14l7 7M43 43l7 7M50 14l-7 7M21 43l-7 7"/>'
  };
  var rows = [], pos = { r: 0, c: 0 }, want = 0, toastTimer = null, clockTimer = null, lastClock = "";
  var DAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

  function beacon(k, v) {
    if (!CFG.beacon) { return; }
    try { var x = new XMLHttpRequest(); x.open("POST", CFG.beacon + k, true); x.send(typeof v === "string" ? v : JSON.stringify(v)); } catch (e) { /* bo qua */ }
  }
  window.onerror = function (m, u, l) { beacon("jserror", String(m) + " @" + l); };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (text !== undefined) { e.textContent = text; } return e; }
  function svgUrl(name) {
    var body = SVG[name] || SVG.tv;
    return "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#e8eef7" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">' + body + "</svg>");
  }
  function makeTile(item, isInput) {
    var t = el("div", "tile" + (isInput ? " input" : "")), ico = el("div", "ico"), img = el("img");
    t.setAttribute("data-id", item.id);
    if (!isInput) {
      img.alt = "";
      if (item.icon) {
        img.onerror = function () { img.onerror = null; img.src = svgUrl(item.svg); beacon("icon", item.id + " fallback"); };
        img.onload = function () { beacon("icon", item.id + " ok " + img.naturalWidth); };
        img.src = "file://" + item.icon;
      } else { img.src = svgUrl(item.svg); }
      ico.appendChild(img); t.appendChild(ico);
    }
    t.appendChild(el("div", "name", item.title));
    return t;
  }
  function build() {
    var apps = document.getElementById("apps"), inputs = document.getElementById("inputs"), i, row, n = CFG.perRow || 6;
    rows = [];
    for (i = 0; i < CFG.apps.length; i += n) {
      row = el("div", "row"); rows.push({ el: row, tiles: [], items: CFG.apps.slice(i, i + n), input: false }); apps.appendChild(row);
    }
    row = el("div", "row rowin"); rows.push({ el: row, tiles: [], items: CFG.inputs, input: true }); inputs.appendChild(row);
    rows.forEach(function (R, ri) {
      R.items.forEach(function (it, ci) {
        var t = makeTile(it, R.input);
        t.addEventListener("mouseenter", function () { setFocus(ri, ci); });
        t.addEventListener("click", function () { setFocus(ri, ci); open(it); });
        R.el.appendChild(t); R.tiles.push(t);
      });
    });
  }
  function setFocus(r, c) {
    var R = rows[pos.r], t = R && R.tiles[pos.c];
    if (t) { t.className = t.className.replace(" focus", ""); }
    pos.r = r; pos.c = c;
    t = rows[r].tiles[c]; t.className += " focus";
  }
  function move(key) {
    var r = pos.r, c = pos.c;
    if (key === 37) { c = Math.max(0, c - 1); want = c; setFocus(r, c); return; }
    if (key === 39) { c = Math.min(rows[r].tiles.length - 1, c + 1); want = c; setFocus(r, c); return; }
    if (key === 38) { r = Math.max(0, r - 1); } else { r = Math.min(rows.length - 1, r + 1); }
    setFocus(r, Math.min(want, rows[r].tiles.length - 1));
  }
  function toast(msg, ms) {
    var t = document.getElementById("toast"); t.textContent = msg; t.className = "on";
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = ""; }, ms || 3500);
  }
  function hideToast() { clearTimeout(toastTimer); document.getElementById("toast").className = ""; }
  function open(item) {
    var done = false;
    toast("Đang mở " + item.title + "…", 8000);
    try {
      var b = new PalmServiceBridge();
      b.onservicecallback = function (m) {
        var r = {}; if (done) { return; } done = true;
        try { r = JSON.parse(m); } catch (e) { r = {}; }
        if (r.returnValue === false) { toast(r.errorCode === -101 ? item.title + " chưa được cài trên tivi" : "Không mở được " + item.title + (r.errorText ? " (" + String(r.errorText).slice(0, 80) + ")" : ""), 6000); beacon("launch-fail", item.id + " " + m); }
        else { hideToast(); }
      };
      b.call("luna://com.webos.applicationManager/launch", JSON.stringify({ id: item.id }));
    } catch (e) { toast("App này chỉ mở được trên tivi LG", 4000); }
  }
  function close() {
    try { if (sys && typeof sys.close === "function") { sys.close(); } else { window.close(); } } catch (e) { /* bo qua */ }
  }
  function tickClock() {
    var d = new Date(), m = d.getMinutes(), s = (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (m < 10 ? "0" : "") + m;
    if (s !== lastClock) {
      lastClock = s; document.getElementById("clock").textContent = s;
      document.getElementById("date").textContent = DAYS[d.getDay()] + ", " + d.getDate() + " tháng " + (d.getMonth() + 1) + ", " + d.getFullYear();
    }
    clearTimeout(clockTimer); clockTimer = setTimeout(tickClock, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50);
  }
  function reset() { want = 0; setFocus(0, 0); hideToast(); tickClock(); }

  document.addEventListener("keydown", function (e) {
    var k = e.keyCode;
    if (k >= 37 && k <= 40) { e.preventDefault(); move(k); }
    else if (k === 13) { e.preventDefault(); open(rows[pos.r].items[pos.c]); }
    else if (k === 461 || k === 27 || k === 8) { e.preventDefault(); close(); }
  });
  document.addEventListener("webOSRelaunch", reset);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { tickClock(); } });

  build(); setFocus(0, 0); tickClock();
  beacon("ready", { v: VERSION, tiles: document.getElementsByClassName("tile").length, rows: rows.length, palm: typeof window.PalmSystem, ws: typeof window.webOSSystem,
    bridge: typeof window.PalmServiceBridge, size: [window.innerWidth, window.innerHeight] });
}());
