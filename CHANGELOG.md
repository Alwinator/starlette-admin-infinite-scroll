# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-09-29

### Added

- `InfiniteScrollPlugin` for starlette-admin 1.0: appends the next list page
  when the bottom of the table approaches the viewport.
- Options: `views`, `exclude_views`, `root_margin`, `hide_pagination`,
  `max_auto_pages`.
- "Load more" fallback, retry on error, duplicate-row protection, and support
  for selection, row actions, tooltips, JSON viewers and search highlighting
  on appended rows.
- `sa:infinite-scroll:rows-appended` DOM event and
  `window.StarletteAdmin.infiniteScroll` JavaScript API.

[Unreleased]: https://github.com/Alwinator/starlette-admin-infinite-scroll/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Alwinator/starlette-admin-infinite-scroll/releases/tag/v0.1.0
