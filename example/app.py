"""Runnable demo for starlette-admin-infinite-scroll.

Mounts a SQLite-backed SQLAlchemy admin seeded with 500 products and the plugin
registered. Run `uv run python example/app.py` from the project root, then open
http://localhost:8000/admin/product/list.
"""

from contextlib import asynccontextmanager

import uvicorn
from sqlalchemy import Integer, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from starlette.applications import Starlette
from starlette.responses import HTMLResponse
from starlette.routing import Route
from starlette_admin.contrib.sqla import Admin, ModelView

from starlette_admin_infinite_scroll import InfiniteScrollPlugin

engine = create_engine(
    "sqlite:///example.sqlite", connect_args={"check_same_thread": False}
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy declarative models."""


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str]


class ProductView(ModelView):
    fields = [
        "id",
        "name",
    ]
    searchable_fields = ["name"]


@asynccontextmanager
async def lifespan(app: Starlette):
    Base.metadata.create_all(engine)
    # Seed enough rows to scroll through several pages.
    with Session(engine) as session:
        if session.scalar(select(func.count(Product.id))) == 0:
            session.add_all(Product(name=f"Product #{i:04d}") for i in range(1, 501))
            session.commit()
    yield


app = Starlette(
    lifespan=lifespan,
    routes=[
        Route(
            "/",
            lambda _: HTMLResponse('<a href="/admin/">Go to Admin &rarr;</a>'),
        )
    ],
)

admin = Admin(
    engine,
    title="Infinite Scroll demo",
    secret_key="dev-only-change-me",
    plugins=[InfiniteScrollPlugin(root_margin="300px", max_auto_pages=5)],
    debug=True,
)

admin.add_view(ProductView(Product))

admin.mount_to(app)


if __name__ == "__main__":
    # Pass the app object (not an "app:app" import string) so the script works
    # from any working directory.
    uvicorn.run(app, port=8000)
