# starlette-admin-infinite-scroll development tasks.
PACKAGE = src/starlette_admin_infinite_scroll
SOURCES = $(PACKAGE) tests example
TRANSLATIONS = $(PACKAGE)/translations
DOMAIN = admin
POT = $(TRANSLATIONS)/$(DOMAIN).pot

.PHONY: install test lint format build clean extract-messages update-messages compile-messages

install:
	uv sync

test:
	uv run pytest

lint:
	uv run ruff check $(SOURCES)
	uv run ruff format --check $(SOURCES)

format:
	uv run ruff check --fix $(SOURCES)
	uv run ruff format $(SOURCES)

build: clean
	uv build

clean:
	rm -rf dist build

# Requires the `i18n` extra: uv sync --extra i18n (adds babel).
extract-messages:
	mkdir -p $(TRANSLATIONS)
	uv run pybabel extract -F babel.cfg -o $(POT) $(PACKAGE)

update-messages: extract-messages
	uv run pybabel update -i $(POT) -d $(TRANSLATIONS) -D $(DOMAIN)

compile-messages:
	uv run pybabel compile -d $(TRANSLATIONS) -D $(DOMAIN)
