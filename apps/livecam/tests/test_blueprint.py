"""Blueprint chieu len TV LG chay THAT trong HA: kich trigger, kiem lenh webostv.command gui cho TV (id app, items, uu tien, ttl, ten lop)."""
import os, shutil
import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")
from homeassistant.setup import async_setup_component  # noqa: E402

BP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "blueprints", "lg_livecam_man_hinh_nhieu_viec.yaml")
TV = "media_player.lg_tv"


@pytest.fixture
def cmds(hass):
    got = []

    async def command(call):
        got.append(dict(call.data) | {"_target": call.data.get("entity_id")})
    hass.services.async_register("webostv", "command", command)
    hass.services.async_register("media_player", "turn_on", lambda c: got.append({"turn_on": True}))
    return got


async def _auto(hass, viec, trigger_ids=("cua",), cach_chon="tat_ca", bat_tv=False, tv_state="on", extra=None):
    dst = hass.config.path("blueprints", "automation", "livecam")
    os.makedirs(dst, exist_ok=True)
    shutil.copy(BP, dst)
    hass.states.async_set(TV, tv_state)
    hass.states.async_set("camera.cua", "idle", {"friendly_name": "Camera cửa"})
    hass.states.async_set("camera.bep", "idle", {"friendly_name": "Camera bếp"})
    hass.states.async_set("input_boolean.chuong", "off")
    trig = [{"trigger": "state", "entity_id": "input_boolean.chuong", "to": "on", "id": i} for i in trigger_ids]
    assert await async_setup_component(hass, "automation", {"automation": [{
        "alias": "tv", "use_blueprint": {"path": "livecam/lg_livecam_man_hinh_nhieu_viec.yaml",
                                         "input": {"tv": TV, "bat_tv": bat_tv, "trigger": trig, "viec": viec, "cach_chon": cach_chon, **(extra or {})}}}]})
    await hass.async_block_till_done()
    hass.states.async_set("input_boolean.chuong", "on")
    await hass.async_block_till_done()


def _items(cmds):
    c = [x for x in cmds if "command" in x]
    assert len(c) == 1, cmds
    assert c[0]["command"] == "com.webos.applicationManager/launch"
    assert c[0]["payload"]["id"] == "com.viet.livecam"
    return c[0]["payload"]["params"]["items"]


async def test_one_camera_becomes_one_layer_with_friendly_title(hass, cmds):
    await _auto(hass, [{"ten": "Cửa", "khi": ["cua"], "kieu": "camera", "camera": ["camera.cua"], "thoi_gian": 20, "uu_tien": 3, "ten_lop": "nguoi_o_cua"}])
    assert _items(cmds) == [{"cmd": "show", "kind": "camera", "camera": "camera.cua", "owner": "nguoi_o_cua", "priority": 3, "ttl": 20.0, "title": "Camera cửa", "split": True, "max_cams": 1, "max_cards": 4}]


async def test_two_cameras_go_in_ONE_launch_with_distinct_layers(hass, cmds):
    await _auto(hass, [{"ten": "Hai cam", "kieu": "camera", "camera": ["camera.cua", "camera.bep"], "ten_lop": "an_ninh"}])
    it = _items(cmds)
    assert [i["owner"] for i in it] == ["an_ninh_1", "an_ninh_2"] and [i["camera"] for i in it] == ["camera.cua", "camera.bep"]
    assert {i["priority"] for i in it} == {2}, "mac dinh uu tien thuong"


async def test_text_image_and_video_layers(hass, cmds):
    await _auto(hass, [{"kieu": "chu", "tieu_de": "Khan", "noi_dung": "Co nguoi", "uu_tien": 4, "ten_lop": "khan"},
                       {"kieu": "anh", "nguon": "http://h/a.jpg", "ten_lop": "anh"},
                       {"kieu": "video", "nguon": "http://h/v.m3u8", "lap": True, "ten_lop": "vid", "thoi_gian": 30}])
    t, a, v = _items(cmds)
    assert (t["kind"], t["title"], t["text"], t["priority"]) == ("text", "Khan", "Co nguoi", 4)
    assert (a["kind"], a["url"]) == ("image", "http://h/a.jpg") and (v["kind"], v["loop"], v["ttl"]) == ("video", True, 30.0)


async def test_trigger_id_filters_the_jobs_and_unmatched_sends_nothing(hass, cmds):
    await _auto(hass, [{"khi": ["cua"], "kieu": "camera", "camera": ["camera.cua"], "ten_lop": "a"}, {"khi": ["khac"], "kieu": "camera", "camera": ["camera.bep"], "ten_lop": "b"}])
    assert [i["owner"] for i in _items(cmds)] == ["a"]


async def test_no_matching_job_means_no_command(hass, cmds):
    await _auto(hass, [{"khi": ["khac"], "kieu": "camera", "camera": ["camera.cua"]}])
    assert not [x for x in cmds if "command" in x]


async def test_first_only_mode(hass, cmds):
    await _auto(hass, [{"kieu": "camera", "camera": ["camera.cua"], "ten_lop": "a"}, {"kieu": "camera", "camera": ["camera.bep"], "ten_lop": "b"}], cach_chon="dau_tien")
    assert [i["owner"] for i in _items(cmds)] == ["a"]


async def test_tv_off_is_turned_on_only_when_asked(hass, cmds):
    await _auto(hass, [{"kieu": "chu", "noi_dung": "x"}], bat_tv=False, tv_state="off")
    assert not [x for x in cmds if x.get("turn_on")], "khong bat TV khi khong yeu cau"


async def test_tv_off_with_bat_tv_turns_it_on_then_launches(hass, cmds):
    async def turn_on(call):
        cmds.append({"turn_on": True})
        hass.states.async_set(TV, "on")
    hass.services.async_register("media_player", "turn_on", turn_on)
    await _auto(hass, [{"kieu": "chu", "noi_dung": "x", "ten_lop": "t"}], bat_tv=True, tv_state="off")
    await hass.async_block_till_done()
    import asyncio
    for _ in range(80):
        if [x for x in cmds if "command" in x]:
            break
        await asyncio.sleep(0.1)
    order = [("turn_on" if x.get("turn_on") else "command") for x in cmds]
    assert order == ["turn_on", "command"], order


async def test_info_card_job_and_grid_limits(hass, cmds):
    await _auto(hass, [{"kieu": "the", "tieu_de": "Điện", "cam_bien_chinh": "sensor.cong_suat", "chu_thich": "Đang phát", "mau": "green", "cac_dong": ["sensor.nhiet_do", "binary_sensor.cua"], "ten_lop": "dien", "thoi_gian": 45, "uu_tien": 3},
                       {"kieu": "camera", "camera": ["camera.cua", "camera.bep"], "ten_lop": "an_ninh"}], extra={"toi_da_camera": 4, "toi_da_the": 2})
    card, c1, c2 = _items(cmds)
    assert card == {"cmd": "show", "kind": "card", "owner": "dien", "priority": 3, "ttl": 45.0, "title": "Điện", "main_entity": "sensor.cong_suat", "caption": "Đang phát", "color": "green",
                    "entities": ["sensor.nhiet_do", "binary_sensor.cua"], "max_cams": 4, "max_cards": 2}
    assert [c1["camera"], c2["camera"]] == ["camera.cua", "camera.bep"] and c1["max_cams"] == 4


async def test_info_card_with_a_single_entity_and_no_main_sensor(hass, cmds):
    await _auto(hass, [{"kieu": "the", "cac_dong": "sensor.nhiet_do", "ten_lop": "t"}])
    (card,) = _items(cmds)
    assert card["entities"] == ["sensor.nhiet_do"] and card["main_entity"] == "" and card["title"] == "Thông tin" and card["color"] == "red"


async def test_go2rtc_hls_url_is_added_by_mapping_and_by_naming_convention(hass, cmds):
    """Co dia chi go2rtc: camera co dong anh xa -> hls theo anh xa; camera.go2rtc_<ten_luong> -> theo quy uoc (_ doi thanh -); camera khac -> khong co hls."""
    await _auto(hass, [{"ten": "Ba cam", "khi": ["cua"], "kieu": "camera", "camera": ["camera.cua", "camera.go2rtc_bep_sub", "camera.khac"], "ten_lop": "an_ninh"}],
                extra={"go2rtc_url": "http://192.168.1.10:1984/", "go2rtc_ban_do": "camera.cua = cua-chinh\n  camera.sai dong khong hop le\n"})
    it = _items(cmds)
    by = {i["camera"]: i for i in it}
    assert by["camera.cua"]["hls"] == "http://192.168.1.10:1984/api/stream.m3u8?src=cua-chinh", by["camera.cua"]
    assert by["camera.go2rtc_bep_sub"]["hls"] == "http://192.168.1.10:1984/api/stream.m3u8?src=bep-sub", by["camera.go2rtc_bep_sub"]
    assert "hls" not in by["camera.khac"], by["camera.khac"]


async def test_no_go2rtc_url_means_no_hls_key_at_all(hass, cmds):
    await _auto(hass, [{"kieu": "camera", "camera": ["camera.go2rtc_cua_sub"], "ten_lop": "a"}])
    assert "hls" not in _items(cmds)[0]


async def test_popup_app_gets_corner_and_size_and_the_popup_app_id(hass, cmds):
    await _auto(hass, [{"kieu": "camera", "camera": ["camera.cua"], "ten_lop": "cam"}], extra={"app_id": "com.viet.livecam.popup", "goc": "tl", "kich_thuoc": 25})
    c = [x for x in cmds if "command" in x][0]
    assert c["payload"]["id"] == "com.viet.livecam.popup"
    it = c["payload"]["params"]["items"][0]
    assert it["corner"] == "tl" and it["size"] == 25, it


async def test_full_screen_app_never_gets_corner_or_size(hass, cmds):
    await _auto(hass, [{"kieu": "camera", "camera": ["camera.cua"], "ten_lop": "cam"}], extra={"goc": "tl", "kich_thuoc": 25})
    c = [x for x in cmds if "command" in x][0]
    assert c["payload"]["id"] == "com.viet.livecam"
    assert "corner" not in c["payload"]["params"]["items"][0] and "size" not in c["payload"]["params"]["items"][0]
