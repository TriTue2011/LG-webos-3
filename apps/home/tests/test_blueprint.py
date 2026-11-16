"""Blueprint «bat TV / thoat app la ve Man hinh chinh» chay THAT trong HA: webostv.command launch com.viet.home dung luc, khong chen vao khi nguoi dung doi app/nguon."""
import asyncio
import datetime
import os
import shutil

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")
from homeassistant.setup import async_setup_component  # noqa: E402
from homeassistant.util import dt as dt_util  # noqa: E402
from pytest_homeassistant_custom_component.common import async_fire_time_changed  # noqa: E402

BP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "blueprints", "lg_man_hinh_chinh_khi_bat_tivi.yaml")
TV = "media_player.lg_tv"


@pytest.fixture
def cmds(hass):
    got = []

    async def command(call):
        got.append(dict(call.data))
    hass.services.async_register("webostv", "command", command)
    return got


async def _setup(hass, start, extra=None, attrs=None):
    dst = hass.config.path("blueprints", "automation", "home")
    os.makedirs(dst, exist_ok=True)
    shutil.copy(BP, dst)
    hass.states.async_set(TV, start, attrs or {})
    assert await async_setup_component(hass, "automation", {"automation": [{
        "alias": "home", "use_blueprint": {"path": "home/lg_man_hinh_chinh_khi_bat_tivi.yaml", "input": {"tv": TV, "cho_giay": 12, **(extra or {})}}}]})
    await hass.async_block_till_done()


async def _settle(hass):
    """Cho trigger chay toi buoc delay MA KHONG cho het delay (async_block_till_done cho ca delay theo gio that)."""
    for _ in range(10):
        await asyncio.sleep(0)


async def _advance(hass, seconds):
    async_fire_time_changed(hass, dt_util.utcnow() + datetime.timedelta(seconds=seconds))
    await hass.async_block_till_done()


async def test_tv_turning_on_launches_home_after_the_delay(hass, cmds):
    await _setup(hass, "off")
    hass.states.async_set(TV, "on"); await _settle(hass)
    assert cmds == [], "chua den gio cho"
    await _advance(hass, 13)
    assert len(cmds) == 1 and cmds[0]["command"] == "com.webos.applicationManager/launch" and cmds[0]["payload"] == {"id": "com.viet.home"}, cmds


async def test_power_loss_then_on_also_counts(hass, cmds):
    await _setup(hass, "unavailable")
    hass.states.async_set(TV, "on"); await _settle(hass); await _advance(hass, 13)
    assert len(cmds) == 1


async def test_tv_switched_off_again_during_the_wait_sends_nothing(hass, cmds):
    await _setup(hass, "off")
    hass.states.async_set(TV, "on"); await _settle(hass)
    hass.states.async_set(TV, "off"); await _settle(hass); await _advance(hass, 13)
    assert cmds == []


async def test_attribute_changes_while_on_do_not_relaunch(hass, cmds):
    await _setup(hass, "on")
    hass.states.async_set(TV, "on", {"source": "HDMI 1"}); await _settle(hass); await _advance(hass, 13)
    assert cmds == [], "chi off->on moi mo, doi nguon khi dang bat thi khong"


async def test_other_app_id_can_be_set(hass, cmds):
    await _setup(hass, "off", {"app_id": "com.viet.livecam"})
    hass.states.async_set(TV, "on"); await _settle(hass); await _advance(hass, 13)
    assert cmds[0]["payload"] == {"id": "com.viet.livecam"}


YT = "youtube.leanback.v4"


def _set(hass, app, state="on"):
    hass.states.async_set(TV, state, {"app_id": app} if app is not None else {})


async def _exit_to(hass, *apps, start=YT, extra=None):
    """TV dang o `start` roi lan luot qua cac app_id trong `apps` (moi buoc cach nhau chua toi 2 s), sau do troi 3 s."""
    await _setup(hass, "on", extra, {"app_id": start})
    for a in apps:
        _set(hass, a); await _settle(hass)
    await _advance(hass, 3)


async def test_leaving_a_managed_app_for_the_base_input_returns_home(hass, cmds):
    await _exit_to(hass, "", "com.webos.app.hdmi1")                 # dung chuoi that do tren TV: app -> trong -> HDMI1
    assert len(cmds) == 1 and cmds[0]["payload"] == {"id": "com.viet.home"}, cmds


async def test_leaving_straight_to_livetv_also_returns_home(hass, cmds):
    await _exit_to(hass, "com.webos.app.livetv")
    assert len(cmds) == 1


async def test_switching_to_the_launcher_itself_does_not_loop(hass, cmds):
    await _exit_to(hass, "com.viet.home")
    assert cmds == [], "mo Man hinh chinh tu app khong duoc kich hoat lai chinh no"


async def test_pressing_input_does_not_interrupt(hass, cmds):
    await _exit_to(hass, "com.webos.app.inputmgr")
    assert cmds == [], "nguoi dung dang chon nguon: dung chen vao"


async def test_app_to_another_app_does_not_return_home(hass, cmds):
    await _exit_to(hass, "com.viet.livecam")
    assert cmds == []


async def test_tv_switched_off_inside_an_app_sends_nothing(hass, cmds):
    await _setup(hass, "on", None, {"app_id": YT})
    _set(hass, None, "off"); await _settle(hass); await _advance(hass, 3)
    assert cmds == []


async def test_only_apps_in_the_managed_list_trigger_it(hass, cmds):
    await _exit_to(hass, "com.webos.app.hdmi1", start="com.palmdts.devmode")
    assert cmds == [], "Developer Mode khong nam trong danh sach: thoat no khong keo ve Man hinh chinh"


async def test_exit_option_can_be_switched_off(hass, cmds):
    await _exit_to(hass, "", "com.webos.app.hdmi1", extra={"khi_thoat_app": False})
    assert cmds == []


async def test_power_on_option_can_be_switched_off(hass, cmds):
    await _setup(hass, "off", {"khi_bat_tv": False})
    hass.states.async_set(TV, "on"); await _settle(hass); await _advance(hass, 13)
    assert cmds == []



async def test_pressing_the_lg_home_key_changes_nothing_we_can_see(hass, cmds):
    """Do tren TV that: bam Home chi hien thanh app de len tren, app_id van la app dang chay -> blueprint khong the (va khong co) nut Home."""
    await _setup(hass, "on", None, {"app_id": "com.webos.app.livetv"})
    hass.states.async_set(TV, "on", {"app_id": "com.webos.app.livetv", "volume_level": 0.2}); await _settle(hass); await _advance(hass, 13)
    assert cmds == []
