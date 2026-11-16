/* Ket noi Home Assistant qua WebSocket. Khong dung get_states (tra ve TOAN BO thuc the, vai MB): chi hoi dung thu can,
 * danh sach camera lay bang render_template (vai tram byte). ES5 cho webOS cu. */
(function (w) {
  "use strict";

  function HAClient(baseUrl, token) {
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.token = token;
    this.ws = null;
    this.nextId = 1;
    this.pending = {};
    this.subs = {};
    this.connected = false;
    this.haVersion = null;
  }

  HAClient.prototype.wsUrl = function () { return this.baseUrl.replace(/^http/i, "ws") + "/api/websocket"; };
  HAClient.prototype.abs = function (p) { return /^https?:\/\//i.test(p) ? p : this.baseUrl + p; };

  HAClient.prototype.connect = function (onOk, onFail) {
    var self = this, done = false, ws;
    function finish(err) { if (!done) { done = true; if (err) { onFail(err); } else { onOk(); } } }
    try { ws = new WebSocket(self.wsUrl()); } catch (e) { finish(e); return; }
    self.ws = ws;
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      var list = Object.prototype.toString.call(msg) === "[object Array]" ? msg : [msg], i, m;
      for (i = 0; i < list.length; i++) {
        m = list[i];
        if (m.type === "auth_required") { ws.send(JSON.stringify({ type: "auth", access_token: self.token })); }
        else if (m.type === "auth_ok") { self.haVersion = m.ha_version; self.connected = true; finish(null); }
        else if (m.type === "auth_invalid") { var e = new Error("Sai token: " + (m.message || "auth_invalid")); e.fatal = true; finish(e); self.close(); }
        else { self.handle(m); }
      }
    };
    ws.onclose = function () {
      var id;
      self.connected = false;
      for (id in self.pending) { try { self.pending[id](new Error("Mat ket noi Home Assistant")); } catch (e) { /* bo qua */ } }
      self.pending = {};
      self.subs = {};
      finish(new Error("Khong toi duoc " + self.wsUrl()));
    };
  };

  /* Dong han: go moi bo nghe, thoi phat; goi lai duoc nhieu lan. */
  HAClient.prototype.close = function () {
    var ws = this.ws;
    this.ws = null;
    this.connected = false;
    this.pending = {};
    this.subs = {};
    if (ws) { ws.onmessage = null; ws.onclose = null; try { ws.close(); } catch (e) { /* bo qua */ } }
  };

  HAClient.prototype.handle = function (m) {
    if (m.type === "result") {
      var cb = this.pending[m.id];
      if (!cb) { return; }
      delete this.pending[m.id];
      if (m.success) { cb(null, m.result); } else { cb(new Error((m.error && m.error.message) || "Yeu cau that bai")); }
    } else if (m.type === "event" && this.subs[m.id]) {
      this.subs[m.id](m.event);
    }
  };

  HAClient.prototype.send = function (req, cb) {
    var self = this;
    if (!self.connected || !self.ws) { setTimeout(function () { cb(new Error("Chua ket noi Home Assistant")); }, 0); return 0; }
    var id = self.nextId++;
    req.id = id;
    self.pending[id] = cb;
    try { self.ws.send(JSON.stringify(req)); } catch (e) { delete self.pending[id]; cb(e); return 0; }
    return id;
  };

  HAClient.prototype.currentUser = function (cb) { this.send({ type: "auth/current_user" }, cb); };

  /* Danh sach camera [{id, name}] — mot template nho thay cho get_states. */
  HAClient.prototype.listCameras = function (cb) {
    var self = this, got = false, subId = 0, tmpl = "{% for s in states.camera %}{{ s.entity_id }}|{{ s.name }}\n{% endfor %}";
    subId = self.send({ type: "render_template", template: tmpl, timeout: 5, report_errors: true }, function (err) {
      if (err && !got) { got = true; delete self.subs[subId]; cb(err); }
    });
    if (!subId) { return; }
    self.subs[subId] = function (ev) {
      if (got) { return; }
      got = true;
      var rows = String(ev && ev.result || "").split("\n"), out = [], i, parts;
      for (i = 0; i < rows.length; i++) {
        parts = rows[i].split("|");
        if (parts[0] && parts[0].indexOf("camera.") === 0) { out.push({ id: parts[0], name: parts.slice(1).join("|") || parts[0] }); }
      }
      out.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
      delete self.subs[subId];
      self.send({ type: "unsubscribe_events", subscription: subId }, function () { /* khong can ket qua */ });
      cb(null, out);
    };
  };

  /* Theo doi gia tri cac thuc the cua THE thong tin: MOT template, HA tu day lai ket qua moi khi bat ky thuc the nao doi (khong can lay ca danh sach thuc the).
   * cb(rows) voi rows = {entity_id: {entity,name,state,unit,deviceClass}}. Tra ve {close()} de huy dang ky (goi khi o the bi go). */
  HAClient.prototype.watchStates = function (ids, cb) {
    var self = this, tmpl = CardFmt.template(ids), subId = 0, closed = false;
    if (!tmpl) { return { close: function () {} }; }
    subId = self.send({ type: "render_template", template: tmpl, timeout: 5, report_errors: true }, function (err) {
      if (err && !closed) { cb(null, err); }
    });
    if (!subId) { return { close: function () {} }; }
    self.subs[subId] = function (ev) { if (!closed) { cb(CardFmt.parseRows(ev && ev.result)); } };
    return {
      close: function () {
        if (closed) { return; }
        closed = true;
        delete self.subs[subId];
        if (self.connected) { self.send({ type: "unsubscribe_events", subscription: subId }, function () { /* khong can ket qua */ }); }
      }
    };
  };

  /* Duong ky san de <img>/<video> goi khong can header. expires: giay (chi du thoi gian xem, khong cho 24 gio). */
  HAClient.prototype.signPath = function (path, expires, cb) {
    var self = this;
    self.send({ type: "auth/sign_path", path: path, expires: expires || 60 }, function (err, res) { if (err) { cb(err); } else { cb(null, self.abs(res.path)); } });
  };
  HAClient.prototype.mjpegUrl = function (entity, expires, cb) { this.signPath("/api/camera_proxy_stream/" + entity, expires, cb); };
  HAClient.prototype.hlsUrl = function (entity, cb) {
    var self = this;
    self.send({ type: "camera/stream", entity_id: entity, format: "hls" }, function (err, res) {
      if (err) { cb(err); } else if (res && res.url) { cb(null, self.abs(res.url)); } else { cb(new Error("Home Assistant khong tra URL HLS")); }
    });
  };

  w.HAClient = HAClient;
})(window);
