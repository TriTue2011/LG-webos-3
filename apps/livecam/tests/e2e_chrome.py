"""Thu dau-cuoi: Chrome that mo index.html (file://) voi mot Home Assistant GIA (WebSocket + luong MJPEG dem so ket noi dang mo).
Kiem luat lop kieu Dosen va quan trong nhat: KHONG ro ket noi / bo nho khi lop bi de, het han, go, bi che hoac app thoat."""
import asyncio, io, json, os, re, shutil, subprocess, sys, tempfile, time
from aiohttp import web, ClientSession, WSMsgType
from PIL import Image

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
JPEG = io.BytesIO(); Image.new("RGB", (64, 36), (200, 40, 40)).save(JPEG, "JPEG"); JPEG = JPEG.getvalue()


class FakeHA:
    def __init__(self):
        self.mjpeg = {}            # entity -> so ket noi dang mo
        self.mjpeg_total = {}
        self.ws_open = 0
        self.ws_total = 0
        self.commands = []         # type cua moi lenh WS
        self.states = {"sensor.nhiet": {"name": "Nhiệt độ", "state": "27.34", "unit": "°C", "dc": "temperature"},
                       "binary_sensor.cua": {"name": "Cửa chính", "state": "on", "unit": "", "dc": "door"},
                       "binary_sensor.nguoi": {"name": "Phòng khách", "state": "on", "unit": "", "dc": "occupancy"}}
        self.watchers = []         # (ws, id, [entity]) cua cac template dang dang ky

    async def ws(self, request):
        ws = web.WebSocketResponse(); await ws.prepare(request)
        self.ws_open += 1; self.ws_total += 1
        await ws.send_json({"type": "auth_required", "ha_version": "2026.11.0"})
        try:
            async for m in ws:
                if m.type != WSMsgType.TEXT:
                    continue
                d = json.loads(m.data); t = d.get("type"); i = d.get("id")
                if t == "auth":
                    await ws.send_json({"type": "auth_ok", "ha_version": "2026.11.0"} if d["access_token"] == "tok" else {"type": "auth_invalid", "message": "sai"}); continue
                self.commands.append(t)
                if t == "camera/stream":
                    await ws.send_json({"id": i, "type": "result", "success": False, "error": {"message": "stream khong bat"}})
                elif t == "auth/sign_path":
                    await ws.send_json({"id": i, "type": "result", "success": True, "result": {"path": d["path"] + "?authSig=x&exp=%s" % d["expires"]}})
                elif t == "render_template":
                    await ws.send_json({"id": i, "type": "result", "success": True, "result": None})
                    if "states.camera" in d["template"]:
                        await ws.send_json({"id": i, "type": "event", "event": {"result": "camera.cua|Cửa\ncamera.bep|Bếp\n"}})
                    else:                                         # template cua THE thong tin: moi dong entity§ten§state§don_vi§device_class
                        ids = re.search(r"\[('.*?')\]", d["template"]).group(1).replace("'", "").split(",")
                        self.watchers.append((ws, i, ids))
                        await ws.send_json({"id": i, "type": "event", "event": {"result": self.rows(ids)}})
                elif t == "unsubscribe_events":
                    self.watchers = [w for w in self.watchers if not (w[0] is ws and w[1] == d.get("subscription"))]
                    await ws.send_json({"id": i, "type": "result", "success": True, "result": None})
                else:
                    await ws.send_json({"id": i, "type": "result", "success": True, "result": {"id": 1, "name": "Tôi"}})
        finally:
            self.ws_open -= 1
        return ws

    def rows(self, ids):
        out = ""
        for e in ids:
            st = self.states.get(e)
            out += "%s§%s§%s§%s§%s\n" % (e, st["name"] if st else e, st["state"] if st else "", st["unit"] if st else "", st["dc"] if st else "")
        return out

    async def push_state(self, entity, **fields):
        self.states[entity].update(fields)
        for ws, i, ids in list(self.watchers):
            if entity in ids:
                await ws.send_json({"id": i, "type": "event", "event": {"result": self.rows(ids)}})

    async def stream(self, request):
        ent = request.match_info["ent"]
        self.mjpeg[ent] = self.mjpeg.get(ent, 0) + 1; self.mjpeg_total[ent] = self.mjpeg_total.get(ent, 0) + 1
        resp = web.StreamResponse(headers={"Content-Type": "multipart/x-mixed-replace; boundary=frame", "Cache-Control": "no-cache"})
        await resp.prepare(request)
        try:
            while True:
                await resp.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n" % len(JPEG) + JPEG + b"\r\n")
                await asyncio.sleep(0.2)
        except (ConnectionResetError, asyncio.CancelledError):
            pass
        finally:
            self.mjpeg[ent] -= 1
        return resp


class Page:
    def __init__(self, sess, ws): self.s, self.ws, self.n = sess, ws, 0

    async def cmd(self, method, **params):
        self.n += 1; n = self.n
        await self.ws.send_json({"id": n, "method": method, "params": params})
        while True:
            m = json.loads((await self.ws.receive()).data)
            if os.environ.get("LIVECAM_DEBUG") and m.get("method") in ("Runtime.consoleAPICalled", "Runtime.exceptionThrown", "Log.entryAdded"):
                print("  [trang]", json.dumps(m["params"], ensure_ascii=False)[:300])
            if m.get("id") == n:
                return m.get("result", m)

    async def js(self, expr):
        r = await self.cmd("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if r.get("exceptionDetails"):
            raise AssertionError("loi JS trong trang: " + json.dumps(r["exceptionDetails"], ensure_ascii=False)[:400])
        return r.get("result", {}).get("value")


async def wait(cond, secs=10, what=""):
    end = time.time() + secs
    while time.time() < end:
        v = cond() if not asyncio.iscoroutinefunction(cond) else await cond()
        if asyncio.iscoroutine(v): v = await v
        if v: return v
        await asyncio.sleep(0.1)
    raise AssertionError("het gio cho: " + what)


async def main():
    ha = FakeHA()
    app = web.Application(); app.router.add_get("/api/websocket", ha.ws); app.router.add_get("/api/camera_proxy_stream/{ent}", ha.stream)
    runner = web.AppRunner(app); await runner.setup(); site = web.TCPSite(runner, "127.0.0.1", 0); await site.start()
    port = site._server.sockets[0].getsockname()[1]
    prof = tempfile.mkdtemp()
    chrome = subprocess.Popen(["google-chrome", "--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=9333", "--user-data-dir=" + prof,
                               "--autoplay-policy=no-user-gesture-required", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    results = []
    def ok(name): results.append(name); print("dat  " + name)
    try:
        async with ClientSession() as s:
            for _ in range(50):
                try:
                    async with s.get("http://127.0.0.1:9333/json/version") as r: await r.json(); break
                except Exception: await asyncio.sleep(0.2)

            async def open_page(query):
                async with s.put("http://127.0.0.1:9333/json/new?about:blank") as r: tgt = await r.json()
                ws = await s.ws_connect(tgt["webSocketDebuggerUrl"], max_msg_size=0); pg = Page(s, ws)
                await pg.cmd("Page.enable"); await pg.cmd("Runtime.enable")
                await pg.cmd("Page.addScriptToEvaluateOnNewDocument", source="window.__closed=0;window.close=function(){window.__closed++};")
                await pg.cmd("Page.navigate", url="file://%s/index.html?%s" % (SRC, query))
                return pg

            base = "connect_url=http://127.0.0.1:%d&connect_token=tok" % port
            dbg = "JSON.stringify(LiveCam.debug())"
            tiles = "document.querySelectorAll('.tile').length"

            # --- S1: mot camera, HLS khong co -> MJPEG; khong get_states; hls.js KHONG duoc nap
            pg = await open_page("cmd=show&camera=camera.cua&owner=cua&priority=2&ttl=60&title=Cua&" + base)
            try:
                await wait(lambda: pg.js("(function(){var i=document.querySelector('.tile img.frame:not(.hidden)');return !!i&&i.naturalWidth>0})()"), 10, "khung MJPEG dau")
            except AssertionError:
                print("  [chan doan]", await pg.js("typeof LiveCam+' '+(window.LiveCam?JSON.stringify(LiveCam.debug()):'')+' | '+document.getElementById('tiles').innerHTML.slice(0,400)"), ha.commands, ha.mjpeg, ha.ws_total)
                raise
            assert ha.mjpeg.get("camera.cua") == 1 and ha.ws_open == 1, (ha.mjpeg, ha.ws_open)
            assert "get_states" not in ha.commands and "camera/stream" in ha.commands, ha.commands
            assert await pg.js("typeof Hls") == "undefined", "hls.js khong duoc nap khi khong can"
            assert await pg.js("document.querySelector('.tile .title').textContent") == "Cua"
            ok("S1 mot camera -> MJPEG, khong get_states, khong nap hls.js, tieu de dung")

            # --- S2: camera thu hai cung muc -> chia doi man, o thu hai chi MJPEG
            await pg.js("LiveCam.handle({cmd:'show',camera:'camera.bep',owner:'bep',priority:2,ttl:60,title:'Bep'})")
            await wait(lambda: ha.mjpeg.get("camera.bep") == 1, 10, "luong bep")
            assert await pg.js(tiles) == 2 and ha.mjpeg.get("camera.cua") == 1
            w = await pg.js("Array.prototype.map.call(document.querySelectorAll('.tile'),function(t){return t.style.width+'@'+t.style.left}).join('|')")
            assert sorted(w.split("|")) == ["50%@0%", "50%@50%"], w
            assert await pg.js("document.querySelector('.tile:nth-child(2)').style.left") == "0%", "camera moi nhat nam ben trai"
            ok("S2 hai camera cung muc chia doi man 50/50")

            # --- S3: chu muc 3 de len -> hai luong MJPEG bi DONG ngay (khong ro); het han 4 giay -> hai camera ve lai
            await pg.js("LiveCam.handle({cmd:'show',kind:'text',owner:'bao',priority:3,ttl:4,title:'Khan',text:'Co nguoi o cua'})")
            await wait(lambda: ha.mjpeg.get("camera.cua") == 0 and ha.mjpeg.get("camera.bep") == 0, 5, "dong luong khi bi de")
            assert await pg.js(tiles) == 1 and await pg.js("document.querySelector('.textbox').textContent") == "Co nguoi o cua"
            ok("S3a lop cao de len: luong bi che duoc dong ngay")
            await wait(lambda: ha.mjpeg.get("camera.cua") == 1 and ha.mjpeg.get("camera.bep") == 1, 10, "hai camera ve lai sau khi het han")
            assert await pg.js(tiles) == 2
            ok("S3b het han -> ve lop duoi (hai camera mo lai)")

            # --- S4: go lop bep -> con mot o, luong bep dong
            await pg.js("LiveCam.handle({cmd:'release',owner:'bep'})")
            await wait(lambda: ha.mjpeg.get("camera.bep") == 0, 5, "dong bep")
            assert await pg.js(tiles) == 1 and ha.mjpeg.get("camera.cua") == 1
            ok("S4 release theo ten lop dong dung luong cua no")

            # --- S5: tam an (doi kenh) -> nha luong; hien lai -> phat lai
            await pg.js("Object.defineProperty(document,'hidden',{configurable:true,get:function(){return true}});document.dispatchEvent(new Event('visibilitychange'))")
            await wait(lambda: ha.mjpeg.get("camera.cua") == 0, 5, "nha luong khi bi che")
            await pg.js("Object.defineProperty(document,'hidden',{configurable:true,get:function(){return false}});document.dispatchEvent(new Event('visibilitychange'))")
            await wait(lambda: ha.mjpeg.get("camera.cua") == 1, 10, "phat lai khi hien")
            ok("S5 bi che thi nha ket noi, hien lai thi phat lai")

            # --- S6: nut Back -> go lop dang hien -> het thi app dong, KHONG con ket noi/bo hen gio
            await pg.js("document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:461}))")
            await wait(lambda: pg.js("window.__closed>0"), 5, "app goi close")
            await wait(lambda: ha.mjpeg.get("camera.cua") == 0 and ha.ws_open == 0, 5, "dong het ket noi")
            d = json.loads(await pg.js(dbg)); assert d["tiles"] == 0 and not d["ticker"] and not d["ha"], d
            ok("S6 Back + het lop: app dong, dong WS va MJPEG, tat bo hen gio")
            await pg.ws.close()

            # --- S7: het han tu nhien (ttl 2 giay)
            before = ha.ws_total
            pg = await open_page("cmd=show&camera=camera.cua&owner=a&ttl=2&" + base)
            await wait(lambda: ha.mjpeg.get("camera.cua") == 1, 10, "mo luong")
            await wait(lambda: pg.js("window.__closed>0"), 8, "tu dong sau ttl")
            await wait(lambda: ha.mjpeg.get("camera.cua") == 0 and ha.ws_open == 0, 5, "dong het")
            ok("S7 het ttl: app tu thoat, khong con ket noi")
            await pg.ws.close()

            # --- S8: lenh release luc app chua chay -> thoat ngay, KHONG mo ket noi nao
            total = ha.ws_total
            pg = await open_page("cmd=release&owner=x&" + base)
            await wait(lambda: pg.js("window.__closed>0"), 5, "release nguoi cold")
            assert ha.ws_total == total, "release khong duoc mo ket noi HA"
            ok("S8 release luc app chua chay: thoat ngay, khong mo ket noi")
            await pg.ws.close()

            # --- S9: HA khong toi duoc -> bao loi, tu go sau 5 giay, app dong, khong ro
            pg = await open_page("cmd=show&camera=camera.cua&owner=a&ttl=60&connect_url=http://127.0.0.1:9&connect_token=tok")
            await wait(lambda: pg.js("!!document.querySelector('.tile .error:not(.hidden)')"), 8, "hien loi")
            await wait(lambda: pg.js("window.__closed>0"), 10, "tu thoat sau loi")
            d = json.loads(await pg.js(dbg)); assert d["tiles"] == 0 and not d["ticker"], d
            ok("S9 HA khong toi duoc: hien loi roi tu thoat")
            await pg.ws.close()

            # --- S11: mot lan mo mang nhieu viec (items): hai camera chia doi, mot launch duy nhat
            items = json.dumps({"items": [{"cmd": "show", "camera": "camera.cua", "owner": "c1", "ttl": 30}, {"cmd": "show", "camera": "camera.bep", "owner": "c2", "ttl": 30}]})
            pg = await open_page("")
            await wait(lambda: pg.js("typeof LiveCam==='object'"), 5, "app nap")
            await pg.js("LiveCam.handle(%s)" % json.dumps(json.loads(items) | {"connect": {"url": "http://127.0.0.1:%d" % port, "token": "tok"}}))
            try:
                await wait(lambda: pg.js(tiles + "==2"), 10, "hai o tu mot lan mo")
            except AssertionError:
                print("  [chan doan]", await pg.js("JSON.stringify(LiveCam.debug())+' '+document.getElementById('stage').className+' '+document.getElementById('settings').className"), ha.commands[-4:], ha.mjpeg)
                raise
            await pg.js("LiveCam.handle({cmd:'clear'})")
            await wait(lambda: pg.js("window.__closed>0"), 5, "clear thoat")
            await wait(lambda: ha.mjpeg.get("camera.cua") == 0 and ha.mjpeg.get("camera.bep") == 0 and ha.ws_open == 0, 5, "dong het sau clear")
            ok("S11 mot lan mo nhieu viec (items) chia doi man; clear dong het")
            await pg.ws.close()

            # --- S12: mo tu danh sach app (khong tham so) -> man cai dat, tu kiem tra ket noi va lay danh sach camera bang template nho
            pg = await open_page("")
            await wait(lambda: pg.js("typeof LiveCam==='object'"), 5, "app nap")
            await pg.js("Store.save({url:'http://127.0.0.1:%d',token:'tok'});location.reload()" % port)
            await wait(lambda: pg.js("/2 camera/.test(document.getElementById('s-status').textContent)"), 10, "danh sach camera")
            assert "get_states" not in ha.commands
            ok("S12 man cai dat: ket noi + 2 camera qua render_template, khong get_states")
            await pg.js("document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:461}))")      # Back o man cai dat = thoat
            await wait(lambda: pg.js("window.__closed>0"), 5, "thoat tu cai dat")
            await wait(lambda: ha.ws_open == 0, 5, "dong WS cua cai dat")
            ok("S12b thoat khoi man cai dat dong ket noi")
            await pg.ws.close()

            # --- S13: nhieu camera + nhieu the cung luc (TV 49 inch): luoi camera ben trai, the xep doc ben phai, so lieu SONG
            pg = await open_page("")
            await wait(lambda: pg.js("typeof LiveCam==='object'"), 5, "app nap")
            cams = [{"cmd": "show", "kind": "camera", "camera": "camera.c%d" % n, "owner": "cam%d" % n, "ttl": 120, "title": "Cam %d" % n} for n in range(4)]
            cards = [{"cmd": "show", "kind": "card", "owner": "nhiet", "ttl": 120, "title": "Thời tiết", "main_entity": "sensor.nhiet", "caption": "Phòng khách", "color": "orange"},
                     {"cmd": "show", "kind": "card", "owner": "nha", "ttl": 120, "title": "Trong nhà", "entities": ["binary_sensor.nguoi", "binary_sensor.cua"], "rows": ["Chế độ: Ở nhà"]}]
            await pg.js("LiveCam.handle(%s)" % json.dumps({"items": cams + cards, "connect": {"url": "http://127.0.0.1:%d" % port, "token": "tok"}}))
            await wait(lambda: pg.js(tiles + "==6"), 10, "4 camera + 2 the")
            await wait(lambda: all(ha.mjpeg.get("camera.c%d" % n) == 1 for n in range(4)), 10, "bon luong MJPEG cung luc")
            geo = await pg.js("JSON.stringify(Array.prototype.map.call(document.querySelectorAll('.tile'),function(t){return {c:t.className.indexOf('card')>=0,l:parseFloat(t.style.left),t:parseFloat(t.style.top),w:parseFloat(t.style.width),h:parseFloat(t.style.height)}}))")
            geo = json.loads(geo); cam_g = [g for g in geo if not g["c"]]; card_g = [g for g in geo if g["c"]]
            assert len(cam_g) == 4 and all(g["l"] + g["w"] <= 68.01 and g["w"] == 34 and g["h"] == 50 for g in cam_g), cam_g       # luoi 2x2 trong 68% chieu rong
            assert len(card_g) == 2 and all(g["l"] == 68 and g["w"] == 32 and g["h"] == 50 for g in card_g), card_g
            await wait(lambda: pg.js("/27,3 °C/.test(document.body.innerText)"), 8, "so lieu the (27,3 °C)")
            txt = await pg.js("document.body.innerText")
            for want in ("Thời tiết", "Phòng khách", "Trong nhà", "Có người", "Mở", "Chế độ", "Ở nhà"): assert want in txt, (want, txt[:400])
            assert len(ha.watchers) == 2, ha.watchers
            if os.environ.get("LIVECAM_SHOT"):                       # chup man hinh 1920x1080 de xem bo cuc bang mat
                import base64
                await pg.cmd("Emulation.setDeviceMetricsOverride", width=1920, height=1080, deviceScaleFactor=1, mobile=False)
                await asyncio.sleep(1.2)                         # cua so doi kich thuoc -> app tu dat lai co chu cua the
                shot = await pg.cmd("Page.captureScreenshot", format="png")
                open(os.environ["LIVECAM_SHOT"], "wb").write(base64.b64decode(shot["data"]))
            ok("S13a 4 camera (lưới 2x2) + 2 thẻ cùng lúc, số liệu thẻ đúng định dạng Dosen")
            await ha.push_state("sensor.nhiet", state="30.1")
            await wait(lambda: pg.js("/30,1 °C/.test(document.body.innerText)"), 5, "cap nhat truc tiep")
            assert await pg.js(tiles) == 6 and all(ha.mjpeg.get("camera.c%d" % n) == 1 for n in range(4)), "cap nhat the khong dung toi luong camera"
            await ha.push_state("binary_sensor.cua", state="off")
            await wait(lambda: pg.js("/Đóng/.test(document.body.innerText)"), 5, "cua dong")
            ok("S13b thẻ cập nhật TRỰC TIẾP theo thực thể, không làm lại luồng camera")
            await pg.js("LiveCam.handle({cmd:'release',owner:'nhiet'})")
            await wait(lambda: len(ha.watchers) == 1, 5, "huy dang ky the da go")
            assert await pg.js(tiles) == 5
            ok("S13c gỡ một thẻ thì huỷ đăng ký template của nó")
            await pg.js("LiveCam.handle({cmd:'clear'})")
            await wait(lambda: pg.js("window.__closed>0"), 5, "clear")
            await wait(lambda: not ha.watchers and ha.ws_open == 0 and all(not ha.mjpeg.get("camera.c%d" % n) for n in range(4)), 5, "sach het")
            ok("S13d thoát: không còn đăng ký thẻ, WS hay luồng camera nào")
            await pg.ws.close()

            # --- S14: 8 camera, tran mac dinh 6: hien 6, sau 5 giay doi sang 2 con lai (luong cu dong, luong moi mo)
            pg = await open_page("")
            await wait(lambda: pg.js("typeof LiveCam==='object'"), 5, "app nap")
            many = [{"cmd": "show", "kind": "camera", "camera": "camera.m%d" % n, "owner": "m%d" % n, "ttl": 60} for n in range(8)]
            await pg.js("LiveCam.handle(%s)" % json.dumps({"items": many, "connect": {"url": "http://127.0.0.1:%d" % port, "token": "tok"}}))
            await wait(lambda: pg.js(tiles + "==6"), 10, "6 o dau")
            open_now = lambda: sum(v for k, v in ha.mjpeg.items() if k.startswith("camera.m"))
            await wait(lambda: open_now() == 6, 10, "6 luong")
            await wait(lambda: pg.js(tiles + "==2"), 12, "doi trang sang 2 camera con lai")
            await wait(lambda: open_now() == 2, 8, "chi con 2 luong mo (6 luong cu da dong)")
            ok("S14 8 camera: hiện 6, đổi trang sang 2 còn lại và đóng luồng cũ")
            await pg.js("LiveCam.handle({cmd:'clear'})")
            await wait(lambda: open_now() == 0 and ha.ws_open == 0, 5, "dong het")
            await pg.ws.close()

            # --- S10: anh tinh va chu nhieu lop khong can HA
            total = ha.ws_total
            pg = await open_page("cmd=show&kind=text&owner=t&title=Chao&text=Xin+chao&ttl=2&" + base)
            await wait(lambda: pg.js("window.__closed>0"), 8, "chu het han")
            assert ha.ws_total == total, "lop chu khong duoc mo ket noi HA"
            ok("S10 lop chu khong mo ket noi HA, het han thi thoat")
            await pg.ws.close()
    finally:
        chrome.terminate(); chrome.wait(); shutil.rmtree(prof, ignore_errors=True); await runner.cleanup()
    print("e2e: %d dat" % len(results))

asyncio.run(main())
