"use strict";
var assert = require("assert");
var L = require("../src/js/layers.js");
var T0 = 1000000, n = 0;
function ok(name, fn) { fn(); n++; console.log("dat  " + name); }
function owners(l, now) { return l.visible(now).map(function (x) { return x.owner; }); }

ok("mot camera: hien dung camera do", function () {
  var l = new L.Layers(); l.show({ owner: "cua", camera: "camera.a", ttl: 20 }, T0);
  assert.deepEqual(owners(l, T0), ["cua"]);
});
ok("cung ten lop thi thay nhau, khac ten thi xep chong", function () {
  var l = new L.Layers(); l.show({ owner: "x", camera: "camera.a" }, T0); l.show({ owner: "x", camera: "camera.b" }, T0);
  assert.equal(l.size(), 1); assert.equal(l.visible(T0)[0].camera, "camera.b");
  l.show({ owner: "y", camera: "camera.c" }, T0); assert.equal(l.size(), 2);
});
ok("hai camera cung muc chia doi man, moi nhat truoc", function () {
  var l = new L.Layers(); l.show({ owner: "a", camera: "camera.a" }, T0); l.show({ owner: "b", camera: "camera.b" }, T0);
  assert.deepEqual(owners(l, T0), ["b", "a"]);
});
ok("tam camera cung muc: TAT CA hien cung luc (TV 49 inch), moi nhat truoc", function () {
  var l = new L.Layers(); for (var i = 0; i < 5; i++) { l.show({ owner: "c" + i, camera: "camera.c" + i }, T0); }
  var v = owners(l, T0); assert.equal(v.length, 5); assert.equal(v[0], "c4"); assert.deepEqual(owners(l, T0 + 5000), v, "chua vuot gioi han thi khong doi luot");
});
ok("vuot gioi han camera: chia trang, doi luot moi 5 giay, du ca ba, khong sot", function () {
  var l = new L.Layers(); for (var i = 0; i < 8; i++) { l.show({ owner: "c" + i, camera: "camera.c" + i, max_cams: 3 }, T0); }
  var p1 = owners(l, 0), p2 = owners(l, 5000), p3 = owners(l, 10000), p4 = owners(l, 15000);
  assert.equal(p1.length, 3); assert.equal(p2.length, 3); assert.equal(p3.length, 2); assert.deepEqual(p4, p1);
  assert.deepEqual(p1.concat(p2, p3).sort(), ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"]);
});
ok("mac dinh toi da 6 camera, tran cung 9", function () {
  var l = new L.Layers(); for (var i = 0; i < 12; i++) { l.show({ owner: "c" + i, camera: "camera.c" + i }, T0); }
  assert.equal(l.plan(0).cams.length, 6);
  var m = new L.Layers(); for (i = 0; i < 12; i++) { m.show({ owner: "c" + i, camera: "camera.c" + i, max_cams: 99 }, T0); }
  assert.equal(m.plan(0).cams.length, 9, "max_cams bi chan o 9");
});
ok("the thong tin: nhieu the cung luc, chung man voi camera", function () {
  var l = new L.Layers();
  l.show({ owner: "cam1", camera: "camera.a" }, T0); l.show({ owner: "cam2", camera: "camera.b" }, T0);
  l.show({ owner: "dien", kind: "card", card: { title: "Dien", main: "sensor.cong_suat" } }, T0); l.show({ owner: "nhiet", kind: "card", card: { title: "Nhiet do" } }, T0);
  var p = l.plan(T0); assert.equal(p.mode, "grid"); assert.equal(p.cams.length, 2); assert.equal(p.cards.length, 2);
  assert.equal(p.cards[0].owner, "nhiet", "the moi nhat truoc"); assert.equal(l.visible(T0).length, 4);
});
ok("viec moi nhat la chu/anh/video thi hien MOT minh, che ca camera lan the", function () {
  var l = new L.Layers(); l.show({ owner: "c", camera: "camera.a" }, T0); l.show({ owner: "k", kind: "card", card: { title: "x" } }, T0); l.show({ owner: "t", kind: "text", text: "hi" }, T0);
  assert.equal(l.plan(T0).mode, "single"); assert.deepEqual(owners(l, T0), ["t"]);
  l.release("t", T0); assert.equal(l.plan(T0).mode, "grid");
});
ok("vuot gioi han the: chia trang rieng, camera khong bi anh huong", function () {
  var l = new L.Layers(); l.show({ owner: "c", camera: "camera.a" }, T0);
  for (var i = 0; i < 6; i++) { l.show({ owner: "k" + i, kind: "card", card: { title: "t" + i }, max_cards: 2 }, T0); }
  var a = l.plan(0), b = l.plan(5000), c = l.plan(10000);
  assert.equal(a.cards.length, 2); assert.equal(a.cams.length, 1); assert.equal(b.cams.length, 1);
  assert.equal(a.cards.concat(b.cards, c.cards).length, 6);
});
ok("chuan hoa the: chi nhan entity_id hop le, tran 12 dong, mau ngoai bang ve red", function () {
  var l = new L.Layers(), ents = []; for (var i = 0; i < 30; i++) { ents.push("sensor.s" + i); }
  ents.push("khong hop le"); ents.push("sensor.x}}{% evil"); ents.push({ entity: "light.den", name: "Den" });
  var c = l.show({ owner: "k", kind: "card", card: { title: "T", main: "sensor.a'; drop", color: "tim", entities: ents, rows: ["Hom nay: 18 kWh", { label: "Pin", value: "87 %", color: "green" }] } }, T0).card;
  assert.equal(c.main, ""); assert.equal(c.color, "red"); assert.equal(c.entities.length, 12);
  assert.ok(c.entities.every(function (e) { return /^[a-z_]+\.[a-z0-9_]+$/.test(e.entity); }));
  assert.deepEqual(c.rows[0], { label: "Hom nay", value: "18 kWh", color: "" }); assert.equal(c.rows[1].color, "green");
});
ok("bo cuc: o chia hang, khong chong lan, kin 100% chieu rong moi hang", function () {
  for (var n = 1; n <= 9; n++) {
    var r = L.layout(n, 0).cams; assert.equal(r.length, n);
    var area = 0; r.forEach(function (x) { area += x.width * x.height; assert.ok(x.left >= 0 && x.top >= 0 && x.left + x.width <= 100.0001 && x.top + x.height <= 100.0001); });
    assert.ok(Math.abs(area - 10000) < 0.01, "n=" + n + " phai phu kin man, dien tich " + area);
  }
  var both = L.layout(4, 3); assert.equal(both.cams.length, 4); assert.equal(both.cards.length, 3);
  assert.ok(both.cams.every(function (x) { return x.left + x.width <= 68.0001; }), "camera nam trai"); assert.ok(both.cards.every(function (x) { return x.left === 68; }), "the nam phai");
  var cardsOnly = L.layout(0, 4).cards; assert.equal(cardsOnly.length, 4); assert.equal(cardsOnly[0].width, 50);
});
ok("tham so the kieu Dosen: main_entity/value/caption/color/entities/rows va max_cams", function () {
  var p = L.parseParams({ cmd: "show", kind: "card", title: "Dien", main_entity: "sensor.cong_suat", caption: "Dang phat", color: "green", entities: ["sensor.nhiet_do"], max_cams: 4 });
  assert.equal(p.spec.card.main, "sensor.cong_suat"); assert.equal(p.spec.card.title, "Dien"); assert.equal(p.spec.max_cams, 4);
  var l = new L.Layers(); var layer = l.show(p.spec, T0); assert.equal(layer.kind, "card"); assert.equal(layer.card.entities[0].entity, "sensor.nhiet_do"); assert.equal(l.maxCams, 4);
});
ok("uu tien cao de len, go thi ve lop duoi", function () {
  var l = new L.Layers(); l.show({ owner: "cam", camera: "camera.a", priority: 2 }, T0);
  l.show({ owner: "bao", kind: "text", text: "Khan", priority: 4 }, T0);
  assert.deepEqual(owners(l, T0), ["bao"]);
  l.release("bao", T0); assert.deepEqual(owners(l, T0), ["cam"]);
});
ok("viec thap hon den sau KHONG de len viec cao hon", function () {
  var l = new L.Layers(); l.show({ owner: "cao", kind: "text", text: "x", priority: 3 }, T0); l.show({ owner: "thap", camera: "camera.a", priority: 1 }, T0 + 1);
  assert.deepEqual(owners(l, T0 + 1), ["cao"]);
});
ok("cung muc: chu moi nhat de len camera (khong chia doi voi chu)", function () {
  var l = new L.Layers(); l.show({ owner: "c", camera: "camera.a" }, T0); l.show({ owner: "t", kind: "text", text: "hi" }, T0);
  assert.deepEqual(owners(l, T0), ["t"]);
});
ok("het han: ttl giay, het thi ve lop duoi; het sach thi rong", function () {
  var l = new L.Layers(); l.show({ owner: "a", camera: "camera.a", ttl: 30 }, T0); l.show({ owner: "b", camera: "camera.b", priority: 3, ttl: 10 }, T0);
  assert.equal(l.expire(T0 + 9999).length, 0); assert.equal(l.expire(T0 + 10000).length, 1);
  assert.deepEqual(owners(l, T0 + 10000), ["a"]); assert.equal(l.expire(T0 + 30000).length, 1); assert.equal(l.size(), 0); assert.deepEqual(l.visible(T0), []);
});
ok("ttl 0 van co tran 1 gio (khong bao gio o mai); ttl lon bi cat", function () {
  var l = new L.Layers(); var a = l.show({ owner: "a", camera: "camera.a", ttl: 0 }, T0), b = l.show({ owner: "b", camera: "camera.b", ttl: 99999 }, T0);
  assert.equal(a.expires, T0 + 3600000); assert.equal(b.expires, T0 + 3600000);
  assert.equal(l.expire(T0 + 3600000).length, 2);
});
ok("release khong ten: go dung cac lop dang hien, giu lop duoi", function () {
  var l = new L.Layers(); l.show({ owner: "a", camera: "camera.a", priority: 1 }, T0); l.show({ owner: "b", camera: "camera.b", priority: 2 }, T0); l.show({ owner: "c", camera: "camera.c", priority: 2 }, T0);
  assert.equal(l.release("", T0).length, 2); assert.deepEqual(owners(l, T0), ["a"]);
});
ok("release/clear tren rong khong loi", function () { var l = new L.Layers(); assert.equal(l.release("x", T0).length, 0); assert.equal(l.release("", T0).length, 0); assert.equal(l.clear().length, 0); });
ok("split:false khong chia doi", function () {
  var l = new L.Layers(); l.show({ owner: "a", camera: "camera.a" }, T0); l.show({ owner: "b", camera: "camera.b", split: false }, T0);
  assert.deepEqual(owners(l, T0), ["b"]);
});
ok("do uu tien ve 1..4, kind suy ra tu truong, url video nhan ra", function () {
  var l = new L.Layers();
  assert.equal(l.show({ owner: "a", camera: "c", priority: 99 }, T0).priority, 4); assert.equal(l.show({ owner: "b", camera: "c", priority: -3 }, T0).priority, 1);
  assert.equal(l.show({ owner: "c", camera: "c", priority: "abc" }, T0).priority, 2); assert.equal(l.show({ owner: "d", text: "x" }, T0).kind, "text");
  assert.equal(l.show({ owner: "e", url: "http://h/a.m3u8?x=1" }, T0).kind, "video"); assert.equal(l.show({ owner: "f", url: "http://h/a.jpg" }, T0).kind, "image");
});
ok("tham so cu 1.0 (camera, timeout) van chay; lenh moi release/clear/connect", function () {
  var p = L.parseParams({ camera: "camera.dosen_pro_camera", timeout: 30, title: "Cua" });
  assert.equal(p.cmd, "show"); assert.equal(p.spec.ttl, 30); assert.equal(p.spec.camera, "camera.dosen_pro_camera");
  assert.equal(L.parseParams({ cmd: "release", owner: "x" }).owner, "x"); assert.equal(L.parseParams({ close: true }).cmd, "clear");
  var c = L.parseParams({ connect: { url: "http://h:8123/", token: "t" } }); assert.equal(c.connect.url, "http://h:8123"); assert.equal(c.cmd, "");
  assert.equal(L.parseParams({}).cmd, ""); assert.equal(L.parseParams(null).cmd, "");
  assert.equal(L.parseParams({ cmd: "show", camera: "camera.a", loop: "true", muted: "false" }).spec.loop, true);
});
console.log("layers: " + n + " dat");
