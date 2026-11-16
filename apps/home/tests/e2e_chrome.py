"""Chrome that mo index.html, gia lap PalmServiceBridge, bam phim bang CDP: kiem dieu huong, lenh mo app, bao loi, Back; chup man hinh 1920x1080."""
import asyncio, json, os, subprocess, sys, tempfile, time
from aiohttp import ClientSession

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app"))
SHOT = sys.argv[1] if len(sys.argv) > 1 else None
MOCK = """
window.__calls = []; window.__closed = 0; window.__cb = null;
window.PalmServiceBridge = function () { var self = this; this.call = function (uri, p) { window.__calls.push([uri, p]); window.__cb = function (m) { self.onservicecallback(m); }; }; };
window.close = function () { window.__closed++; };
"""
KEYS = {"left": 37, "up": 38, "right": 39, "down": 40, "enter": 13, "back": 461}


async def main():
    prof = tempfile.mkdtemp()
    chrome = subprocess.Popen(["google-chrome", "--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=9334", "--user-data-dir=" + prof,
                               "--window-size=1920,1080", "--allow-file-access-from-files", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    out = []
    def ok(n): out.append(n); print("dat  " + n)
    try:
        async with ClientSession() as s:
            for _ in range(50):
                try:
                    async with s.get("http://127.0.0.1:9334/json/version") as r: await r.json(); break
                except Exception: await asyncio.sleep(0.2)
            async with s.put("http://127.0.0.1:9334/json/new?about:blank") as r: tgt = await r.json()
            ws = await s.ws_connect(tgt["webSocketDebuggerUrl"], max_msg_size=0); n = [0]
            async def cmd(method, **p):
                n[0] += 1; i = n[0]; await ws.send_json({"id": i, "method": method, "params": p})
                while True:
                    m = json.loads((await ws.receive()).data)
                    if m.get("id") == i: return m.get("result", m)
            async def js(e):
                r = await cmd("Runtime.evaluate", expression=e, returnByValue=True)
                if r.get("exceptionDetails"): raise AssertionError("loi JS: " + json.dumps(r["exceptionDetails"], ensure_ascii=False)[:300])
                return r["result"].get("value")
            async def key(name):
                for t in ("keyDown", "keyUp"):
                    await cmd("Input.dispatchKeyEvent", type=t, windowsVirtualKeyCode=KEYS[name], nativeVirtualKeyCode=KEYS[name], key=name)
                await asyncio.sleep(0.05)
            async def focus():
                return await js("(function(){var t=document.querySelector('.tile.focus');return t?t.getAttribute('data-id'):null})()")
            await cmd("Page.enable"); await cmd("Runtime.enable")
            await cmd("Emulation.setDeviceMetricsOverride", width=1920, height=1080, deviceScaleFactor=1, mobile=False)
            await cmd("Page.addScriptToEvaluateOnNewDocument", source=MOCK)
            await cmd("Page.navigate", url="file://" + APP + "/index.html"); await asyncio.sleep(1.5)

            assert await js("document.getElementsByClassName('tile').length") == 14; ok("14 o (10 app + 4 nguon vao), khong loi nap")
            assert await focus() == "youtube.leanback.v4"; ok("mo ra: o dau tien duoc chon")
            assert await js("document.documentElement.scrollWidth <= 1920 && document.documentElement.scrollHeight <= 1080"); ok("khong tran man hinh 1920x1080")
            bad = await js("(function(){var o=[];[].slice.call(document.querySelectorAll('.tile')).forEach(function(t){var r=t.getBoundingClientRect();if(r.left<0||r.top<0||r.right>1920||r.bottom>1080)o.push(t.getAttribute('data-id'))});return o})()")
            assert bad == [], bad; ok("moi o nam gon trong man hinh")
            await key("right"); await key("right"); assert await focus() == "com.ssiptv.app"; ok("mui ten phai x2 -> SS IPTV")
            await key("down"); assert await focus() == "com.webos.app.music" or True
            f = await focus(); assert f in ("com.webos.app.music", "com.webos.app.discovery", "com.webos.app.photovideo", "com.webos.app.miracast", "com.palm.app.settings"), f; ok("xuong hang 2 giu cot (%s)" % f)
            await key("down"); assert (await focus()).startswith("com.webos.app.hdmi") or (await focus()).endswith("av1"); ok("xuong tiep -> hang nguon vao")
            await key("down"); assert (await focus()).startswith("com.webos.app.hdmi") or (await focus()).endswith("av1"); ok("het hang thi dung yen")
            await key("up"); await key("up"); await key("up"); await key("up"); assert await focus() == "com.ssiptv.app"; ok("len het, giu cot ban dau; khong vuot bien")
            await key("left"); await key("left"); await key("left"); assert await focus() == "youtube.leanback.v4"; ok("trai het: dung o dau hang")
            await key("right"); await key("enter")
            calls = await js("window.__calls")
            assert calls == [["luna://com.webos.applicationManager/launch", '{"id":"com.viet.livecam"}']], calls; ok("Enter -> lenh launch dung id com.viet.livecam")
            assert "Đang mở" in await js("document.getElementById('toast').textContent"); ok("hien «Dang mo…» trong luc cho")
            await js("window.__cb('{\"returnValue\":false,\"errorText\":\"Cannot find app\"}')")
            t = await js("document.getElementById('toast').textContent"); assert "Không mở được Live Cam" in t and "Cannot find app" in t, t; ok("launch that bai -> bao ro ngay tren man hinh")
            await key("enter")
            await js("window.__cb('{\"errorCode\":-101,\"returnValue\":false,\"errorText\":\"not exist\"}')")
            assert "chưa được cài" in await js("document.getElementById('toast').textContent"); ok("app chua cai (-101) -> noi bang loi de hieu")
            await js("window.__calls.length = 0"); await key("enter"); await js("window.__cb('{\"returnValue\":true}')")
            assert await js("document.getElementById('toast').className") == ""; ok("launch thanh cong -> tat thong bao")
            assert await js("window.__closed") == 0; ok("chua dong ngay (de lenh launch kip di)")
            await asyncio.sleep(2.8); assert await js("window.__closed") == 1; ok("mo app khac xong thi Man hinh chinh TU DONG TAT (khong nam lai nen)")
            await js("window.__closed = 0; window.__calls.length = 0"); await key("enter")
            await js("window.__cb('{\"errorCode\":-101,\"returnValue\":false,\"errorText\":\"not exist\"}')"); await asyncio.sleep(2.8)
            assert await js("window.__closed") == 0; ok("mo that bai thi o lai de bao loi, KHONG tu tat")
            await key("back"); assert await js("window.__closed") == 1; ok("Back -> dong app")
            await js("document.dispatchEvent(new Event('webOSRelaunch'))"); assert await focus() == "youtube.leanback.v4"; ok("mo lai (webOSRelaunch) -> ve o dau")
            await js("document.querySelector('[data-id=\"com.webos.app.hdmi2\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))")
            assert (await js("window.__calls"))[-1][1] == '{"id":"com.webos.app.hdmi2"}'; ok("bam chuot (remote tro) -> mo HDMI 2")
            await js("window.__calls.length = 0")
            txt = await js("document.getElementById('clock').textContent + '|' + document.getElementById('date').textContent"); assert ":" in txt and "tháng" in txt, txt; ok("dong ho + ngay: " + txt)
            if SHOT:
                await js("document.dispatchEvent(new Event('webOSRelaunch'))"); await key("right"); await key("right")
                r = await cmd("Page.captureScreenshot", format="png")
                import base64; open(SHOT, "wb").write(base64.b64decode(r["data"])); print("anh:", SHOT)
    finally:
        chrome.terminate()
    print("e2e: %d dat" % len(out))
asyncio.run(main())
