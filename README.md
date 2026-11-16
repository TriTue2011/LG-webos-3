# LG webOS 3 — app cho tivi đời 2016 (Developer Mode, không root)

Bộ app và công cụ chạy trên **tivi LG webOS 3.x** (đã đo trên **49UH617T**, firmware 05.70.50, trình duyệt Chromium 38) bằng chế độ **Developer Mode**, **không cần root**.

| Thành phần | Làm gì |
|---|---|
| [`apps/home`](apps/home) — **Màn hình chính** (`com.viet.home`) | Màn chọn app kiểu Android TV / Apple TV: lưới app, nguồn vào HDMI/AV, đồng hồ. Kèm blueprint Home Assistant mở nó khi bật tivi. |
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
ares-install --device tv dist/com.viet.home_1.0.0_all.ipk
ares-launch  --device tv com.viet.home
```
Live Cam (tuỳ chọn): `ares-install --device tv dist/com.viet.livecam_1.3.0_all.ipk` (ô Live Cam trong Màn hình chính báo «chưa được cài» nếu bỏ qua bước này), mở app **một lần** để nhập địa chỉ Home Assistant + token (nên dùng một người dùng HA riêng chỉ có quyền xem camera). Chi tiết: [`apps/livecam/README.md`](apps/livecam/README.md).

YouTube không quảng cáo (tuỳ chọn, bên thứ ba, không kèm trong repo): lấy gói `youtube.leanback.v4_*_all.ipk` từ bản phát hành chính thức của [webosbrew/youtube-webos](https://github.com/webosbrew/youtube-webos/releases), kiểm sha256 theo trang phát hành rồi `ares-install` như trên.

Xem app đã cài: `ares-install --device tv --list`. Gỡ: `ares-install --device tv --remove <id>`.

### 4. Bật tivi / thoát app là về Màn hình chính (tuỳ chọn)
Cần tivi đã thêm vào Home Assistant bằng tích hợp **LG webOS TV** (thực thể có thuộc tính `app_id`). Chép [`apps/home/blueprints/lg_man_hinh_chinh_khi_bat_tivi.yaml`](apps/home/blueprints/lg_man_hinh_chinh_khi_bat_tivi.yaml) vào `config/blueprints/automation/`, tạo automation từ blueprint, chọn tivi.
- **① TV vừa bật** (`off`/`unavailable` → `on`): đợi (mặc định 12 giây) rồi mở Màn hình chính.
- **② Thoát một app trong danh sách «App quản lý»** (YouTube, SS IPTV, Live Cam, trình duyệt…): khi TV rơi về nguồn nền (HDMI/truyền hình/Home của LG) thì mở lại Màn hình chính, trễ ~2 giây. Chuyển app sang app khác, bấm nút **Input**, hoặc chính Màn hình chính mở lên thì **không** bị chen vào.
- **③ Thay nút Home của LG** (mặc định **tắt**): bật thì bấm Home trên remote mở Màn hình chính. Mở Cài đặt của LG từ Màn hình chính chưa xác nhận được, nên để tắt; nút ⚙ trên remote vẫn vào Cài đặt.

Làm được vì tivi báo `app_id` đổi và Home Assistant mở đè app; **không bắt được phím Back bên trong app khác** (cần root). Test trong Home Assistant thật: 17 tình huống (`apps/home/tests/test_blueprint.py`). Chưa kiểm: màn Home của LG báo `app_id` nào (mặc định `com.webos.app.home`, chỉnh trong blueprint).

### 5. Chống mất app sau khi tắt / rút điện
**Hiện tượng đã đo:** sau khi tivi khởi động lại, `ares-install --list` **rỗng** dù tệp app vẫn nằm trong `/media/developer/apps/...`: tivi mất *đăng ký*, không mất tệp. Cài lại bằng `ares-install` là hiện lại. Nguyên nhân gốc **chưa xác định** (mới quan sát một lần trên một tivi).

**Cách chữa:** `tools/giu_app_tv.sh` chạy định kỳ trên một máy luôn bật cùng mạng (mini PC, NAS, Raspberry Pi, máy Home Assistant). Nó chỉ **cài lại gói còn thiếu** trong thư mục `ipk/` (tên `<id>_<phienban>_all.ipk`), không bao giờ gỡ app; tivi tắt thì im lặng bỏ qua; không liệt kê được thì không đoán.

```sh
mkdir -p /opt/tv-apps/ipk && cp tools/giu_app_tv.sh /opt/tv-apps/ && cp dist/*.ipk /opt/tv-apps/ipk/    # chỉ chép gói bạn muốn giữ
cp tools/giu_app_tv.env.example /opt/tv-apps/giu_app_tv.env && chmod 600 /opt/tv-apps/giu_app_tv.env   # sửa TV_HOST (+ ARES_HOME/ARES_BIN nếu cần)
/opt/tv-apps/giu_app_tv.sh --kiem-tra       # chỉ báo thiếu gì, chưa cài
sudo cp tools/giu-app-tv.service tools/giu-app-tv.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now giu-app-tv.timer
```
Nhật ký: `/opt/tv-apps/giu_app_tv.log`. Dự kiến sau khi tivi bật lại, app hiện lại trong vài phút (chu kỳ 2 phút; **chưa đo** với bộ hẹn giờ thật).

**Bộ canh KHÔNG làm được:** gia hạn phiên Developer Mode (phải bấm EXTEND trên tivi), và cài lại khi Developer Mode đã tắt hoặc phiên đã hết (cổng 9922 đóng).

## Kiểm thử
- `apps/home`: `python3 tests/e2e_chrome.py` (Chrome thật 1920×1080 + `PalmServiceBridge` giả, 19 ý), `tests/test_blueprint.py` (cần Home Assistant + `pytest-homeassistant-custom-component`, 17 ý).
- `apps/livecam`: `node tests/test_layers.js`, `node tests/test_cardfmt.js`, `python3 tests/e2e_chrome.py`, `tests/test_blueprint.py`.
- `tools/giu_app_tv.sh`: thử trên tivi thật: thư mục gói rỗng, đủ app, thiếu app (báo), cài lại thật, chạy lại (không còn thiếu), tivi tắt (im lặng).
- Cú pháp ES5: `acorn` với `ecmaVersion: 5`.

## Chưa kiểm
- Màn hình chính tự mở khi bật tivi thật và khi thoát app thật; app còn sau khi tắt/rút điện *khi có bộ canh*.
- Mở **Cài đặt** của LG bằng `applicationManager/launch` từ xa (không thấy đổi app tiền cảnh).
- Lưu ý đóng gói: `ares-install` chỉ nhận gói do `ares-package` tạo; mọi `build.sh`/`build_ipk.sh` ở đây dùng `ares-package` (bản đầu của Live Cam đóng tay bằng `ar` bị tivi từ chối, đã thay).
- Live Cam phát camera trên tivi thật; gói `popup` (kiểu cửa sổ `overlay` không có trong tài liệu LG).
