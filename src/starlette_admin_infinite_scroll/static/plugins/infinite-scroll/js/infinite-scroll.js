/**
 * starlette-admin-infinite-scroll
 *
 * Turns the paginated list page into an infinitely scrolling one. When the
 * bottom of the list table approaches the viewport, the next page of the
 * regular list route is fetched (keeping every current query param: search,
 * sort, filters, visible columns, page size), its `<tr data-sa-pk>` rows are
 * extracted and appended to the current table.
 *
 * Rows come from core's own `_list_row.html`, and core list handlers
 * (row selection, row click navigation, inline edit, confirmation actions)
 * are delegated to the document, so appended rows behave like server
 * rendered ones. Per-element bindings (tooltips, JSON viewers, search
 * highlight, no-confirmation row actions) are re-applied to new rows here.
 *
 * Options are passed by the Python plugin as a JSON `config` query param on
 * this script's URL.
 */
(function () {
  "use strict";

  var DEFAULTS = {
    rootMargin: "400px",
    hidePagination: true,
    maxAutoPages: 0,
    actionUrl: "",
    rowActionUrl: "",
    i18n: {
      loading: "Loading...",
      loadMore: "Load more",
      retry: "Retry",
      error: "Could not load more rows.",
      end: "All rows loaded",
    },
  };

  // `document.currentScript` is only set while this file executes.
  function readConfig() {
    var cfg = {};
    try {
      var script = document.currentScript;
      if (script && script.src) {
        var raw = new URL(script.src, window.location.href).searchParams.get("config");
        if (raw) cfg = JSON.parse(raw);
      }
    } catch (e) {
      /* fall back to defaults */
    }
    var merged = Object.assign({}, DEFAULTS, cfg);
    merged.i18n = Object.assign({}, DEFAULTS.i18n, cfg.i18n || {});
    return merged;
  }

  var config = readConfig();

  function getClass(name, fallback) {
    var sa = window.StarletteAdmin;
    return sa && typeof sa.getClass === "function" ? sa.getClass(name, fallback) : fallback;
  }

  function pageFromHref(href) {
    if (!href) return null;
    try {
      var value = new URL(href, window.location.href).searchParams.get("page");
      var n = parseInt(value || "1", 10);
      return isNaN(n) ? null : n;
    } catch (e) {
      return null;
    }
  }

  /** Replace the n-th (0-based) integer found in `text` with `value`. */
  function replaceNthNumber(text, n, value) {
    var i = -1;
    return text.replace(/\d+/g, function (m) {
      i += 1;
      return i === n ? String(value) : m;
    });
  }

  function nthNumber(text, n) {
    var matches = (text || "").match(/\d+/g);
    return matches && matches.length > n ? parseInt(matches[n], 10) : null;
  }

  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
  }

  function InfiniteScroll(tbody) {
    this.tbody = tbody;
    this.table = tbody.closest("table");
    this.card = this.table.closest(".card") || this.table.parentElement;
    this.footer = this.card.querySelector(".card-footer");
    this.summary = this.footer ? this.footer.querySelector("p") : null;
    this.pagination = this.footer ? this.footer.querySelector(".pagination") : null;

    var params = new URLSearchParams(window.location.search);
    this.currentPage = parseInt(params.get("page") || "1", 10) || 1;
    this.totalPages = this.detectTotalPages();
    this.autoLoaded = 0;
    this.loading = false;
    this.done = false;
    this.failed = false;
  }

  /**
   * Total page count, read from the pagination's "Last" link (the last
   * `.page-link`). Returns `null` when a theme renders no pagination, in
   * which case pages are loaded until one yields no new rows.
   */
  InfiniteScroll.prototype.detectTotalPages = function () {
    if (!this.pagination) return null;
    var links = this.pagination.querySelectorAll("a.page-link[href]");
    if (!links.length) return null;
    return pageFromHref(links[links.length - 1].getAttribute("href"));
  };

  InfiniteScroll.prototype.hasMore = function () {
    if (this.done) return false;
    return this.totalPages === null || this.currentPage < this.totalPages;
  };

  InfiniteScroll.prototype.mount = function () {
    if (!this.hasMore()) return;

    this.card.classList.add("sa-infinite-scroll");
    if (config.hidePagination) this.card.classList.add("sa-infinite-scroll--hide-pagination");

    this.status = document.createElement("div");
    this.status.className = "sa-infinite-scroll-status";
    this.status.setAttribute("data-sa-hook", "infinite-scroll-status");
    this.status.setAttribute("aria-live", "polite");

    this.sentinel = document.createElement("div");
    this.sentinel.className = "sa-infinite-scroll-sentinel";
    this.sentinel.setAttribute("aria-hidden", "true");

    var anchor = this.table.closest(".table-responsive") || this.table;
    anchor.insertAdjacentElement("afterend", this.status);
    this.status.insertAdjacentElement("afterend", this.sentinel);

    this.initActionManager();
    this.observe();
  };

  InfiniteScroll.prototype.observe = function () {
    var self = this;
    if (!("IntersectionObserver" in window)) {
      // Very old browser: degrade to a manual "Load more" button.
      this.renderButton(config.i18n.loadMore);
      return;
    }
    this.observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) self.maybeAutoLoad();
        });
      },
      { rootMargin: "0px 0px " + config.rootMargin + " 0px" }
    );
    this.observer.observe(this.sentinel);
  };

  InfiniteScroll.prototype.autoLimitReached = function () {
    return config.maxAutoPages > 0 && this.autoLoaded >= config.maxAutoPages;
  };

  InfiniteScroll.prototype.maybeAutoLoad = function () {
    if (this.loading || this.failed || !this.hasMore()) return;
    if (this.autoLimitReached()) {
      this.renderButton(config.i18n.loadMore);
      return;
    }
    this.autoLoaded += 1;
    this.loadNext();
  };

  /**
   * After a page is appended the sentinel may still be in view (short pages,
   * tall screens). The observer does not fire again for an element that
   * stays visible, so re-check explicitly.
   */
  InfiniteScroll.prototype.recheck = function () {
    if (!this.sentinel || !this.hasMore()) return;
    var rect = this.sentinel.getBoundingClientRect();
    var margin = parseInt(config.rootMargin, 10) || 0;
    if (rect.top <= window.innerHeight + margin) this.maybeAutoLoad();
  };

  InfiniteScroll.prototype.nextUrl = function () {
    var url = new URL(window.location.href);
    url.searchParams.set("page", String(this.currentPage + 1));
    url.hash = "";
    return url.toString();
  };

  InfiniteScroll.prototype.loadNext = function () {
    var self = this;
    if (this.loading || !this.hasMore()) return Promise.resolve();
    this.loading = true;
    this.failed = false;
    this.renderLoading();

    return fetch(this.nextUrl(), {
      credentials: "same-origin",
      headers: { Accept: "text/html", "X-Requested-With": "XMLHttpRequest" },
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var added = self.appendRows(doc);
        self.currentPage += 1;
        self.syncFromDocument(doc);
        if (added === 0) self.done = true;
        self.loading = false;
        self.afterLoad();
      })
      .catch(function () {
        self.loading = false;
        self.failed = true;
        self.renderError();
      });
  };

  /** Append the rows of a fetched page, skipping pks already displayed. */
  InfiniteScroll.prototype.appendRows = function (doc) {
    var self = this;
    var rows = Array.prototype.slice.call(doc.querySelectorAll("tbody tr[data-sa-pk]"));
    var selectAll = document.querySelector('[data-sa-hook="select-all"]');
    var selectAllChecked = !!(selectAll && selectAll.checked && !selectAll.indeterminate);
    var fragment = document.createDocumentFragment();
    var added = [];

    rows.forEach(function (row) {
      var pk = row.getAttribute("data-sa-pk");
      if (self.tbody.querySelector('tr[data-sa-pk="' + cssEscape(pk) + '"]')) return;
      var imported = document.importNode(row, true);
      if (selectAllChecked) {
        // Keep "all rows selected" (and "select all matching") consistent.
        var box = imported.querySelector('[data-sa-hook="row-checkbox"]');
        if (box) {
          box.checked = true;
          imported.setAttribute("data-sa-selected", "");
        }
      }
      fragment.appendChild(imported);
      added.push(imported);
    });

    if (!added.length) return 0;
    this.tbody.appendChild(fragment);
    added.forEach(function (row) {
      self.bindRow(row);
    });
    this.refreshSelection();
    this.updateSummary();
    this.card.dispatchEvent(
      new CustomEvent("sa:infinite-scroll:rows-appended", {
        bubbles: true,
        detail: { rows: added, page: this.currentPage + 1 },
      })
    );
    return added.length;
  };

  /** Re-apply the per-element bindings core applies once on page load. */
  InfiniteScroll.prototype.bindRow = function (row) {
    if (typeof window.initTooltips === "function") window.initTooltips(row);
    if (typeof window.initJsonViewers === "function" && window.jQuery && jQuery.fn.jsonViewer) {
      window.initJsonViewers(jQuery(row).find("div.field-json[data-json]"));
    }
    if (this.actionManager) this.actionManager.initNoConfirmationActions(row);
    this.highlight(row);
  };

  InfiniteScroll.prototype.highlight = function (row) {
    if (typeof window.walkTextNodes !== "function") return;
    var q = document.querySelector('input[name="q"]');
    var term = q && q.value;
    if (!term || !term.trim()) return;
    var escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var regex = new RegExp("(" + escaped + ")", "gi");
    row.querySelectorAll("td").forEach(function (td) {
      window.walkTextNodes(td, regex);
    });
  };

  /**
   * Core's `initRowSelection` keeps its state in a closure; its delegated
   * `change` handler on row checkboxes recomputes everything (counter,
   * select-all state, banner) from the live DOM, so poke it.
   */
  InfiniteScroll.prototype.refreshSelection = function () {
    var box = this.tbody.querySelector('[data-sa-hook="row-checkbox"]');
    if (box && window.jQuery) jQuery(box).trigger("change");
    // "All N rows on this page are selected": now N is every loaded row.
    var bannerPage = document.querySelector('[data-sa-hook="select-all-banner-page"]');
    if (bannerPage && bannerPage.firstChild && bannerPage.firstChild.nodeType === Node.TEXT_NODE) {
      var count = this.tbody.querySelectorAll("tr[data-sa-pk]").length;
      bannerPage.firstChild.textContent = replaceNthNumber(bannerPage.firstChild.textContent, 0, count);
    }
  };

  /** Rewrite "Showing x to y of z" so `y` covers every loaded row. */
  InfiniteScroll.prototype.updateSummary = function () {
    if (!this.summary) return;
    var text = this.summary.textContent;
    var start = nthNumber(text, 0);
    var total = nthNumber(text, 2);
    if (start === null) return;
    var loaded = this.tbody.querySelectorAll("tr[data-sa-pk]").length;
    var end = start + loaded - 1;
    if (total !== null) end = Math.min(end, total);
    this.summary.textContent = replaceNthNumber(text, 1, end);
  };

  /** Pick up a changed page count (rows created/deleted meanwhile). */
  InfiniteScroll.prototype.syncFromDocument = function (doc) {
    var links = doc.querySelectorAll(".card-footer .pagination a.page-link[href]");
    if (links.length) {
      var total = pageFromHref(links[links.length - 1].getAttribute("href"));
      if (total !== null) this.totalPages = total;
    }
  };

  InfiniteScroll.prototype.afterLoad = function () {
    var self = this;
    if (!this.hasMore()) {
      this.finish();
      return;
    }
    if (this.autoLimitReached()) {
      this.renderButton(config.i18n.loadMore);
      return;
    }
    this.clearStatus();
    window.requestAnimationFrame(function () {
      self.recheck();
    });
  };

  InfiniteScroll.prototype.finish = function () {
    this.done = true;
    if (this.observer) this.observer.disconnect();
    if (this.sentinel) this.sentinel.remove();
    this.sentinel = null;
    this.status.replaceChildren();
    if (this.currentPage > 1) {
      var end = document.createElement("span");
      end.className = "text-muted small";
      end.textContent = config.i18n.end;
      this.status.appendChild(end);
    }
  };

  InfiniteScroll.prototype.clearStatus = function () {
    this.status.replaceChildren();
  };

  InfiniteScroll.prototype.renderLoading = function () {
    var spinner;
    var sa = window.StarletteAdmin;
    try {
      spinner = sa && typeof sa.template === "function" ? sa.template("spinner") : null;
    } catch (e) {
      spinner = null;
    }
    if (!spinner) {
      spinner = document.createElement("span");
      spinner.className = "spinner-border spinner-border-sm";
      spinner.setAttribute("role", "status");
    }
    var label = document.createElement("span");
    label.className = "ms-2 text-muted";
    label.textContent = config.i18n.loading;
    this.status.replaceChildren(spinner, label);
  };

  InfiniteScroll.prototype.renderButton = function (text) {
    var self = this;
    var button = document.createElement("button");
    button.type = "button";
    button.className = getClass("infinite_scroll.load_more_button", "btn btn-outline-secondary btn-sm");
    button.setAttribute("data-sa-action", "infinite-scroll-load-more");
    button.textContent = text;
    button.addEventListener("click", function () {
      self.loadNext();
    });
    this.status.replaceChildren(button);
  };

  InfiniteScroll.prototype.renderError = function () {
    var message = document.createElement("span");
    message.className = "text-danger me-2";
    message.textContent = config.i18n.error;
    this.status.replaceChildren(message);
    var self = this;
    var button = document.createElement("button");
    button.type = "button";
    button.className = getClass("infinite_scroll.retry_button", "btn btn-outline-danger btn-sm");
    button.setAttribute("data-sa-action", "infinite-scroll-retry");
    button.textContent = config.i18n.retry;
    button.addEventListener("click", function () {
      self.loadNext();
    });
    this.status.appendChild(button);
  };

  /**
   * Rows appended here miss the per-element click bindings core's
   * ActionManager puts on no-confirmation row actions. A dedicated instance
   * handles them (row actions only need the row's pk); confirmation actions
   * go through the shared modal and already work.
   */
  InfiniteScroll.prototype.initActionManager = function () {
    if (typeof ActionManager === "undefined" || !config.rowActionUrl) return;
    this.actionManager = new ActionManager(
      config.actionUrl,
      config.rowActionUrl,
      function (query, element) {
        query.append("pk", element.closest("tr").data("sa-pk"));
      },
      function (actionName, element, msg) {
        if (typeof successAlert === "function") successAlert(msg);
        window.location.reload();
      },
      function (actionName, element, error) {
        if (typeof dangerAlert === "function") dangerAlert(error);
      }
    );
  };

  function init() {
    var firstRow = document.querySelector("table tbody tr[data-sa-pk]");
    if (!firstRow) return; // empty list: nothing to extend
    var tbody = firstRow.closest("tbody");
    if (tbody.hasAttribute("data-sa-infinite-scroll")) return; // idempotent
    tbody.setAttribute("data-sa-infinite-scroll", "");
    var instance = new InfiniteScroll(tbody);
    instance.mount();
    window.StarletteAdmin = window.StarletteAdmin || {};
    window.StarletteAdmin.infiniteScroll = instance;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
