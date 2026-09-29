import json
import re
from urllib.parse import parse_qs, urlparse

import pytest

from starlette_admin_infinite_scroll import InfiniteScrollConfig, InfiniteScrollPlugin

SCRIPT_RE = re.compile(
    r'<script[^>]+src="([^"]*plugins/infinite-scroll/js/infinite-scroll\.js[^"]*)"'
)
CSS_PATH = "plugins/infinite-scroll/css/infinite-scroll.css"


def _script_config(html: str) -> dict:
    match = SCRIPT_RE.search(html)
    assert match, "infinite-scroll script not injected"
    src = match.group(1).replace("&amp;", "&")
    return json.loads(parse_qs(urlparse(src).query)["config"][0])


def test_plugin_registers_under_its_name(admin, plugin):
    assert admin.plugins == {"infinite-scroll": plugin}


def test_assets_injected_on_list_page(client):
    response = client.get("/admin/product/list")
    assert response.status_code == 200
    assert SCRIPT_RE.search(response.text)
    assert CSS_PATH in response.text


@pytest.mark.parametrize("url", ["/admin/", "/admin/product/create"])
def test_assets_not_injected_outside_list_page(client, url):
    response = client.get(url)
    assert response.status_code == 200
    assert not SCRIPT_RE.search(response.text)
    assert CSS_PATH not in response.text


def test_script_config_defaults(client):
    cfg = _script_config(client.get("/admin/product/list").text)
    assert cfg["rootMargin"] == "400px"
    assert cfg["hidePagination"] is True
    assert cfg["maxAutoPages"] == 0
    assert cfg["rowActionUrl"].endswith("/product/row-action")
    assert cfg["actionUrl"].endswith("/product/action")
    assert set(cfg["i18n"]) == {"loading", "loadMore", "retry", "error", "end"}


@pytest.mark.parametrize(
    "plugin",
    [
        InfiniteScrollPlugin(
            root_margin="1000px", hide_pagination=False, max_auto_pages=3
        )
    ],
)
def test_script_config_options(client):
    cfg = _script_config(client.get("/admin/product/list").text)
    assert cfg["rootMargin"] == "1000px"
    assert cfg["hidePagination"] is False
    assert cfg["maxAutoPages"] == 3


@pytest.mark.parametrize("plugin", [InfiniteScrollPlugin(views=["other"])])
def test_views_allowlist(client):
    assert not SCRIPT_RE.search(client.get("/admin/product/list").text)


@pytest.mark.parametrize("plugin", [InfiniteScrollPlugin(exclude_views=["product"])])
def test_exclude_views(client):
    assert not SCRIPT_RE.search(client.get("/admin/product/list").text)


def test_static_assets_served(client):
    js = client.get("/admin/static/plugins/infinite-scroll/js/infinite-scroll.js")
    css = client.get(f"/admin/static/{CSS_PATH}")
    assert js.status_code == 200
    assert "IntersectionObserver" in js.text
    assert css.status_code == 200


def test_next_page_contains_rows(client, seed):
    """The script relies on the plain list route rendering `tr[data-sa-pk]`."""
    html = client.get("/admin/product/list?page=2&page_size=10").text
    pks = re.findall(r'<tr data-sa-pk="(\d+)"', html)
    assert pks == [str(i) for i in range(11, 21)]


def test_config_validation():
    with pytest.raises(ValueError):
        InfiniteScrollConfig(max_auto_pages=-1)
    cfg = InfiniteScrollConfig(views=["a", "b"], exclude_views=["b"])
    assert cfg.is_enabled_for("a")
    assert not cfg.is_enabled_for("b")
    assert not cfg.is_enabled_for("c")
    assert not cfg.is_enabled_for(None)
