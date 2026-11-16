/* Bo phat MOT o hinh (camera / anh / video). Thu tu cho camera: HLS goc cua TV -> hls.js (chi nap khi can) -> MJPEG.
 * O thu hai tro di CHI dung MJPEG: TV thuong chi co mot bo giai ma video phan cung. Moi tai nguyen deu duoc go trong stop(). ES5. */
(function (w) {
  "use strict";

  var FIRST_FRAME_MS = 15000;      // HLS cua HA thuong mat 5-10 giay moi ra khung dau
  var IMAGE_FRAME_MS = 8000;
  var STALL_CHECK_MS = 5000;
  var BLANK_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  var hlsLoading = null;

  /* Nap hls.js khi that su can (phan lon TV phat HLS goc, khong can 240 KB nay). */
  function loadHls(cb) {
    if (w.Hls) { cb(true); return; }
    if (hlsLoading) { hlsLoading.push(cb); return; }
    hlsLoading = [cb];
    var s = document.createElement("script");
    function end(ok) { var q = hlsLoading; hlsLoading = null; for (var i = 0; i < q.length; i++) { q[i](ok); } }
    s.onload = function () { end(!!w.Hls); };
    s.onerror = function () { end(false); };
    s.src = "lib/hls.min.js";
    document.head.appendChild(s);
  }

  function show(n) { n.classList.remove("hidden"); }
  function hide(n) { n.classList.add("hidden"); }

  function Player(tile, onEvent) {
    this.video = tile.video;
    this.img = tile.img;
    this.onEvent = onEvent || function () {};
    this.gen = 0;
    this.cleanup = [];
    this.hls = null;
  }

  Player.prototype.stop = function () {
    var i;
    this.gen++;
    for (i = 0; i < this.cleanup.length; i++) { try { this.cleanup[i](); } catch (e) { /* bo qua */ } }
    this.cleanup = [];
    if (this.hls) { try { this.hls.destroy(); } catch (e) { /* bo qua */ } this.hls = null; }
    try { this.video.pause(); } catch (e) { /* bo qua */ }
    this.video.removeAttribute("src");
    try { this.video.load(); } catch (e) { /* bo qua */ }        // nha bo giai ma phan cung
    this.img.onerror = null;
    this.img.src = BLANK_GIF;                                      // chac chan cat ket noi MJPEG (xoa thuoc tinh src co the khong cat o Chromium cu)
    this.img.removeAttribute("src");
    hide(this.video);
    hide(this.img);
  };

  /* spec: lop (kind, camera, url, format, loop, muted); opts: {ha, index, ttl}. cb(err) goi DUNG MOT LAN khi co khung dau hoac that bai. Sau do gui onEvent("ended"|"error", msg). */
  Player.prototype.play = function (spec, opts, cb) {
    var self = this, gen;
    self.stop();
    gen = self.gen;
    var settled = false;
    function ok(mode) { if (!settled && gen === self.gen) { settled = true; self.onEvent("playing", mode); cb(null); } }
    function fail(msg) {
      if (gen !== self.gen) { return; }
      if (!settled) { settled = true; self.stop(); cb(new Error(msg)); } else { self.stop(); self.onEvent("error", msg); }
    }
    self.video.muted = spec.muted !== false;

    function mjpeg() {
      if (!spec.camera) { fail("Khong phat duoc MJPEG (thieu camera)"); return; }
      var life = Math.max(120, Math.min(3660, (opts.ttl || 3600) + 60));
      opts.ha.mjpegUrl(spec.camera, life, function (err, url) {
        if (gen !== self.gen) { return; }
        if (err) { fail("Khong lay duoc link MJPEG: " + (err.message || "khong ro")); return; }
        self.playImage(url, gen, function () { ok("mjpeg"); }, fail, IMAGE_FRAME_MS);
      });
    }

    function hls(url, allowFallback) {
      self.playHlsNative(url, gen, function () { ok("hls"); }, function () {
        self.playHlsJs(url, gen, function () { ok("hls.js"); }, function (why) {
          if (allowFallback) { mjpeg(); } else { fail("Khong phat duoc HLS tren TV nay (" + why + ")"); }
        });
      });
    }

    if (spec.kind === "image") {
      if (!spec.url) { fail("Thieu dia chi anh"); return; }
      self.playImage(spec.url, gen, function () { ok("image"); }, fail, IMAGE_FRAME_MS, true);
    } else if (spec.kind === "video") {
      if (!spec.url) { fail("Thieu dia chi video"); return; }
      if (/^rtsp:/i.test(spec.url)) { fail("TV khong phat duoc rtsp:// — dung camera trong HA hoac http(s)"); return; }
      if (/\.m3u8(\?|$)/i.test(spec.url)) { hls(spec.url, false); } else { self.playVideoUrl(spec.url, gen, !!spec.loop, function () { ok("video"); }, fail); }
    } else if (spec.url && /camera_proxy_stream|mjpe?g|action=stream|\.cgi/i.test(spec.url)) {
      self.playImage(spec.url, gen, function () { ok("mjpeg"); }, fail, IMAGE_FRAME_MS);
    } else if (!spec.camera) {
      fail("Chua chon camera");
    } else if (opts.index > 0 || spec.format === "mjpeg") {
      mjpeg();
    } else {
      opts.ha.hlsUrl(spec.camera, function (err, url) {
        if (gen !== self.gen) { return; }
        if (!err) { hls(url, spec.format !== "hls"); }
        else if (spec.format !== "hls") { mjpeg(); }
        else { fail("Khong lay duoc link HLS: " + (err.message || "khong ro")); }
      });
    }
  };

  /* Cho khung dau cua <video>; sau do canh dung hinh (currentTime khong tien trong 2 lan kiem lien tiep thi bao loi). */
  Player.prototype.waitPlaying = function (gen, onOk, onFail, ms) {
    var self = this, v = self.video, done = false, timer, watch, last = -1, stuck = 0;
    function end(good, why) {
      if (done) { return; }
      done = true;
      clearTimeout(timer);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("error", onError);
      if (gen !== self.gen) { return; }
      if (good) { onOk(); } else { onFail(why || "Loi video"); }
    }
    function onPlaying() { end(true); startWatch(); }
    function onError() { end(false, "Loi video " + (v.error ? v.error.code : "")); }
    function onEnded() { if (gen === self.gen) { self.onEvent("ended"); } }
    function startWatch() {
      if (watch) { return; }
      watch = setInterval(function () {
        if (gen !== self.gen) { clearInterval(watch); return; }
        if (v.ended || v.paused) { return; }
        if (v.currentTime === last) { stuck++; } else { stuck = 0; last = v.currentTime; }
        if (stuck >= 2) { clearInterval(watch); self.onEvent("error", "Luong bi dung hinh"); }
      }, STALL_CHECK_MS);
    }
    timer = setTimeout(function () { end(false, "Het thoi gian cho khung dau"); }, ms || FIRST_FRAME_MS);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("error", onError);
    v.addEventListener("ended", onEnded);
    self.cleanup.push(function () {
      clearTimeout(timer); clearInterval(watch);
      v.removeEventListener("playing", onPlaying); v.removeEventListener("error", onError); v.removeEventListener("ended", onEnded);
    });
    var p = null;
    try { p = v.play(); } catch (e) { end(false, "Khong phat duoc video"); return; }
    if (p && p.catch) {
      p.catch(function (e) {
        if (e && e.name === "NotAllowedError" && !v.muted) { v.muted = true; try { v.play(); } catch (x) { /* bo qua */ } }
        else if (e && e.name !== "AbortError") { end(false, "Khong phat duoc video"); }
      });
    }
  };

  Player.prototype.playHlsNative = function (url, gen, onOk, onFail) {
    if (gen !== this.gen) { onFail("cancelled"); return; }
    var v = this.video;
    v.loop = false;
    show(v);
    v.src = url;
    this.waitPlaying(gen, onOk, onFail, FIRST_FRAME_MS);
  };

  Player.prototype.playHlsJs = function (url, gen, onOk, onFail) {
    var self = this;
    if (gen !== self.gen) { onFail("cancelled"); return; }
    loadHls(function (loaded) {
      if (gen !== self.gen) { onFail("cancelled"); return; }
      if (!loaded || !w.Hls.isSupported()) { onFail("TV nay khong ho tro hls.js"); return; }
      var v = self.video, done = false, retried = { net: false, media: false };
      function once(fn, a) { if (!done) { done = true; fn(a); } }
      v.removeAttribute("src");
      show(v);
      v.loop = false;
      // Bo dem nho: xem truc tiep chi can vai giay, mac dinh cua hls.js (30 s / 60 MB / giu lai vo han) lam bo nho phinh dan.
      var hls = new w.Hls({ maxBufferLength: 8, maxMaxBufferLength: 12, maxBufferSize: 10 * 1000 * 1000, backBufferLength: 5, liveSyncDurationCount: 3,
                            enableWorker: false, manifestLoadingTimeOut: 15000, levelLoadingTimeOut: 15000, fragLoadingTimeOut: 15000 });
      self.hls = hls;
      hls.on(w.Hls.Events.ERROR, function (ev, data) {
        if (!data || !data.fatal) { return; }
        if (data.type === w.Hls.ErrorTypes.NETWORK_ERROR && done && !retried.net) { retried.net = true; hls.startLoad(); return; }
        if (data.type === w.Hls.ErrorTypes.MEDIA_ERROR && !retried.media) { retried.media = true; hls.recoverMediaError(); return; }
        if (done) { self.onEvent("error", "HLS " + data.type + ": " + data.details); } else { once(onFail, "HLS " + data.type + ": " + data.details); }
      });
      hls.loadSource(url);
      hls.attachMedia(v);
      self.waitPlaying(gen, function () { once(onOk); }, function (why) { once(onFail, why); }, FIRST_FRAME_MS);
    });
  };

  Player.prototype.playVideoUrl = function (url, gen, loop, onOk, onFail) {
    if (gen !== this.gen) { onFail("cancelled"); return; }
    var v = this.video;
    v.loop = loop;
    show(v);
    v.src = url;
    this.waitPlaying(gen, onOk, onFail, FIRST_FRAME_MS);
  };

  /* <img>: anh tinh hoac luong MJPEG. staticImg: chi can tai xong mot lan. */
  Player.prototype.playImage = function (url, gen, onOk, onFail, ms, staticImg) {
    var self = this, img = self.img, done = false, poll, timer;
    function end(good, why) {
      if (done) { return; }
      done = true;
      clearInterval(poll); clearTimeout(timer);
      img.onerror = null;
      if (gen !== self.gen) { return; }
      if (good) { onOk(); } else { onFail(why); }
    }
    img.onerror = function () { end(false, "Khong tai duoc " + (staticImg ? "anh" : "luong MJPEG")); };
    img.onload = function () { if (staticImg) { end(true); } };
    img.src = url;
    show(img);
    poll = setInterval(function () { if (gen !== self.gen) { clearInterval(poll); } else if (img.naturalWidth > 0) { end(true); } }, 100);
    timer = setTimeout(function () { end(false, "Het thoi gian cho khung dau (anh/MJPEG)"); }, ms);
    self.cleanup.push(function () { clearInterval(poll); clearTimeout(timer); img.onerror = null; img.onload = null; });
  };

  w.Player = Player;
})(window);
