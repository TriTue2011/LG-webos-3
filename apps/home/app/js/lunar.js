/* Am lich Viet Nam (mui gio +7) tinh tai cho, khong can mang: thuat toan Ho Ngoc Duc (thien van, sai so dung cho 1900-2199). ES5.
 * LunarCal.solarToLunar(d,m,y) -> {day, month, year, leap}; LunarCal.canChiYear(y); LunarCal.canChiDay(d,m,y). */
(function (root) {
  "use strict";
  var PI = Math.PI, TZ = 7, floor = Math.floor;
  var CAN = ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"];
  var CHI = ["Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi"];
  function jdFromDate(dd, mm, yy) {
    var a = floor((14 - mm) / 12), y = yy + 4800 - a, m = mm + 12 * a - 3;
    var jd = dd + floor((153 * m + 2) / 5) + 365 * y + floor(y / 4) - floor(y / 100) + floor(y / 400) - 32045;
    if (jd < 2299161) { jd = dd + floor((153 * m + 2) / 5) + 365 * y + floor(y / 4) - 32083; }
    return jd;
  }
  function newMoon(k) {
    var T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = PI / 180;
    var Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
    var M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    var Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    var F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    var C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
    C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr) - 0.0004 * Math.sin(dr * 3 * Mpr);
    C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr)) - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
    C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr)) + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
    var dt = T < -11 ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3 : -0.000278 + 0.000265 * T + 0.000262 * T2;
    return Jd1 + C1 - dt;
  }
  function sunLongitude(jdn) {
    var T = (jdn - 2451545.0) / 36525, T2 = T * T, dr = PI / 180;
    var M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
    var L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
    var DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M) + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
    var L = L0 + DL - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * T) * dr);
    L = L * dr; return L - PI * 2 * floor(L / (PI * 2));
  }
  function sunLong(dayNumber) { return floor(sunLongitude(dayNumber - 0.5 - TZ / 24) / PI * 6); }
  function newMoonDay(k) { return floor(newMoon(k) + 0.5 + TZ / 24); }
  function lunarMonth11(yy) {
    var off = jdFromDate(31, 12, yy) - 2415021, k = floor(off / 29.530588853), nm = newMoonDay(k);
    if (sunLong(nm) >= 9) { nm = newMoonDay(k - 1); }
    return nm;
  }
  function leapMonthOffset(a11) {
    var k = floor((a11 - 2415021.076998695) / 29.530588853 + 0.5), last = 0, i = 1, arc = sunLong(newMoonDay(k + i));
    do { last = arc; i++; arc = sunLong(newMoonDay(k + i)); } while (arc !== last && i < 14);
    return i - 1;
  }
  function solarToLunar(dd, mm, yy) {
    var dayNumber = jdFromDate(dd, mm, yy), k = floor((dayNumber - 2415021.076998695) / 29.530588853);
    // thang chua ngay nay = lan trang non CUOI CUNG khong sau ngay do (uoc luong k co the lech 1 o vai ngay xa: 2054-05-07, 2062-04-09 ra «ngay 0»)
    while (newMoonDay(k + 1) <= dayNumber) { k++; }
    var monthStart = newMoonDay(k); while (monthStart > dayNumber) { k--; monthStart = newMoonDay(k); }
    var a11 = lunarMonth11(yy), b11 = a11, lunarYear;
    if (a11 >= monthStart) { lunarYear = yy; a11 = lunarMonth11(yy - 1); } else { lunarYear = yy + 1; b11 = lunarMonth11(yy + 1); }
    var lunarDay = dayNumber - monthStart + 1, diff = floor((monthStart - a11) / 29), leap = 0, lunarMonth = diff + 11;
    if (b11 - a11 > 365) {
      var lm = leapMonthOffset(a11);
      if (diff >= lm) { lunarMonth = diff + 10; if (diff === lm) { leap = 1; } }
    }
    if (lunarMonth > 12) { lunarMonth -= 12; }
    if (lunarMonth >= 11 && diff < 4) { lunarYear -= 1; }
    return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: leap };
  }
  function canChiYear(y) { return CAN[(y + 6) % 10] + " " + CHI[(y + 8) % 12]; }
  function canChiDay(dd, mm, yy) { var jd = jdFromDate(dd, mm, yy); return CAN[(jd + 9) % 10] + " " + CHI[(jd + 1) % 12]; }
  root.LunarCal = { solarToLunar: solarToLunar, canChiYear: canChiYear, canChiDay: canChiDay };
}(typeof window !== "undefined" ? window : this));
