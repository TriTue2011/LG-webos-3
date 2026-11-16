"use strict";
var assert = require("assert"), F = require("../src/js/cardfmt.js"), n = 0;
function ok(name, fn) { fn(); n++; console.log("dat  " + name); }
ok("so kieu Viet: dau phay, 1 so le, >=100 lam tron nguyen", function () {
  assert.equal(F.formatNumber(3.4), "3,4"); assert.equal(F.formatNumber(18.0), "18"); assert.equal(F.formatNumber(123.6), "124"); assert.equal(F.formatNumber(-2.5), "-2,5"); assert.equal(F.formatNumber(0), "0");
});
ok("cam bien so kem don vi; thieu/unknown/unavailable la «—»", function () {
  assert.deepEqual(F.formatEntity({ entity: "sensor.nhiet", name: "Nhiet do", state: "27.34", unit: "°C" }), { label: "Nhiet do", text: "27,3 °C", color: "" });
  ["unknown", "unavailable", "", "None"].forEach(function (s) { assert.equal(F.formatEntity({ entity: "sensor.x", state: s }).text, "—"); });
});
ok("binary_sensor theo device_class: co nguoi xanh la, cua mo cam, khoi do", function () {
  assert.deepEqual(F.formatEntity({ entity: "binary_sensor.a", name: "A", state: "on", deviceClass: "occupancy" }), { label: "A", text: "Có người", color: "green" });
  assert.equal(F.formatEntity({ entity: "binary_sensor.c", state: "on", deviceClass: "door" }).color, "orange");
  assert.equal(F.formatEntity({ entity: "binary_sensor.k", state: "on", deviceClass: "smoke" }).text, "CÓ KHÓI");
  assert.equal(F.formatEntity({ entity: "binary_sensor.c", state: "off", deviceClass: "door" }).text, "Đóng");
  assert.equal(F.formatEntity({ entity: "binary_sensor.z", state: "on", deviceClass: "" }).text, "Bật");
});
ok("den/cong tac bat tat, trang thai chu quen thuoc, chu la giu nguyen", function () {
  assert.equal(F.formatEntity({ entity: "light.den", state: "on" }).text, "Bật"); assert.equal(F.formatEntity({ entity: "switch.s", state: "off" }).text, "Tắt");
  assert.equal(F.formatEntity({ entity: "person.a", state: "home" }).text, "Ở nhà"); assert.equal(F.formatEntity({ entity: "lock.k", state: "unlocked" }).color, "red");
  assert.equal(F.formatEntity({ entity: "sensor.mode", state: "Eco" }).text, "Eco");
});
ok("template chi nhan entity_id hop le, khong trung, khong the tiem ma", function () {
  var t = F.template(["sensor.a", "sensor.a", "x}}{% evil", "light.b'] %}", "Sensor.C", "sensor.ok_2"]);
  assert.ok(t.indexOf("['sensor.a','sensor.ok_2']") >= 0, t); assert.ok(t.indexOf("evil") < 0 && t.indexOf("light.b") < 0);
  assert.equal(F.template(["rac"]), "", "khong co thuc the hop le thi khong co template");
});
ok("phan tich dau ra template (nhieu dong, ten co dau)", function () {
  var S = F.SEP, r = F.parseRows("sensor.a" + S + "Nhệt độ" + S + "27.3" + S + "°C" + S + "temperature\nlight.b" + S + "Đèn" + S + "on" + S + "" + S + "\n");
  assert.equal(r["sensor.a"].name, "Nhệt độ"); assert.equal(r["sensor.a"].unit, "°C"); assert.equal(r["light.b"].state, "on");
});
console.log("cardfmt: " + n + " dat");
