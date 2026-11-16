"""Blueprint «bat TV la hien Man hinh chinh» chay THAT trong HA: TV off->on thi doi roi gui webostv.command launch com.viet.home."""
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


async def _setup(hass, start, extra=None):
    dst = hass.config.path("blueprints", "automation", "home")
    os.makedirs(dst, exist_ok=True)
    shutil.copy(BP, dst)
    hass.states.async_set(TV, start)
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
