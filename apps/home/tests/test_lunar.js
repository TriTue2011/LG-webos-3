/* Am lich tinh tai cho: doi chieu voi gia tri THAT cua Home Assistant (sensor.am_lich_hang_ngay) va cac moc da biet. */
var assert = require("assert"), vm = require("vm"), fs = require("fs");
var ctx = { }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + "/../app/js/lunar.js", "utf8"), ctx);
var L = ctx.LunarCal, n = 0;
function eq(d, m, y, ld, lm, ly, leap, what) {
  var r = L.solarToLunar(d, m, y);
  assert.deepStrictEqual([r.day, r.month, r.year, r.leap], [ld, lm, ly, leap], what + ": " + d + "/" + m + "/" + y + " -> " + JSON.stringify(r)); n++;
}
eq(16, 11, 2026, 8, 10, 2026, 0, "HA 16/11/2026 = 08/10/2026 (sensor.am_lich_hang_ngay)");
eq(17, 2, 2026, 1, 1, 2026, 0, "mung 1 Tet Binh Ngo");
eq(16, 2, 2026, 29, 12, 2025, 0, "29 thang Chap At Ty = giao thua (thang thieu, khong co 30)");
eq(29, 1, 2025, 1, 1, 2025, 0, "mung 1 Tet At Ty");
eq(22, 1, 2023, 1, 1, 2023, 0, "mung 1 Tet Quy Mao");
eq(22, 3, 2023, 1, 2, 2023, 1, "thang 2 NHUAN nam 2023");
eq(21, 3, 2023, 30, 2, 2023, 0, "ngay cuoi thang 2 truoc thang nhuan");
eq(10, 2, 2024, 1, 1, 2024, 0, "mung 1 Tet Giap Thin");
eq(1, 1, 2026, 13, 11, 2025, 0, "1/1 duong lich 2026 = 13 thang 11 am lich 2025 (tinh nguoc tu mung 1 Tet, thang Chap 29 ngay)");
assert.equal(L.canChiYear(2026), "Bính Ngọ"); n++;
assert.equal(L.canChiYear(2025), "Ất Tỵ"); n++;
assert.equal(L.canChiDay(16, 11, 2026), "Giáp Ngọ", "can chi ngay khop sensor.thong_tin_am_lich"); n++;
// quet 1900..2100: ngay am luon 1..30, thang 1..12, va 2 ngay lien tiep khong nhay coc
var prev = null, bad = 0, d0 = new Date(Date.UTC(1990, 0, 1));
for (var i = 0; i < 365 * 80; i++) {
  var d = new Date(d0.getTime() + i * 86400000), r = L.solarToLunar(d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear());
  if (r.day < 1 || r.day > 30 || r.month < 1 || r.month > 12) { bad++; }
  if (prev && !(r.day === prev.day + 1 && r.month === prev.month || r.day === 1)) { bad++; }
  prev = r;
}
assert.equal(bad, 0, "co " + bad + " ngay am lich bat thuong trong 80 nam"); n++;
console.log("lunar: " + n + " dat");
