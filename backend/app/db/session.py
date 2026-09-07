"""SQLite engine initialization and request-scoped sessions."""

from collections.abc import Generator
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Connection, Engine, create_engine, event, inspect
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings

# Importing the models registers their tables on Base.metadata.
from app.db import models as _models  # noqa: F401
from app.db.base import Base

_CHAT_MESSAGE_CONSTRAINT = "chat_messages_conversation_owner_fkey"
_PRACTICAL_ASSESSMENT_CHECKS = frozenset(
    {
        "practical_assessments_questionnaire_version_check",
        "practical_assessments_video_file_name_check",
        "practical_assessments_video_mime_type_check",
        "practical_assessments_video_size_bytes_check",
        "practical_assessments_video_sha256_check",
        "practical_assessments_video_object_path_check",
        "practical_assessments_questions_check",
        "practical_assessments_answers_check",
        "practical_assessments_video_analysis_check",
        "practical_assessments_video_state_check",
        "practical_assessments_completion_check",
    }
)

_SQLITE_DEPENDENT_OBJECTS: dict[str, tuple[str, ...]] = {
    "chat_messages": (
        "DROP TRIGGER IF EXISTS chat_messages_auto_sequence",
        "DROP INDEX IF EXISTS chat_messages_conversation_sequence_idx",
        "DROP INDEX IF EXISTS chat_messages_user_conversation_sequence_idx",
    ),
    "practical_assessments": (
        "DROP TRIGGER IF EXISTS practical_assessments_completed_immutable",
        "DROP TRIGGER IF EXISTS practical_assessments_identity_immutable",
        "DROP INDEX IF EXISTS practical_assessments_one_draft_per_user_idx",
        "DROP INDEX IF EXISTS practical_assessments_user_history_idx",
        "DROP INDEX IF EXISTS ix_practical_assessments_user_id",
    ),
}


@lru_cache
def get_database_engine(database_url: str) -> Engine:
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite":
        raise ValueError("DATABASE_URL must use SQLite")
    connect_args: dict[str, object] = {}
    if url.database and url.database != ":memory:":
        Path(url.database).expanduser().resolve().parent.mkdir(
            parents=True,
            exist_ok=True,
        )
    connect_args["check_same_thread"] = False

    engine = create_engine(database_url, connect_args=connect_args)

    @event.listens_for(engine, "connect")
    def enable_sqlite_foreign_keys(dbapi_connection: object, _: object) -> None:
        cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


def initialize_database(settings: Settings) -> None:
    """Create missing tables and upgrade older local SQLite schemas in place."""
    engine = get_database_engine(settings.database_url)
    Base.metadata.create_all(engine)
    if engine.dialect.name == "sqlite":
        _upgrade_sqlite_schema(engine)


def _upgrade_sqlite_schema(engine: Engine) -> None:
    """Rebuild changed tables transactionally while preserving compatible rows."""
    with engine.connect() as connection:
        rebuild_chat_messages = not _has_conversation_owner_foreign_key(connection)
        rebuild_assessments = not _has_practical_assessment_checks(connection)
        if not rebuild_chat_messages and not rebuild_assessments:
            return

        # SQLite cannot add table constraints with ALTER TABLE. Foreign keys
        # must be disabled before the transaction used for each safe rebuild.
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
        try:
            with connection.begin():
                if rebuild_chat_messages:
                    _rebuild_table(connection, "chat_messages")
                if rebuild_assessments:
                    _rebuild_table(connection, "practical_assessments")
        finally:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()


def _has_conversation_owner_foreign_key(connection: Connection) -> bool:
    foreign_keys = inspect(connection).get_foreign_keys("chat_messages")
    return any(
        item.get("name") == _CHAT_MESSAGE_CONSTRAINT
        and item.get("referred_table") == "conversations"
        and item.get("constrained_columns") == ["conversation_id", "user_id"]
        and item.get("referred_columns") == ["id", "user_id"]
        for item in foreign_keys
    )


def _has_practical_assessment_checks(connection: Connection) -> bool:
    checks = {
        item.get("name")
        for item in inspect(connection).get_check_constraints(
            "practical_assessments"
        )
    }
    columns = {
        item["name"]
        for item in inspect(connection).get_columns("practical_assessments")
    }
    return _PRACTICAL_ASSESSMENT_CHECKS <= checks and (
        "personalization_context" not in columns
    )


def _rebuild_table(connection: Connection, table_name: str) -> None:
    table = Base.metadata.tables[table_name]
    legacy_name = f"{table_name}_schema_upgrade"
    existing_columns = {
        item["name"] for item in inspect(connection).get_columns(table_name)
    }
    target_columns = [column.name for column in table.columns]
    missing_columns = set(target_columns) - existing_columns
    if missing_columns:
        missing = ", ".join(sorted(missing_columns))
        raise RuntimeError(
            f"Cannot upgrade SQLite table {table_name}: missing columns {missing}"
        )

    connection.exec_driver_sql(f'DROP TABLE IF EXISTS "{legacy_name}"')
    connection.exec_driver_sql(
        f'ALTER TABLE "{table_name}" RENAME TO "{legacy_name}"'
    )
    for statement in _SQLITE_DEPENDENT_OBJECTS[table_name]:
        connection.exec_driver_sql(statement)

    table.create(connection)
    if table_name == "chat_messages":
        # Avoid re-sequencing historical rows or touching their parent while
        # copying them into the constrained replacement table.
        connection.exec_driver_sql(
            "DROP TRIGGER IF EXISTS chat_messages_auto_sequence"
        )
    quoted_columns = ", ".join(f'"{name}"' for name in target_columns)
    connection.exec_driver_sql(
        f'INSERT INTO "{table_name}" ({quoted_columns}) '
        f'SELECT {quoted_columns} FROM "{legacy_name}"'
    )
    connection.exec_driver_sql(f'DROP TABLE "{legacy_name}"')
    if table_name == "chat_messages":
        connection.exec_driver_sql(
            _models.CHAT_MESSAGES_AUTO_SEQUENCE_TRIGGER_SQL
        )


def get_db_session(
    settings: Annotated[Settings, Depends(get_settings)],
) -> Generator[Session, None, None]:
    with Session(get_database_engine(settings.database_url)) as session:
        yield session
