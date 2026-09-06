"""SQLite engine initialization and request-scoped sessions."""

from collections.abc import Generator
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings

# Importing the models registers their tables on Base.metadata.
from app.db import models as _models  # noqa: F401
from app.db.base import Base


@lru_cache
def get_database_engine(database_url: str) -> Engine:
    url = make_url(database_url)
    connect_args: dict[str, object] = {}
    if url.get_backend_name() == "sqlite":
        if url.database and url.database != ":memory:":
            Path(url.database).expanduser().resolve().parent.mkdir(
                parents=True,
                exist_ok=True,
            )
        connect_args["check_same_thread"] = False

    engine = create_engine(database_url, connect_args=connect_args)
    if url.get_backend_name() == "sqlite":

        @event.listens_for(engine, "connect")
        def enable_sqlite_foreign_keys(dbapi_connection: object, _: object) -> None:
            cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def initialize_database(settings: Settings) -> None:
    """Create local application tables that are absent."""
    Base.metadata.create_all(get_database_engine(settings.database_url))


def get_db_session(
    settings: Annotated[Settings, Depends(get_settings)],
) -> Generator[Session, None, None]:
    with Session(get_database_engine(settings.database_url)) as session:
        yield session
