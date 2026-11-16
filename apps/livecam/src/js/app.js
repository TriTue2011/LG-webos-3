/* Live Cam 1.1 — man hinh su kien tren TV LG, cung mo hinh voi man camera Dosen:
 * HA mo app bang launchParams {cmd:"show", camera|url|text, owner, priority, ttl, ...}; viec den sau / muc cao hon de len,
 * het han hoac go thi ve lop duoi, het sach thi app thoat va TV tro lai noi dung truoc. ES5 cho webOS cu. */
(function () {
  "use strict";

  var VERSION = "Live Cam 1.3.0";
  var sys = window.webOSSystem || window.PalmSystem || null;
  var stage = document.getElementById("stage");
  var tilesEl = document.getElementById("tiles");
  var toastEl = document.getElementById("toast");

  var layers = new Layers();
  var tiles = {};               // khoa lop -> o hinh
  var shownKeys = "";
  var ha = null, haKey = "", haWaiting = null;
  var ticker = null, toastTimer = null;
  var previewMode = false, leaving = false;

  // Cua so popup (goc + kich thuoc): mac dinh theo goi (config.js), nguoi dung chinh bang phim mui ten va duoc nho; tham so mo app (corner, size) thang.
  var DEF = window.LIVECAM_DEFAULTS || { corner: "full", size: 100, overlay: false };
  var popup = { corner: DEF.corner, size: DEF.size };
  (function () {
    var saved = Store.get();
    if (DEF.corner !== "full") {
      if (saved.popup_corner && LayerParams.CORNERS.indexOf(saved.popup_corner) >= 0) { popup.corner = saved.popup_corner; }
      if (Number(saved.popup_size) >= 15) { popup.size = Math.min(100, Number(saved.popup_size)); }
    }
    if (DEF.overlay) { document.body.className += " overlay"; }
  })();

  function applyStageRect() {
    var r = LayerParams.popupRect(popup.corner, popup.size);
    stage.style.left = r.left + "%"; stage.style.top = r.top + "%"; stage.style.width = r.width + "%"; stage.style.height = r.height + "%";
  }

  function adjustPopup(key) {                         // remote: ▲ to hon, ▼ nho hon, ◀ ▶ doi goc
    var i = LayerParams.CORNERS.indexOf(popup.corner);
    if (key === 38) { popup.size = Math.min(100, popup.size + 5); }
    else if (key === 40) { popup.size = Math.max(15, popup.size - 5); }
    else if (key === 37) { popup.corner = LayerParams.CORNERS[(i + 3) % 4]; }
    else if (key === 39) { popup.corner = LayerParams.CORNERS[(i + 1) % 4]; }
    Store.save({ popup_size: popup.size, popup_corner: popup.corner });
    applyStageRect();
    layoutPlan(layers.plan(now()));
  }

  function now() { return new Date().getTime(); }

  function parse(raw) {
    if (!raw) { return {}; }
    if (typeof raw === "object") { return raw; }
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }

  function friendly(entity) {
    var n = String(entity || "").replace(/^camera\./, "").replace(/_/g, " ");
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : "";
  }

  // ---------- ket noi HA: mot ket noi dung chung, mo khi can, dong khi thoat ----------
  function withHa(onOk, onFail) {
    var cfg = Store.get();
    if (!cfg.url || !cfg.token) {
      var e = new Error("Chưa cài đặt: mở Live Cam từ danh sách app trên TV để nhập địa chỉ HA và token.");
      e.fatal = true;
      onFail(e);
      return;
    }
    var key = cfg.url + "|" + cfg.token;
    if (ha && ha.connected && haKey === key) { onOk(ha); return; }
    if (haWaiting && haKey === key) { haWaiting.push([onOk, onFail]); return; }
    if (ha) { ha.close(); }
    var client = new HAClient(cfg.url, cfg.token), waiters = [[onOk, onFail]], i;
    ha = client;
    haKey = key;
    haWaiting = waiters;
    client.connect(function () {
      haWaiting = null;
      for (i = 0; i < waiters.length; i++) { waiters[i][0](client); }
    }, function (err) {
      haWaiting = null;
      if (ha === client) { ha = null; haKey = ""; }
      client.close();
      for (i = 0; i < waiters.length; i++) { waiters[i][1](err); }
    });
  }

  // ---------- o hinh ----------
  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (parent) { parent.appendChild(n); }
    return n;
  }

  var COLORS = { red: 1, green: 1, blue: 1, orange: 1, black: 1 };
  function colorClass(c) { return "c-" + (COLORS[c] ? c : "none"); }

  /* The thong tin: so lon + chu thich + cac dong nhan-gia tri; gia tri thuc the lay SONG tu HA (watchStates), cap nhat tai cho. */
  function createCardTile(layer) {
    var t = { key: layer.owner + "#" + layer.seq, layer: layer, errTimer: null, dead: false, isCard: true, rowEls: [], watch: null };
    t.el = el("div", "tile card", tilesEl);
    t.titleEl = el("div", "ctitle", t.el);
    t.valueEl = el("div", "cvalue", t.el);
    t.captionEl = el("div", "ccaption", t.el);
    t.rowsEl = el("div", "crows", t.el);
    drawCard(t, {});
    return t;
  }

  function cardRows(card) {                            // dong tinh (rows) truoc, roi dong tu thuc the (entities) — giong dosen_pro.build_card
    var out = [], i;
    for (i = 0; i < card.rows.length; i++) { out.push({ label: card.rows[i].label, text: card.rows[i].value, color: card.rows[i].color, entity: "" }); }
    for (i = 0; i < card.entities.length; i++) { out.push({ label: card.entities[i].name, text: "", color: card.entities[i].color, entity: card.entities[i].entity }); }
    return out;
  }

  function drawCard(t, states) {
    var card = t.layer.card, i, r, f, rows = cardRows(card), row, main = null;
    t.titleEl.textContent = card.title || t.layer.title || "";
    if (card.main) { main = CardFmt.formatEntity(states[card.main] || { entity: card.main, state: "" }); }
    t.valueEl.textContent = card.value || (main ? main.text : "");
    t.valueEl.className = "cvalue " + colorClass(card.color);
    t.captionEl.textContent = card.caption || (main && states[card.main] ? (states[card.main].name || "") : "");
    while (t.rowEls.length < rows.length) { row = { box: el("div", "crow", t.rowsEl) }; row.l = el("span", "l", row.box); row.v = el("span", "v", row.box); t.rowEls.push(row); }
    while (t.rowEls.length > rows.length) { row = t.rowEls.pop(); t.rowsEl.removeChild(row.box); }
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      f = r.entity ? CardFmt.formatEntity(states[r.entity] || { entity: r.entity, state: "" }) : { label: r.label, text: r.text, color: r.color };
      t.rowEls[i].l.textContent = r.label || f.label;
      t.rowEls[i].v.textContent = f.text;
      t.rowEls[i].v.className = "v " + colorClass(r.color || f.color);
    }
  }

  function startCardTile(t) {
    var card = t.layer.card, ids = [], i;
    if (card.main) { ids.push(card.main); }
    for (i = 0; i < card.entities.length; i++) { ids.push(card.entities[i].entity); }
    if (!ids.length) { return; }                       // the chi co chu tinh: khong can HA
    withHa(function (haClient) {
      if (t.dead) { return; }
      t.watch = haClient.watchStates(ids, function (rows) { if (!t.dead && rows) { drawCard(t, rows); } });
    }, function () { /* khong toi duoc HA: the van hien phan chu tinh, gia tri thuc the la «—» */ });
  }

  function createTile(layer) {
    if (layer.kind === "card") { return createCardTile(layer); }
    var t = { key: layer.owner + "#" + layer.seq, layer: layer, errTimer: null, dead: false, started: false };
    t.el = el("div", "tile", tilesEl);
    t.video = el("video", "hidden", t.el);
    t.video.setAttribute("playsinline", "");
    t.img = el("img", "frame hidden", t.el);
    t.img.alt = "";
    t.titleEl = el("div", "title", t.el);
    t.titleEl.textContent = layer.title || (layer.kind === "camera" ? friendly(layer.camera) : "");
    if (layer.kind === "text") {
      t.textEl = el("div", "textbox", t.el);
      t.textEl.textContent = layer.text;
    } else {
      t.spinner = el("div", "spinner", t.el);
      t.errEl = el("div", "error hidden", t.el);
      t.player = new Player(t, function (type, info) {
        if (t.dead) { return; }
        if (type === "playing") { t.spinner.className = "spinner hidden"; }
        else if (type === "ended") { releaseTile(t); }
        else if (type === "error") { showTileError(t, info); }
      });
    }
    return t;
  }

  function startTile(t, index) {
    var layer = t.layer;
    if (t.isCard) { startCardTile(t); return; }
    if (!t.player || t.dead) { return; }
    t.started = true;
    t.spinner.className = "spinner";
    t.errEl.className = "error hidden";
    var ttl = Math.max(1, Math.ceil((layer.expires - now()) / 1000));
    function go(haClient) {
      if (t.dead) { return; }
      t.player.play(layer, { ha: haClient, index: index, ttl: ttl }, function (err) { if (err && !t.dead) { showTileError(t, err.message || String(err)); } });
    }
    if (layer.kind === "camera" && !/camera_proxy_stream|mjpe?g|action=stream|\.cgi/i.test(layer.url || "")) {
      withHa(go, function (err) { if (!t.dead) { showTileError(t, err.message || String(err)); } });
    } else {
      go(null);
    }
  }

  function showTileError(t, msg) {
    if (t.dead) { return; }
    t.spinner.className = "spinner hidden";
    t.errEl.textContent = msg;
    t.errEl.className = "error";
    if (t.player) { t.player.stop(); }
    clearTimeout(t.errTimer);
    t.errTimer = setTimeout(function () { releaseTile(t); }, 5000);
  }

  function releaseTile(t) {
    if (t.dead) { return; }
    layers.release(t.layer.owner, now());
    render();
  }

  function destroyTile(t) {
    t.dead = true;
    clearTimeout(t.errTimer);
    if (t.player) { t.player.stop(); }
    if (t.watch) { t.watch.close(); t.watch = null; }       // huy dang ky template cua the
    if (t.el.parentNode) { t.el.parentNode.removeChild(t.el); }
    delete tiles[t.key];
  }

  // Dat vi tri (%) cua tung o: mot o chiem ca man; camera + the xep luoi (xem layers.js: layout). Cua so chinh quyet dinh co chu cua the.
  function place(t, rect, narrow) {
    var W = stage.offsetWidth || window.innerWidth || 1920, H = stage.offsetHeight || window.innerHeight || 1080;
    t.el.style.left = rect.left + "%"; t.el.style.top = rect.top + "%"; t.el.style.width = rect.width + "%"; t.el.style.height = rect.height + "%";
    t.el.style.fontSize = Math.max(9, Math.min(26, Math.min(W * rect.width / 100 / 22, H * rect.height / 100 / 14))) + "px";
    var cls = "tile" + (t.isCard ? " card" : "") + (narrow ? " narrow" : "");
    if (t.el.className !== cls) { t.el.className = cls; }
  }

  function layoutPlan(plan) {
    var i;
    if (plan.single) { place(tiles[plan.single.owner + "#" + plan.single.seq], { left: 0, top: 0, width: 100, height: 100 }, false); return; }
    var L = LayerParams.layout(plan.cams.length, plan.cards.length), many = plan.cams.length + plan.cards.length > 1;
    for (i = 0; i < plan.cams.length; i++) { place(tiles[plan.cams[i].owner + "#" + plan.cams[i].seq], L.cams[i], many); }
    for (i = 0; i < plan.cards.length; i++) { place(tiles[plan.cards[i].owner + "#" + plan.cards[i].seq], L.cards[i], true); }
  }

  // ---------- ve lai theo cac lop dang hien (chi dung toi o nao thay doi) ----------
  function render() {
    if (leaving) { return; }
    var plan = layers.plan(now()), vis = plan.single ? [plan.single] : plan.cams.concat(plan.cards), order = [], i, key, wanted = {};
    for (i = 0; i < vis.length; i++) { key = vis[i].owner + "#" + vis[i].seq; order.push(key); wanted[key] = vis[i]; }
    if (!order.length) { finishOrLeave(); return; }
    var sig = order.join(",");
    if (sig === shownKeys) { return; }
    shownKeys = sig;
    for (key in tiles) { if (!wanted[key]) { destroyTile(tiles[key]); } }
    for (i = 0; i < order.length; i++) {
      if (!tiles[order[i]]) { tiles[order[i]] = createTile(wanted[order[i]]); startTile(tiles[order[i]], i); }
    }
    applyStageRect();
    layoutPlan(plan);
    stage.className = "";
    if (typeof Settings !== "undefined" && Settings.isOpen()) { Settings.hide(); }
    startTicker();
  }

  function finishOrLeave() {
    var key;
    for (key in tiles) { destroyTile(tiles[key]); }
    shownKeys = "";
    stage.className = "hidden";
    stopTicker();
    if (previewMode) { previewMode = false; Settings.resume(); } else if (!Settings.isOpen()) { leave(); }
  }

  function startTicker() {
    if (ticker) { return; }
    ticker = setInterval(function () {
      layers.expire(now());
      render();
    }, 1000);
  }

  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }

  // ---------- thoat: nha moi thu roi dong app (TV tro lai noi dung truoc) ----------
  function leave() {
    if (leaving) { return; }
    leaving = true;
    stopTicker();
    clearTimeout(toastTimer);
    var key;
    for (key in tiles) { destroyTile(tiles[key]); }
    layers.clear();
    shownKeys = "";
    try { Settings.close(); } catch (e) { /* bo qua */ }
    if (ha) { ha.close(); ha = null; haKey = ""; }
    haWaiting = null;
    try { if (sys && typeof sys.close === "function") { sys.close(); } else { window.close(); } } catch (e2) { /* bo qua */ }
    setTimeout(function () { leaving = false; }, 500);      // neu he thong khong dong app thi lan mo sau van chay
  }

  function toast(msg) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = "toast";
    toastTimer = setTimeout(function () { toastEl.className = "toast hidden"; }, 2500);
  }

  // ---------- nhan lenh tu HA (launchParams / webOSRelaunch) ----------
  // Mot lan mo co the mang NHIEU viec: {items:[{...},{...}]} (+ connect). Tranh mat su kien khi app dang khoi dong nguoi va nhan hai lan mo lien tiep.
  function apply(cmd) {
    var t = now();
    if (cmd.connect) { Store.save(cmd.connect); }
    if (cmd.cmd === "show") {
      previewMode = false;
      if (cmd.spec.corner) { popup.corner = LayerParams.CORNERS.indexOf(cmd.spec.corner) >= 0 || cmd.spec.corner === "full" ? cmd.spec.corner : popup.corner; }
      if (cmd.spec.size) { popup.size = Math.max(15, Math.min(100, Number(cmd.spec.size) || popup.size)); }
      layers.show(cmd.spec, t);
    } else if (cmd.cmd === "release") {
      layers.release(cmd.owner, t);
    } else if (cmd.cmd === "clear") {
      layers.clear();
    } else if (cmd.connect) {                                   // chi gui ket noi, khong kem lenh: bao da nhan roi tu dong
      layers.show({ owner: "_ket_noi", kind: "text", title: "Đã nhận kết nối Home Assistant", text: "", priority: 1, ttl: 6 }, t);
    }
  }

  function openSettings() {
    stopTicker();
    Settings.open({
      version: VERSION,
      toast: toast,
      onExit: leave,
      onPreview: function (cfg) {
        Settings.hide();
        previewMode = true;
        layers.show({ owner: "_xem_thu", kind: "camera", camera: cfg.camera, format: cfg.format, ttl: cfg.timeout || 15, title: "Xem thử — Back để quay lại", priority: 2 }, now());
        render();
      }
    });
  }

  function handle(raw) {
    var p = parse(raw), items = Object.prototype.toString.call(p.items) === "[object Array]" ? p.items : null, i, any = false, c;
    if (items) {
      c = LayerParams.parse({ connect: p.connect });
      if (c.connect) { Store.save(c.connect); }
      for (i = 0; i < items.length; i++) { c = LayerParams.parse(items[i]); if (c.cmd) { any = true; apply(c); } }
      if (!any && !layers.size()) { leave(); return; }
    } else {
      c = LayerParams.parse(p);
      if (!c.cmd && !c.connect) {
        if (!layers.size()) { openSettings(); }                 // mo tu danh sach app, khong tham so
        return;
      }
      apply(c);
    }
    if (c && c.cmd === "clear") { leave(); return; }
    render();
  }

  function initialParams() {
    if (sys) { return parse(sys.launchParams); }
    var out = {}, parts = location.search.replace(/^\?/, "").split("&"), i, p, k;
    for (i = 0; i < parts.length; i++) {
      if (!parts[i]) { continue; }
      p = parts[i].indexOf("=");
      k = decodeURIComponent(p < 0 ? parts[i] : parts[i].slice(0, p));
      out[k] = p < 0 ? "" : decodeURIComponent(parts[i].slice(p + 1));
    }
    if (out.connect_url && out.connect_token) { out.connect = { url: out.connect_url, token: out.connect_token }; }
    return out;
  }

  // ---------- su kien ----------
  document.addEventListener("webOSRelaunch", function (e) { handle(e.detail || (sys && sys.launchParams)); });

  document.addEventListener("keydown", function (e) {
    if (Settings.isOpen()) { if (Settings.handleKey(e)) { e.preventDefault(); } return; }
    if (DEF.corner !== "full" && stage.className.indexOf("hidden") < 0 && (e.keyCode >= 37 && e.keyCode <= 40)) { e.preventDefault(); adjustPopup(e.keyCode); return; }
    if (e.keyCode === 461 || e.keyCode === 27 || e.keyCode === 458) {      // Back: go lop dang hien (ve lop duoi), het thi thoat
      e.preventDefault();
      if (!layers.release("", now()).length) { leave(); } else { render(); }
    }
  });

  // Khi app bi che (doi kenh, ve man hinh chinh): nha bo giai ma / ket noi MJPEG ngay; lop van het han dung gio. Hien lai thi phat lai.
  document.addEventListener("visibilitychange", function () {
    var key, t;
    for (key in tiles) {
      t = tiles[key];
      if (document.hidden) { if (t.player) { t.player.stop(); t.started = false; } }
      else if (t.player && !t.started && !t.dead) { startTile(t, indexOf(key)); }
    }
  });

  window.addEventListener("resize", function () { if (shownKeys) { layoutPlan(layers.plan(now())); } });     // doi kich thuoc man hinh: dat lai vi tri va co chu

  function indexOf(key) { return shownKeys.split(",").indexOf(key); }

  window.LiveCam = { debug: function () { return { layers: layers.size(), tiles: Object.keys(tiles).length, ticker: !!ticker, ha: !!ha, leaving: leaving }; }, handle: handle };

  handle(initialParams());
})();
