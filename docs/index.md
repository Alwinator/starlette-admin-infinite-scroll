# Infinite Scroll

Infinite scrolling for the starlette-admin list view.

When the bottom of a list table approaches the viewport, the next page is
fetched from the regular list route (keeping the current search, sort,
filters, visible columns and page size) and its rows are appended to the
table. No extra endpoint is involved: rows are rendered by core's own
`_list_row.html`, so they look and behave exactly like server-rendered ones
(row selection, bulk and row actions, row click navigation, inline edit,
tooltips, JSON viewers, search highlighting).

## Install

```bash
pip install starlette-admin-infinite-scroll
```

## Usage

```python
from starlette_admin_infinite_scroll import InfiniteScrollPlugin
from starlette_admin.contrib.sqla import Admin

admin = Admin(engine, plugins=[InfiniteScrollPlugin()])
```

That is the only integration point. Options are passed straight to the
constructor:

```python
InfiniteScrollPlugin(
    views=["product", "order"],  # only these list views
    root_margin="600px",         # start loading earlier
    max_auto_pages=5,            # then show a "Load more" button
)
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `views` | `None` | Identities of the model views that get infinite scrolling. `None` enables it on every list view. |
| `exclude_views` | `()` | Identities of model views to leave paginated, applied after `views`. |
| `root_margin` | `"400px"` | How close the bottom of the table must be to the viewport before the next page is requested. |
| `hide_pagination` | `True` | Hide the page links and the "go to page" form. The "Showing x to y of z" summary (kept up to date) and the page size selector stay. |
| `max_auto_pages` | `0` | Pages loaded automatically before switching to a "Load more" button. `0` means unlimited. |

The page size selector keeps working: pick a bigger page size to load more
rows per request. With "All", everything is on the first page and the plugin
stays idle.

## Behavior notes

- Scripts and styles are only injected on list pages of enabled views.
- Pages that do not fill the viewport keep loading until they do.
- Rows already displayed (for example after rows were created while
  scrolling) are skipped, so a pk is never shown twice.
- When "select all" is checked, appended rows are selected too, so the
  "select all matching" state stays consistent.
- A failed request shows an error with a "Retry" button.
- Reloading the page, or coming back from a detail page, starts over at the
  page in the URL.

## JavaScript API

The instance is exposed as `window.StarletteAdmin.infiniteScroll`
(`loadNext()`, `currentPage`, `totalPages`). After each batch the card
element dispatches a bubbling `sa:infinite-scroll:rows-appended` event with
`detail.rows` (the appended `<tr>` elements) and `detail.page`, so custom list
templates can bind their own widgets:

```js
document.addEventListener("sa:infinite-scroll:rows-appended", (e) => {
  e.detail.rows.forEach(initMyWidgets);
});
```

## Overriding assets

Every file this plugin ships lives under `plugins/infinite-scroll/`. Drop a
file at the matching path under your own `static_dir` to override it:

```
your_project/
└── static/
    └── plugins/infinite-scroll/css/infinite-scroll.css
```

The status area uses the `.sa-infinite-scroll-status` class. The "Load more"
and "Retry" buttons resolve their classes through the theme `ClassMap` roles
`infinite_scroll.load_more_button` and `infinite_scroll.retry_button`.
