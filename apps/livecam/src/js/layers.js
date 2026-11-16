/* Lop hien thi cua man hinh — cung luat voi man camera Dosen (dosen_pro.screen_show):
 *  - moi viec co "owner" (ten lop): cung ten thi thay nhau, khac ten thi xep chong;
 *  - muc uu tien cao hon luon o tren; cung muc thi viec toi sau de len;
 *  - camera cung muc tren cung chia doi man (toi da 2; nhieu hon thi doi luot moi 5 giay);
 *  - viec het han (ttl) hoac bi go thi ve lop duoi; het sach thi app thoat, TV tro lai noi dung truoc.
 * Chi la logic thuan (khong DOM), de thu bang node. ES5 cho webOS cu (Chromium 38). */
(function (root) {
  "use strict";

  var MAX_TTL = 3600;          // tran cung: khong viec nao o lai qua 1 gio (tranh quen tat -> luong chay mai)
  var ROTATE_MS = 5000;
  var KINDS = { camera: 1, image: 1, video: 1, text: 1, card: 1 };
  // Do tren 49UH617T (webOS 3, 4 loi ARM, Chromium 38 ve bang PHAN MEM, MOT bo giai ma video phan cung):
  //   HLS MPEG-TS truc tiep (go2rtc) 1 camera: tong ~136% CPU (+~50%); MJPEG moi camera them: ~+280%; 2-3 <video> cung luc tranh bo giai ma.
  // => mac dinh 1 camera cung luc (nhieu hon thi luan phien moi 5 s). CAMS_MAX 9 chi de ho tro TV manh hon, KHONG nen dung tren TV nay.
  var CAMS_DEFAULT = 1, CAMS_MAX = 9;
  var CARDS_DEFAULT = 4, CARDS_MAX = 8;
  var ENTITY_RE = /^[a-z_]+\.[a-z0-9_]+$/;

  function clampPriority(p) {
    p = Math.round(Number(p));
    return isNaN(p) ? 2 : Math.max(1, Math.min(4, p));
  }

  /* The thong tin giong dosen_pro.screen_card: {title, main (thuc the so lon), value (chu co dinh), caption, color, entities:[id | {entity,name,color}], rows:[{label,value,color}]}.
   * Chi nhan thuc the dung dinh dang entity_id (se nhung vao mau HA) va tran so dong. */
  function normalizeCard(c) {
    var out = { title: String(c.title || ""), main: "", value: String(c.value === undefined || c.value === null ? "" : c.value), caption: String(c.caption || ""),
                color: /^(red|black|blue|green|orange)$/.test(c.color) ? c.color : "red", entities: [], rows: [] };
    if (c.main && ENTITY_RE.test(String(c.main))) { out.main = String(c.main); }
    var ents = Object.prototype.toString.call(c.entities) === "[object Array]" ? c.entities : [], rows = Object.prototype.toString.call(c.rows) === "[object Array]" ? c.rows : [], i, e, id;
    for (i = 0; i < ents.length && out.entities.length < 12; i++) {
      e = ents[i];
      id = typeof e === "string" ? e : (e && e.entity);
      if (id && ENTITY_RE.test(String(id))) { out.entities.push({ entity: String(id), name: e && e.name ? String(e.name) : "", color: e && e.color ? String(e.color) : "" }); }
    }
    for (i = 0; i < rows.length && out.rows.length < 12; i++) {
      e = rows[i];
      if (typeof e === "string") { id = e.indexOf(":"); out.rows.push({ label: id < 0 ? e : e.slice(0, id).replace(/^\s+|\s+$/g, ""), value: id < 0 ? "" : e.slice(id + 1).replace(/^\s+|\s+$/g, ""), color: "" }); }
      else if (e) { out.rows.push({ label: String(e.label || ""), value: String(e.value === undefined ? "" : e.value), color: e.color ? String(e.color) : "" }); }
    }
    return out;
  }

  function clampInt(v, lo, hi, dflt) {
    v = Math.round(Number(v));
    return isNaN(v) ? dflt : Math.max(lo, Math.min(hi, v));
  }

  function Layers() {
    this.items = [];
    this.seq = 0;
    this.maxCams = CAMS_DEFAULT;
    this.maxCards = CARDS_DEFAULT;
  }

  /* Them / thay mot viec. spec: {owner, kind, priority, ttl (giay, 0 = den khi bi go), camera, url, title, text, loop, split, format, muted}. */
  Layers.prototype.show = function (spec, now) {
    var kind = KINDS[spec.kind] ? spec.kind : ((spec.camera || spec.hls) ? "camera" : (spec.card ? "card" : spec.text ? "text" : (/\.(mp4|m3u8|webm|mkv|ts)(\?|$)/i.test(spec.url || "") ? "video" : "image")));
    var owner = String(spec.owner || "") || kind;
    var ttl = Number(spec.ttl);
    ttl = isNaN(ttl) || ttl <= 0 ? 0 : Math.min(ttl, MAX_TTL);
    var layer = {
      owner: owner,
      kind: kind,
      priority: clampPriority(spec.priority === undefined ? 2 : spec.priority),
      ttl: ttl,
      camera: spec.camera ? String(spec.camera) : "",
      url: spec.url ? String(spec.url) : "",
      hls: spec.hls ? String(spec.hls) : "",
      title: spec.title ? String(spec.title) : "",
      text: spec.text ? String(spec.text) : "",
      card: spec.card ? normalizeCard(spec.card) : null,
      loop: !!spec.loop,
      split: spec.split !== false,
      format: spec.format || "auto",
      muted: spec.muted !== false,
      seq: ++this.seq,
      expires: now + (ttl > 0 ? ttl : MAX_TTL) * 1000
    };
    if (spec.max_cams !== undefined) { this.maxCams = clampInt(spec.max_cams, 1, CAMS_MAX, this.maxCams); }
    if (spec.max_cards !== undefined) { this.maxCards = clampInt(spec.max_cards, 1, CARDS_MAX, this.maxCards); }
    var i;
    for (i = 0; i < this.items.length; i++) {
      if (this.items[i].owner === owner) { this.items.splice(i, 1); break; }
    }
    this.items.push(layer);
    return layer;
  };

  /* Go mot lop theo ten (khong ten = go nhung lop dang hien o tren cung). Tra ve danh sach lop da go. */
  Layers.prototype.release = function (owner, now) {
    var gone = [], i;
    if (owner) {
      for (i = this.items.length - 1; i >= 0; i--) {
        if (this.items[i].owner === owner) { gone.push(this.items.splice(i, 1)[0]); }
      }
      return gone;
    }
    var top = this.visible(now || 0), k;
    for (k = 0; k < top.length; k++) {
      i = this.items.indexOf(top[k]);
      if (i >= 0) { gone.push(this.items.splice(i, 1)[0]); }
    }
    return gone;
  };

  Layers.prototype.clear = function () {
    var gone = this.items;
    this.items = [];
    return gone;
  };

  /* Go cac viec het han; tra ve danh sach da go. */
  Layers.prototype.expire = function (now) {
    var gone = [], i;
    for (i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].expires <= now) { gone.push(this.items.splice(i, 1)[0]); }
    }
    return gone;
  };

  /* Cac lop dang duoc chieu (1 hoac 2). */
  /* Ke hoach hien thi o muc uu tien cao nhat: {mode:"single", cams:[], cards:[], single:layer} hoac {mode:"grid", cams:[...], cards:[...]}.
   * Camera (split) va the CUNG muc dung chung man; viec moi nhat la anh/video/chu/camera-khong-chia thi hien MOT minh.
   * Nhieu hon gioi han (maxCams / maxCards) thi doi trang moi ROTATE_MS. */
  Layers.prototype.plan = function (now) {
    var none = { mode: "single", cams: [], cards: [], single: null };
    if (!this.items.length) { return none; }
    var top = 0, i;
    for (i = 0; i < this.items.length; i++) { if (this.items[i].priority > top) { top = this.items[i].priority; } }
    var same = [];
    for (i = 0; i < this.items.length; i++) { if (this.items[i].priority === top) { same.push(this.items[i]); } }
    same.sort(function (a, b) { return b.seq - a.seq; });          // moi nhat truoc
    var newest = same[0];
    var groupable = function (l) { return l.kind === "card" || (l.kind === "camera" && l.split); };
    if (!groupable(newest)) { return { mode: "single", cams: [], cards: [], single: newest }; }
    var cams = [], cards = [];
    for (i = 0; i < same.length; i++) {
      if (same[i].kind === "card") { cards.push(same[i]); }
      else if (same[i].kind === "camera" && same[i].split) { cams.push(same[i]); }
    }
    var tick = Math.floor(now / ROTATE_MS);
    var page = function (list, per) { var pages = Math.ceil(list.length / per) || 1, k = tick % pages; return list.slice(k * per, k * per + per); };
    return { mode: "grid", cams: page(cams, this.maxCams), cards: page(cards, this.maxCards), single: null };
  };

  /* Danh sach phang cac lop dang chieu (camera truoc, the sau). */
  Layers.prototype.visible = function (now) {
    var p = this.plan(now);
    return p.single ? [p.single] : p.cams.concat(p.cards);
  };

  Layers.prototype.size = function () { return this.items.length; };

  /* So o moi hang cho n o (man 16:9): hang cuoi it o thi o gian rong ra, khong de o trong. */
  var CAM_ROWS = { 1: [1], 2: [2], 3: [2, 1], 4: [2, 2], 5: [3, 2], 6: [3, 3], 7: [3, 2, 2], 8: [3, 3, 2], 9: [3, 3, 3] };
  var CARD_ROWS = { 1: [1], 2: [2], 3: [3], 4: [2, 2], 5: [3, 2], 6: [3, 3], 7: [4, 3], 8: [4, 4] };

  /* Toa do % {left,top,width,height} cua n o trong mot vung (x,y,w,h tinh bang %), xep theo `rows`. */
  function rects(n, table, area) {
    var rows = table[Math.max(1, Math.min(n, 9))] || [n], out = [], r, c, h = area.h / rows.length;
    for (r = 0; r < rows.length; r++) {
      for (c = 0; c < rows[r]; c++) { out.push({ left: area.x + c * area.w / rows[r], top: area.y + r * h, width: area.w / rows[r], height: h }); }
    }
    return out.slice(0, n);
  }

  /* Bo cuc ca man: camera ben trai (68%), the xep doc ben phai (32%); chi camera hoac chi the thi chiem ca man. Tra {cams:[rect], cards:[rect]}. */
  function layout(nCams, nCards) {
    if (nCams && nCards) {
      var cards = [], h = 100 / nCards, i;
      for (i = 0; i < nCards; i++) { cards.push({ left: 68, top: i * h, width: 32, height: h }); }
      return { cams: rects(nCams, CAM_ROWS, { x: 0, y: 0, w: 68, h: 100 }), cards: cards };
    }
    if (nCams) { return { cams: rects(nCams, CAM_ROWS, { x: 0, y: 0, w: 100, h: 100 }), cards: [] }; }
    return { cams: [], cards: rects(nCards, CARD_ROWS, { x: 0, y: 0, w: 100, h: 100 }) };
  }

  /* Cua so popup: kich thuoc = size% cua man hinh (giu ti le 16:9 cua man hinh), dat o mot goc cach le 2%. corner: br|bl|tr|tl|full. Tra {left,top,width,height} (%). */
  var CORNERS = ["br", "bl", "tl", "tr"];
  function popupRect(corner, size) {
    size = clampInt(size, 15, 100, 100);
    if (corner === "full" || size >= 100 || CORNERS.indexOf(corner) < 0) { return { left: 0, top: 0, width: 100, height: 100 }; }
    var m = 2, left = corner.charAt(1) === "l" ? m : 100 - size - m, top = corner.charAt(0) === "t" ? m : 100 - size - m;
    return { left: left, top: top, width: size, height: size };
  }

  /* Chuyen tham so mo app (launchParams / ?query) thanh mot lenh: {connect, cmd, owner, spec}. Tuong thich ban 1.0 (camera/url/title/timeout/format/muted). */
  function parseParams(p) {
    p = p || {};
    var out = { connect: null, cmd: "", owner: "", spec: null };
    if (p.connect && p.connect.url && p.connect.token) { out.connect = { url: String(p.connect.url).replace(/\/+$/, ""), token: String(p.connect.token) }; }
    var cmd = String(p.cmd || "");
    if (cmd === "release" || cmd === "clear" || cmd === "close" || p.close) {
      out.cmd = cmd === "release" ? "release" : "clear";
      out.owner = p.owner ? String(p.owner) : "";
      return out;
    }
    var asCard = p.kind === "card" || p.card || p.main_entity || p.entities || p.rows;
    if (p.camera || p.url || p.hls || p.text || asCard || cmd === "show") {
      out.cmd = "show";
      out.spec = {
        owner: p.owner || p.layer || "",
        kind: p.kind || "",
        priority: p.priority,
        ttl: p.ttl !== undefined && p.ttl !== "" ? p.ttl : p.timeout,
        camera: p.camera, url: p.url, hls: p.hls, title: p.title, text: p.text,
        card: asCard ? (p.card || { title: p.title, main: p.main_entity || p.main, value: p.value, caption: p.caption, color: p.color, entities: p.entities, rows: p.rows }) : null,
        max_cams: p.max_cams, max_cards: p.max_cards, corner: p.corner, size: p.size,
        loop: String(p.loop) === "true", split: String(p.split) !== "false",
        format: p.format, muted: String(p.muted) !== "false"
      };
    }
    return out;
  }

  root.Layers = Layers;
  root.LayerParams = { parse: parseParams, MAX_TTL: MAX_TTL, ROTATE_MS: ROTATE_MS, layout: layout, popupRect: popupRect, CORNERS: CORNERS, CAMS_MAX: CAMS_MAX };
  if (typeof module !== "undefined" && module.exports) { module.exports = { Layers: Layers, parseParams: parseParams, layout: layout, popupRect: popupRect, MAX_TTL: MAX_TTL }; }
})(typeof window !== "undefined" ? window : this);
