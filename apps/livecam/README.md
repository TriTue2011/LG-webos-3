# Live Cam 1.3 cho TV LG webOS — màn hình như màn Dosen: nhiều camera + nhiều thẻ cùng lúc

Cùng mô hình với `dosen_pro.screen_show` / `screen_card`: HA mở app kèm các «việc»; việc có **loại** (camera / thẻ / ảnh / video / chữ), **mức ưu tiên** 1–4, **thời gian giữ**, **tên lớp**. TV 49 inch hiển thị **nhiều camera trực tiếp và nhiều thẻ cùng lúc**.

| Luật | Cách chạy |
|---|---|
| Cùng tên lớp | thay nhau |
| Khác tên lớp | xếp chồng |
| Ưu tiên cao hơn | luôn ở trên |
| Cùng mức | việc đến sau đè lên |
| Camera + thẻ cùng mức trên cùng | **đứng chung màn**: lưới camera (1→1×1, 2→2×1, 3→2+1, 4→2×2, 5→3+2, 6→3×2…, tối đa 9, mặc định 6; `max_cams`) bên trái, thẻ xếp dọc bên phải (mặc định 4; `max_cards`); chỉ camera thì lưới chiếm cả màn, chỉ thẻ thì thẻ chiếm cả màn. Nhiều hơn giới hạn thì đổi trang mỗi 5 giây |
| Việc mới nhất là ảnh / video / chữ | hiện một mình, che camera và thẻ |
| Hết hạn hoặc bấm Back | về lớp dưới |
| Hết sạch | app tự đóng, TV trở lại nội dung đang xem |
| Trần | mọi việc tối đa 1 giờ, dù để thời gian = 0 |

## Cài

```
ares-install --device tv com.viet.livecam_1.3.0_all.ipk
```

Mở app từ danh sách app trên TV **một lần** để nhập địa chỉ HA + token. Nên tạo một người dùng HA riêng chỉ có quyền xem camera (token lưu dạng chữ trong bộ nhớ TV).

## Lệnh (launchParams)

```json
{"items": [
  {"cmd": "show", "kind": "camera", "camera": "camera.cua", "owner": "nguoi_o_cua", "priority": 3, "ttl": 20, "title": "Cửa"},
  {"cmd": "show", "kind": "card", "owner": "dien", "title": "Điện", "main_entity": "sensor.cong_suat", "caption": "Đang phát", "color": "orange",
   "entities": ["sensor.nhiet_do", "binary_sensor.cua"], "rows": ["Chế độ: Ở nhà"]},
  {"cmd": "show", "kind": "text", "owner": "khan", "priority": 4, "title": "Khẩn", "text": "Có người ở cửa"}
]}
```

- **Thẻ** (như `screen_card`): `main_entity` (số lớn) + `caption` + `color` (`red|green|blue|orange|black`) + `entities` (mỗi thực thể một dòng; chữ tiếng Việt như «Có người», «Mở/Đóng», số dùng dấu phẩy) + `rows` (dòng tĩnh «Nhãn: giá trị»). **Giá trị thực thể cập nhật trực tiếp** (một template `render_template`, không lấy cả danh sách thực thể).
- `cmd`: `show` (mặc định khi có `camera`/`url`/`text`), `release` (gỡ lớp `owner`; trống = gỡ lớp đang hiện), `clear` (gỡ hết và thoát).
- Một lần mở có thể mang **nhiều việc** (`items`): hai lần mở liền nhau có thể mất lần sau khi app đang khởi động.
- Tham số cũ của bản 1.0 (`camera`, `url`, `title`, `timeout`, `format`, `muted`) vẫn chạy.
- Từ HA: dịch vụ `webostv.command`, `command: com.webos.applicationManager/launch`, `payload: {id: com.viet.livecam, params: {...}}`. Blueprint `blueprints/lg_livecam_man_hinh_nhieu_viec.yaml` làm sẵn việc này (cùng cách khai với blueprint Dosen).

## Tài nguyên (so với 1.0)

- Không còn `get_states` (toàn bộ thực thể HA, vài MB): danh sách camera lấy bằng `render_template` nhỏ; tên camera do HA gửi sẵn.
- `hls.js` (240 KB) chỉ nạp khi HLS gốc của TV thất bại; bộ đệm giới hạn (8–12 s, 10 MB, giữ lại 5 s).
- Ô thứ hai trở đi chỉ dùng MJPEG (TV thường chỉ có một bộ giải mã video phần cứng).
- Lớp bị che hoặc app bị ẩn thì nhả luồng ngay; chữ ký MJPEG chỉ sống bằng thời gian giữ + 60 giây (không phải 24 giờ).
- Chờ khung đầu 15 giây cho HLS (HA thường mất 5–10 giây), có canh đứng hình giữa chừng.
- Thoát là đóng WebSocket, mọi luồng và bộ hẹn giờ.

## Kiểm thử

```
node tests/test_layers.js            # luật lớp, lưới, thẻ (hàm thuần)
node tests/test_cardfmt.js           # định dạng giá trị thẻ
python3 tests/e2e_chrome.py          # Chrome thật + HA giả: lớp, chia đôi, đếm kết nối MJPEG/WS còn mở sau mỗi bước
./build_ipk.sh 1.3.0                 # đóng gói gói đầy màn hình (com.viet.livecam)
./build_ipk.sh 1.3.0 popup           # gói cửa sổ góc THỬ NGHIỆM (com.viet.livecam.popup, defaultWindowType=overlay)
```

Chưa có: băng chuyền (`screen_carousel`), màn mặc định (đồng hồ) — app đóng thì TV trở lại nội dung đang xem.

**Tương thích TV webOS 3 (Chromium 38):** toàn bộ mã `src/js` (trừ `lib/hls.min.js`, thư viện hls.js giấy phép Apache-2.0) qua kiểm cú pháp ES5 (acorn `ecmaVersion: 5`), không dùng CSS grid/biến/`vh`. Kiểm bằng Chrome 150 (không phải Chromium 38).

**Chưa kiểm trên TV thật:** phát camera (HLS gốc của webOS đời cũ có thể không phát HLS fMP4 của HA; app tự chuyển MJPEG) và gói `popup` (kiểu cửa sổ `overlay` là mẹo không có trong tài liệu LG; TV có thể từ chối và hiện toàn màn hình).
