# Màn hình chính (com.viet.home) — màn chọn app kiểu Android TV / Apple TV cho LG webOS 3

Lưới app + hàng «Nguồn vào» (HDMI 1–3, AV) + đồng hồ/ngày. Mũi tên chọn, OK mở, Back thoát; chuột remote rê/bấm cũng chạy.

**Giới hạn của TV 49UH617T (webOS 3.0, Chromium 38, không root):**
- Không thay được màn Home của LG hay nút Home trên remote (bấm Home chỉ hiện thanh app đè lên, `app_id` không đổi nên HA không thấy). Cách hiện màn này khi bật TV / thoát app: blueprint `blueprints/lg_man_hinh_chinh_khi_bat_tivi.yaml` (HA mở app).
- Tự đóng 2,5 giây sau khi mở app khác (không đóng nếu mở lỗi) để không nằm lại trong bộ nhớ.
- App thường bị CẤM liệt kê app (`listApps`, `listLaunchPoints`), nên danh sách ô nằm trong `app/js/config.js` (sửa id/tên rồi đóng gói lại). Mở app thì được (`applicationManager/launch`).
- Là app Developer Mode: mất khi phiên Developer Mode hết hạn (nhớ bấm EXTEND) hoặc tắt Dev Mode.

## Đóng gói & cài
```
export ARES_HOME=<thư mục HOME chứa .webos/tv/novacom-devices.json> ARES_BIN=<…/node_modules/.bin>
./build.sh                       # -> com.viet.home_1.0.1_all.ipk
HOME=$ARES_HOME $ARES_BIN/ares-install --device tv com.viet.home_1.0.1_all.ipk
```
`./build.sh http://IP:PORT/` đóng bản THỬ có «beacon» báo cáo (sự kiện nạp, icon, lỗi JS) về một bộ nghe HTTP — chỉ để gỡ lỗi trên TV thật.

## Kiểm thử
```
python3 tests/e2e_chrome.py [anh.png]   # Chrome thật 1920x1080 + PalmServiceBridge giả: điều hướng, launch, lỗi -101, Back, chuột (19 ý)
tests/test_blueprint.py                 # chạy trong ảnh có Home Assistant (15 ý)
```
Cú pháp: ES5 thuần (kiểm bằng acorn ecmaVersion 5), không CSS grid/biến/vh.
