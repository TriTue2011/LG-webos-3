/* Dinh dang gia tri thuc the cho THE thong tin — cung quy tac voi dosen_pro/card.py (so kieu Viet, «Co nguoi», «Mo/Dong»...). Ham thuan, ES5. */
(function (root) {
  "use strict";

  var UNKNOWN = { "unknown": 1, "unavailable": 1, "none": 1, "": 1 };
  var NO_VALUE = "—";

  // device_class cua binary_sensor -> [chu khi bat, mau khi bat, chu khi tat]
  var BINARY = {
    occupancy: ["Có người", "green", "Trống"], presence: ["Có người", "green", "Trống"],
    motion: ["Có chuyển động", "green", "Yên"], moving: ["Đang động", "green", "Yên"],
    door: ["Mở", "orange", "Đóng"], window: ["Mở", "orange", "Đóng"], opening: ["Mở", "orange", "Đóng"], garage_door: ["Mở", "orange", "Đóng"],
    lock: ["Mở khoá", "red", "Đã khoá"], smoke: ["CÓ KHÓI", "red", "Bình thường"], gas: ["CÓ GAS", "red", "Bình thường"],
    moisture: ["Ẩm ướt", "blue", "Khô"], problem: ["Có sự cố", "red", "Bình thường"], safety: ["Nguy hiểm", "red", "An toàn"],
    tamper: ["Bị phá", "red", "Bình thường"], battery: ["Pin yếu", "red", "Pin tốt"], connectivity: ["Đã kết nối", "green", "Mất kết nối"],
    plug: ["Đang cắm", "green", "Rút"], power: ["Có điện", "green", "Mất điện"], light: ["Có sáng", "orange", "Tối"],
    sound: ["Có tiếng", "orange", "Yên"], vibration: ["Rung", "orange", "Yên"]
  };
  var ON_OFF = ["Bật", "green", "Tắt"];
  var TEXT = { home: ["Ở nhà", "green"], not_home: ["Vắng", ""], open: ["Mở", "orange"], closed: ["Đóng", ""], locked: ["Đã khoá", ""], unlocked: ["Mở khoá", "red"] };
  var ONOFF_DOMAINS = { "switch": 1, light: 1, fan: 1, input_boolean: 1, siren: 1, humidifier: 1 };

  /* So kieu Viet: dau phay thap phan, toi da 1 so le (>= 100 thi lam tron nguyen). */
  function formatNumber(v) {
    var t = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
    if (/\.0$/.test(t)) { t = t.slice(0, -2); }
    return t.replace(".", ",");
  }

  /* row: {entity, name, state, unit, deviceClass} (tu mau HA) -> {label, text, color}. Thieu / unknown -> «—». */
  function formatEntity(row) {
    var label = row.name || row.entity, raw = String(row.state === undefined || row.state === null ? "" : row.state);
    if (UNKNOWN[raw.toLowerCase()]) { return { label: label, text: NO_VALUE, color: "" }; }
    var domain = String(row.entity || "").split(".")[0], t;
    if (domain === "binary_sensor" && (raw === "on" || raw === "off")) {
      t = BINARY[row.deviceClass] || ON_OFF;
      return raw === "on" ? { label: label, text: t[0], color: t[1] } : { label: label, text: t[2], color: "" };
    }
    if (ONOFF_DOMAINS[domain] && (raw === "on" || raw === "off")) { return raw === "on" ? { label: label, text: ON_OFF[0], color: ON_OFF[1] } : { label: label, text: ON_OFF[2], color: "" }; }
    if (TEXT[raw]) { return { label: label, text: TEXT[raw][0], color: TEXT[raw][1] }; }
    var n = parseFloat(raw);
    if (!isNaN(n) && isFinite(raw)) { return { label: label, text: formatNumber(n) + (row.unit ? " " + row.unit : ""), color: "" }; }
    return { label: label, text: raw, color: "" };
  }

  /* Phan tich dau ra cua template (moi dong: entity§ten§trang_thai§don_vi§device_class). */
  var SEP = "§";
  function parseRows(text) {
    var out = {}, lines = String(text || "").split("\n"), i, p;
    for (i = 0; i < lines.length; i++) {
      p = lines[i].split(SEP);
      if (p.length >= 5 && p[0]) { out[p[0]] = { entity: p[0], name: p[1], state: p[2], unit: p[3], deviceClass: p[4] }; }
    }
    return out;
  }

  /* Template HA (chi nhan entity_id da kiem tra) tra ve cac dong tren; HA tu day lai khi bat ky thuc the nao doi. */
  var ENTITY_RE = /^[a-z_]+\.[a-z0-9_]+$/;
  function template(ids) {
    var safe = [], i;
    for (i = 0; i < ids.length; i++) { if (ENTITY_RE.test(ids[i]) && safe.indexOf(ids[i]) < 0) { safe.push(ids[i]); } }
    if (!safe.length) { return ""; }
    var list = "['" + safe.join("','") + "']";
    return "{% for e in " + list + " %}{% set s = expand(e) | selectattr('entity_id', 'eq', e) | first | default(none) %}" +
      "{{ e }}" + SEP + "{{ s.name if s else e }}" + SEP + "{{ s.state if s else '' }}" + SEP + "{{ s.attributes.unit_of_measurement if s and s.attributes.unit_of_measurement else '' }}" + SEP +
      "{{ s.attributes.device_class if s and s.attributes.device_class else '' }}\n{% endfor %}";
  }

  var api = { formatNumber: formatNumber, formatEntity: formatEntity, parseRows: parseRows, template: template, SEP: SEP, NO_VALUE: NO_VALUE };
  root.CardFmt = api;
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : this);
