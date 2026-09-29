# starlette-admin-infinite-scroll

[![CI](https://github.com/Alwinator/starlette-admin-infinite-scroll/actions/workflows/ci.yml/badge.svg)](https://github.com/Alwinator/starlette-admin-infinite-scroll/actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/starlette-admin-infinite-scroll.svg)](https://pypi.org/project/starlette-admin-infinite-scroll/)
[![Python versions](https://img.shields.io/pypi/pyversions/starlette-admin-infinite-scroll.svg)](https://pypi.org/project/starlette-admin-infinite-scroll/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Infinite scrolling for the [starlette-admin](https://github.com/jowilf/starlette-admin)
list view.

Scroll to the bottom of a list and the next page is appended to the table,
keeping the current search, sort, filters, visible columns and page size.
Appended rows are rendered by starlette-admin itself, so selection, bulk and
row actions, row click navigation and inline editing keep working.

## Install

```bash
pip install starlette-admin-infinite-scroll
```

Requires Python 3.11+ and starlette-admin 1.0+.

## Usage

```python
from starlette_admin.contrib.sqla import Admin
from starlette_admin_infinite_scroll import InfiniteScrollPlugin

admin = Admin(engine, plugins=[InfiniteScrollPlugin()])
```

Configure it through the constructor:

```python
InfiniteScrollPlugin(
    views=["product", "order"],  # only these list views (default: all)
    exclude_views=["audit-log"], # keep these paginated
    root_margin="600px",         # start loading earlier (default: "400px")
    hide_pagination=True,        # hide page links (default: True)
    max_auto_pages=5,            # then show "Load more" (default: 0 = unlimited)
)
```

See [docs/index.md](docs/index.md) for details, behavior notes and the
JavaScript API.

## Development

```bash
uv sync
uv run pytest
uv run python example/app.py  # demo at http://localhost:8000/admin/product/list
```

`make lint`, `make format`, `make test` and `make build` wrap the usual tasks.

## Releasing

1. Bump `__version__` in `src/starlette_admin_infinite_scroll/__init__.py`
   and add an entry to [CHANGELOG.md](CHANGELOG.md).
2. Commit and push to `main`.
3. Create a GitHub release with the tag `v<version>` (e.g. `v0.2.0`).

Publishing the release runs [`publish.yml`](.github/workflows/publish.yml):
CI, a check that the tag matches the package version, the build, the upload
to PyPI via Trusted Publishing, and attaching the built files to the release.

## License

[MIT](LICENSE)
