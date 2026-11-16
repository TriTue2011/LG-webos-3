# LG webOS 3 — app cho tivi đời 2016 (Developer Mode, không root)

Bộ app và công cụ chạy trên **tivi LG webOS 3.x** (đã đo trên **49UH617T**, firmware 05.70.50, trình duyệt Chromium 38) bằng chế độ **Developer Mode**, **không cần root**.

| Thành phần | Làm gì |
|---|---|
| [`apps/home`](apps/home) — **Màn hình chính** (`com.viet.home`) | Màn chọn app kiểu Android TV / Apple TV: lưới app (có Developer Mode để bấm EXTEND), nguồn vào HDMI/AV, đồng hồ, **âm lịch** (tính ngay trên tivi) và **thời tiết** (Home Assistant đưa vào), nút **Thoát** và công tắc **Tự về đây**. Kèm blueprint Home Assistant mở nó khi bật tivi hoặc thoát app. Tự đóng sau khi mở app khác. |
| [`apps/livecam`](apps/livecam) — **Live Cam** (`com.viet.livecam`) | Nhiều camera trực tiếp + nhiều thẻ thông tin cùng lúc trên tivi lớn, điều khiển từ Home Assistant. |
| [`tools/giu_app_tv.sh`](tools/giu_app_tv.sh) — **bộ canh app** | Tivi hay «quên» app Dev Mode sau khi khởi động lại; bộ canh tự cài lại. |
| [`dist/`](dist) | Gói `.ipk` đã đóng sẵn. |

## Giới hạn thật của webOS 3 không root (đã đo trên tivi, không phải suy đoán)

- **Không thay được màn Home của LG hay nút Home trên remote.** Hai dự án [cleanyourtv-WebOS](https://github.com/lasharor/cleanyourtv-WebOS) và [clean-your-tv-lg-webos](https://github.com/Razdva122/clean-your-tv-lg-webos) làm được vì cần webOS 5+ và root. Ở đây «bật tivi là hiện màn chọn app» làm bằng cách để Home Assistant mở app ngay sau khi tivi bật.
- App thường **bị cấm** liệt kê app (`applicationManager/listApps`, `listLaunchPoints`, `running`, `getForegroundAppInfo` trả «Denied method call»). Vì vậy danh sách ô của Màn hình chính nằm trong `apps/home/app/js/config.js`. **Mở** app theo `id` thì được (`applicationManager/launch`).
- App thường **ghi được** một số cài đặt hệ thống qua `luna://com.webos.settingsservice/setSystemSettings` (đã thử với `general.homePromotion`, `adCookie`, `lmt`).
- Trình duyệt là **Chromium 38**: mã phải là **ES5** (không `=>`, `let`, `async`, `fetch`, `Object.assign`…), CSS không có `grid`, biến `--x`, `vh`.

## Cài đặt

### 1. Bật Developer Mode trên tivi
1. Tạo tài khoản LG Developer (miễn phí) tại [webostv.developer.lge.com](https://webostv.developer.lge.com) và đăng nhập tivi bằng nó.
2. Từ **LG Content Store** cài app **Developer Mode**, mở app, đăng nhập, bật **Dev Mode Status** và **Key Server**. Màn này hiện **địa chỉ IP**, **passphrase** và **thời gian phiên còn lại** (thường 1000 giờ).
3. Hết phiên thì tivi **xoá app Dev Mode**: định kỳ mở app Developer Mode và bấm **EXTEND**.

### 2. Cài công cụ ares trên máy tính
```sh
npm install -g @webos-tools/cli
ares-setup-device --add tv -i "host=<IP tivi>" -i "port=9922" -i "username=prisoner"
ares-novacom --device tv --getkey        # nhập passphrase hiện trên màn Developer Mode
ares-device-info --device tv             # kiểm tra: phải in thông tin tivi
```

### 3. Cài app
```sh
ares-install --device tv dist/com.viet.home_1.1.1_all.ipk
ares-launch  --device tv com.viet.home
```
Live Cam (tuỳ chọn): `ares-install --device tv dist/com.viet.livecam_1.3.1_all.ipk` (ô Live Cam trong Màn hình chính báo «chưa được cài» nếu bỏ qua bước này), mở app **một lần** để nhập địa chỉ Home Assistant + token (nên dùng một người dùng HA riêng chỉ có quyền xem camera). Chi tiết: [`apps/livecam/README.md`](apps/livecam/README.md).

YouTube không quảng cáo (tuỳ chọn, bên thứ ba, không kèm trong repo): lấy gói `youtube.leanback.v4_*_all.ipk` từ bản phát hành chính thức của [webosbrew/youtube-webos](https://github.com/webosbrew/youtube-webos/releases), kiểm sha256 theo trang phát hành rồi `ares-install` như trên.

Xem app đã cài: `ares-install --device tv --list`. Gỡ: `ares-install --device tv --remove <id>`.

### 4. Bật tivi / thoát app là về Màn hình chính (tuỳ chọn)
Cần tivi đã thêm vào Home Assistant bằng tích hợp **LG webOS TV** (thực thể có thuộc tính `app_id`). Chép [`apps/home/blueprints/lg_man_hinh_chinh_khi_bat_tivi.yaml`](apps/home/blueprints/lg_man_hinh_chinh_khi_bat_tivi.yaml) vào `config/blueprints/automation/`, tạo automation từ blueprint, chọn tivi.
- **① TV vừa bật** (`off`/`unavailable` → `on`): đợi (mặc định 12 giây) rồi mở Màn hình chính.
- **② Thoát một app trong danh sách «App quản lý»** (YouTube, SS IPTV, Live Cam…): khi TV rơi về nguồn nền (HDMI/truyền hình) thì mở lại Màn hình chính, trễ ~2 giây. Chuyển app sang app khác, bấm nút **Input**, hoặc chính Màn hình chính mở lên thì **không** bị chen vào.

**Nút Home trên remote không thay được** (đo trên tivi thật): thanh chọn app của LG chỉ là lớp phủ đè lên app đang chạy, `app_id` không đổi nên Home Assistant không biết bạn vừa bấm Home. Muốn vào Màn hình chính từ thanh đó, chọn thẻ «Màn hình chính». Làm được vì tivi báo `app_id` đổi và Home Assistant mở đè app; **không bắt được phím Back bên trong app khác** (cần root; nhiều app cũng phải Back vài lượt mới thoát hẳn, blueprint chỉ phản ứng khi app thật sự thoát).

**Thời tiết và âm lịch trên Màn hình chính.** Home Assistant đưa dữ liệu vào lúc mở app (tham số mở app, đã kiểm trên tivi thật cả mở lạnh lẫn mở lại khi app đang chạy), tivi không giữ token và không giữ kết nối. App nhớ lần gần nhất (ghi «cập nhật HH:MM», «đã cũ» sau 3 giờ). **Ngày âm lịch luôn do tivi tự tính** (`app/js/lunar.js`, kiểm với giá trị Home Assistant, mùng 1 Tết 2024–2026, tháng nhuận 2023, quét 80 năm), nên không bao giờ sai ngày; cảm biến âm lịch chỉ bổ sung tiết khí và ngày lễ (chỉ hiện khi còn đúng ngày). Chọn `thoi_tiet` (thực thể `weather.*`) và `am_lich` (cảm biến có `tiet_khi`, `solar_holiday`, `lunar_holiday`) trong blueprint.

**Công tắc «Tự về đây» (nút trên tivi):** BẬT = Home Assistant mở Màn hình chính khi bật tivi / thoát app; TẮT = tivi chạy mặc định của LG. Tivi gửi lệnh bằng **webhook** (không cần token): tạo automation có **hai** trigger `webhook` (`<id>-on` và `<id>-off`, `allowed_methods: [POST]`, `local_only: true`, ID dài ngẫu nhiên) gọi `automation.turn_on` / `automation.turn_off` cho automation blueprint, chọn nhánh bằng `trigger.id` (**đừng** dùng `trigger.query`: Home Assistant 2026.11.1 báo lỗi `MultiDict keys…` trong mẫu, test giả lập không lộ ra), rồi điền `ha_url` + `webhook_id` vào blueprint (mẫu và test: `apps/home/tests/test_blueprint.py`). Nút **Thoát** đóng Màn hình chính về nguồn đang xem. Công tắc chỉ điều khiển phần tự động; **nút Home vẫn là thanh LG**.

Chuỗi `app_id` đo thật: thoát bằng **Exit**: `youtube… → livetv` (không qua trạng thái trống); thoát Màn hình chính bằng **Back**: `com.viet.home → '' → nguồn nền`. **Back** trong YouTube chỉ lùi trang trong app (không thoát).

### 5. Chống mất app sau khi tắt / rút điện
**Hiện tượng đã đo:** sau khi tivi khởi động lại, `ares-install --list` **rỗng** dù tệp app vẫn nằm trong `/media/developer/apps/...`: tivi mất *đăng ký*, không mất tệp. Cài lại bằng `ares-install` là hiện lại. Nguyên nhân gốc **chưa xác định** (mới quan sát một lần trên một tivi).

**Đã gặp lại 16/11:** sau khi tivi tắt/bật nguội (HA thấy `off` → `unavailable` → `on` trong ~50 giây), `ares-install --list` thiếu YouTube dù tệp còn nguyên; Màn hình chính và Live Cam (cài sau) vẫn còn. Bộ canh phát hiện và cài lại YouTube trong 4 giây.

**Cách chữa:** `tools/giu_app_tv.sh` chạy định kỳ trên một máy luôn bật cùng mạng (mini PC, NAS, Raspberry Pi, máy Home Assistant). Nó chỉ **cài lại gói còn thiếu** trong thư mục `ipk/` (tên `<id>_<phienban>_all.ipk`), không bao giờ gỡ app; tivi tắt thì im lặng bỏ qua; không liệt kê được thì không đoán.

```sh
mkdir -p /opt/tv-apps/ipk && cp tools/giu_app_tv.sh /opt/tv-apps/ && cp dist/*.ipk /opt/tv-apps/ipk/    # chỉ chép gói bạn muốn giữ
cp tools/giu_app_tv.env.example /opt/tv-apps/giu_app_tv.env && chmod 600 /opt/tv-apps/giu_app_tv.env   # sửa TV_HOST (+ ARES_HOME/ARES_BIN nếu cần)
/opt/tv-apps/giu_app_tv.sh --kiem-tra       # chỉ báo thiếu gì, chưa cài
sudo cp tools/giu-app-tv.service tools/giu-app-tv.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now giu-app-tv.timer
```
Chu kỳ 5 phút (mỗi lần chỉ mở một kết nối SSH ngắn tới tivi khi cổng 9922 đang mở). Nhật ký: `/opt/tv-apps/giu_app_tv.log`. Dự kiến sau khi tivi bật lại, app hiện lại trong vài phút (chu kỳ 5 phút; **chưa đo** với bộ hẹn giờ thật).

**Bộ canh KHÔNG làm được:** gia hạn phiên Developer Mode (phải bấm EXTEND trên tivi), và cài lại khi Developer Mode đã tắt hoặc phiên đã hết (cổng 9922 đóng).

## Tài nguyên của tivi — số đo thật (49UH617T, 1,1 GB RAM, 4 lõi ARM, Chromium 38 vẽ bằng **phần mềm**)

Đo bằng `ares-novacom --run` đọc `/proc` (CPU theo tiến trình trong 5 giây; 400% = đầy cả 4 lõi). Trạng thái nền đang xem truyền hình: CPU ~85–100% của một lõi (chủ yếu `tvservice` ~48%), bộ nhớ trống chỉ ~50–100 MB (có swap), tải trung bình đứng ở ~15,7 (mức nền của tivi này, không phải do app).

| Tình huống | Kết quả đo |
|---|---|
| **Màn hình chính** đang mở (đứng yên) | ~+30 MB RAM, CPU gần như không đáng kể |
| YouTube chạy | ~190% CPU |
| 1 ô 640×480 nạp lại **1 khung/giây** | ~+140% CPU |
| 1 ô 640×480 **5** khung/giây | ~370% |
| 1 ô 640×480 **15** khung/giây | ~500% (chạm trần 400%) |
| 2 ô 1080p, 5 khung/giây mỗi ô | ~400% |
| 4 và 6 ô (1080p hoặc 640×480), 5 khung/giây mỗi ô | ~470–480%, **vẫn nhận đủ 5 khung/giây mỗi ô** |

**Kết luận:** chi phí tăng theo **số khung hình cập nhật mỗi giây**, rất ít theo số ô, và chạm trần rất sớm (vài khung/giây đã gần hết CPU). Vì vậy Live Cam mặc định chỉ **2 camera** (`max_cams`), và nên dùng luồng phụ độ phân giải thấp, tốc độ khung thấp. Phương pháp: ảnh JPEG tổng hợp (cùng kích thước ảnh camera thật: 1080p ~108 KB, 2688×1664 ~258 KB, 640×480 ~25 KB) nạp lại liên tục trong một app dò; **chưa đo** MJPEG/HLS thật từ Home Assistant (go2rtc ở đây không phát MJPEG), nên chi phí thật có thể khác.

**Thoát app không giải phóng bộ nhớ:** sau khi thoát YouTube bằng Exit, tiến trình của nó (~92 MB) vẫn nằm lại ít nhất 65 giây — webOS giữ app «gần đây» và chỉ dọn khi thiếu RAM. Lệnh đóng app (`system.launcher/close`) bị tivi từ chối (403) với khoá ghép nối thường. Màn hình chính vì vậy **tự đóng** sau khi mở app khác (nếu không, nó cũng nằm lại như một thẻ trong thanh chọn app).

## Kiểm thử
- `apps/home`: `python3 tests/e2e_chrome.py` (Chrome thật 1920×1080 + `PalmServiceBridge` giả, 37 ý), `node tests/test_lunar.js` (13 ý), `tests/test_blueprint.py` (cần Home Assistant + `pytest-homeassistant-custom-component`, 21 ý).
- `apps/livecam`: `node tests/test_layers.js`, `node tests/test_cardfmt.js`, `python3 tests/e2e_chrome.py`, `tests/test_blueprint.py`.
- `tools/giu_app_tv.sh`: thử trên tivi thật: thư mục gói rỗng, đủ app, thiếu app (báo), cài lại thật, chạy lại (không còn thiếu), tivi tắt (im lặng).
- Cú pháp ES5: `acorn` với `ecmaVersion: 5`.

## Chưa kiểm
- Màn hình chính tự mở khi bật tivi thật và khi thoát app thật; app còn sau khi tắt/rút điện *khi có bộ canh*.
- Mở **Cài đặt** của LG bằng `applicationManager/launch` từ xa (không thấy đổi app tiền cảnh).
- Lưu ý đóng gói: `ares-install` chỉ nhận gói do `ares-package` tạo; mọi `build.sh`/`build_ipk.sh` ở đây dùng `ares-package` (bản đầu của Live Cam đóng tay bằng `ar` bị tivi từ chối, đã thay).
- Live Cam phát camera trên tivi thật; gói `popup` (kiểu cửa sổ `overlay` không có trong tài liệu LG).
