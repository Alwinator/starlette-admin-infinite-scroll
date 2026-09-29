"""`InfiniteScrollPlugin`: The entry point end users list in `Admin(plugins=[...])`.

The plugin is purely client side. On list pages it injects one script that
watches the bottom of the list table and, when it scrolls into view, fetches
the next page of the regular server-rendered list route
(``/{key}/list?page=N``, keeping the current search/sort/filter/columns
query params), extracts its ``<tr data-sa-pk>`` rows and appends them to the
current table. No extra endpoint is needed: rows are rendered by the very
same ``_list_row.html`` template core uses.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field
from typing import Any

from starlette.datastructures import URL
from starlette.requests import Request
from starlette_admin.helpers import static_url
from starlette_admin.i18n import gettext as _
from starlette_admin.plugins import BasePlugin
from starlette_admin.types import RequestAction

_VERSION = "1"


@dataclass(frozen=True)
class InfiniteScrollConfig:
    """Options accepted by `InfiniteScrollPlugin(**options)`.

    Attributes:
        views: Identities (keys) of the model views that get infinite
            scrolling. `None` (the default) enables it on every list view.
        exclude_views: Identities of model views to leave untouched, applied
            after `views`.
        root_margin: `IntersectionObserver` root margin. The next page starts
            loading when the bottom of the table is this close to the
            viewport, so rows are usually ready before the user reaches them.
        hide_pagination: Hide the page links and "go to page" form once
            infinite scrolling is active. The "Showing x to y of z" summary and
            the page size selector are kept.
        max_auto_pages: Number of pages loaded automatically while scrolling
            before switching to a "Load more" button. `0` means unlimited.
    """

    views: Sequence[str] | None = None
    exclude_views: Sequence[str] = field(default_factory=tuple)
    root_margin: str = "400px"
    hide_pagination: bool = True
    max_auto_pages: int = 0

    def __post_init__(self) -> None:
        if self.max_auto_pages < 0:
            raise ValueError("max_auto_pages must be >= 0")
        # Normalize to tuples so the frozen config stays immutable.
        if self.views is not None:
            object.__setattr__(self, "views", tuple(self.views))
        object.__setattr__(self, "exclude_views", tuple(self.exclude_views))

    def is_enabled_for(self, key: str | None) -> bool:
        if key is None:
            return False
        if self.views is not None and key not in self.views:
            return False
        return key not in self.exclude_views


class InfiniteScrollPlugin(BasePlugin):
    """starlette-admin plugin: infinite scrolling for the list view."""

    # Also the templates/static namespace: everything this plugin ships lives
    # under "plugins/infinite-scroll/".
    name = "infinite-scroll"

    def __init__(self, **options: Any) -> None:
        self.config = InfiniteScrollConfig(**options)

    # -- Helpers ---------------------------------------------------------

    def is_active(self, request: Request) -> bool:
        """Whether the current request renders a list page that should get
        infinite scrolling."""
        if getattr(request.state, "action", None) != RequestAction.LIST:
            return False
        return self.config.is_enabled_for(request.path_params.get("key"))

    def client_config(self, request: Request) -> dict[str, Any]:
        """Options handed to the frontend script."""
        route_name = request.app.state.ROUTE_NAME
        key = request.path_params["key"]
        return {
            "rootMargin": self.config.root_margin,
            "hidePagination": self.config.hide_pagination,
            "maxAutoPages": self.config.max_auto_pages,
            "actionUrl": str(request.url_for(f"{route_name}:action", key=key)),
            "rowActionUrl": str(request.url_for(f"{route_name}:row-action", key=key)),
            "i18n": {
                "loading": _("Loading..."),
                "loadMore": _("Load more"),
                "retry": _("Retry"),
                "error": _("Could not load more rows."),
                "end": _("All rows loaded"),
            },
        }

    # -- Declarative hooks -----------------------------------------------

    def css_links(self, request: Request) -> list[str]:
        if not self.is_active(request):
            return []
        return [
            static_url(
                request, "plugins/infinite-scroll/css/infinite-scroll.css", v=_VERSION
            )
        ]

    def js_links(self, request: Request) -> list[str]:
        if not self.is_active(request):
            return []
        # Plugin scripts are plain <script src> tags, so the options travel in
        # the script URL and are read back through `document.currentScript`.
        url = static_url(
            request, "plugins/infinite-scroll/js/infinite-scroll.js", v=_VERSION
        )
        cfg = json.dumps(self.client_config(request), separators=(",", ":"))
        return [str(URL(url).include_query_params(config=cfg))]

    def template_globals(self) -> dict[str, Any]:
        # Auto-prefixed by registration: templates read "infinite_scroll_config".
        return {"config": asdict(self.config)}
