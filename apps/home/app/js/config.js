/* Danh sach o. Tivi webOS 3 CAM app thuong liet ke app (listApps/listLaunchPoints bi tu choi) nen danh sach nam o day: sua tai day roi dong goi lai.
 * icon: duong dan file tren tivi (neu khong tai duoc thi dung svg); svg: ten bieu tuong ve san trong app.js; sua id cho dung app.*/
window.HOME_CONFIG = {
  beacon: null,
  apps: [
    { id: "youtube.leanback.v4", title: "YouTube", icon: "/media/developer/apps/usr/palm/applications/youtube.leanback.v4/icon.png", svg: "play" },
    { id: "com.viet.livecam", title: "Live Cam", icon: "/media/developer/apps/usr/palm/applications/com.viet.livecam/icon.png", svg: "cam" },
    { id: "com.ssiptv.app", title: "SS IPTV", icon: "/media/cryptofs/apps/usr/palm/applications/com.ssiptv.app/ss_iptv_80x80.png", svg: "tv" },
    { id: "com.webos.app.livetv", title: "Truyền hình", svg: "tv" },
    { id: "com.webos.app.browser", title: "Trình duyệt", svg: "globe" },
    { id: "com.webos.app.photovideo", title: "Ảnh & Video", icon: "/usr/palm/applications/com.webos.app.photovideo/icon.png", svg: "image" },
    { id: "com.webos.app.music", title: "Âm nhạc", icon: "/usr/palm/applications/com.webos.app.music/icon.png", svg: "music" },
    { id: "com.webos.app.discovery", title: "LG Store", icon: "/mnt/otncabi/usr/palm/applications/com.webos.app.discovery/lgstore.png", svg: "store" },
    { id: "com.webos.app.miracast", title: "Chiếu màn hình", svg: "cast" },
    { id: "com.palm.app.settings", title: "Cài đặt", svg: "gear" },
    { id: "com.palmdts.devmode", title: "Dev Mode", icon: "/media/cryptofs/apps/usr/palm/applications/com.palmdts.devmode/developer_80.png", svg: "gear" }
  ],
  inputs: [
    { id: "com.webos.app.hdmi1", title: "HDMI 1" },
    { id: "com.webos.app.hdmi2", title: "HDMI 2" },
    { id: "com.webos.app.hdmi3", title: "HDMI 3" },
    { id: "com.webos.app.externalinput.av1", title: "AV" },
    { ctl: "auto", id: "ctl.auto", title: "Tự về đây" },
    { ctl: "exit", id: "ctl.exit", title: "Thoát" }
  ],
  perRow: 6
};
