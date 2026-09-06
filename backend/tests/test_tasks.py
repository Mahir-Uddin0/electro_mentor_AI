from collections.abc import Generator
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, event, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.dependencies import get_current_user
from app.api.v1.endpoints import tasks
from app.core.security import AuthenticatedUser
from app.db.base import Base
from app.db.models import TaskRecord, User
from app.db.session import get_db_session
from app.schemas.tasks import TaskCreate, TaskItem, TaskUpdate
from app.services.tasks import (
    SQLiteTaskRepository,
    TaskConflictError,
    TaskNotFoundError,
    TaskService,
    TaskStorageError,
    get_task_service,
)

USER_ID = UUID("d2f7c64a-3e56-4d45-a47d-07331e2a95df")
OTHER_USER_ID = UUID("a1111111-2222-4333-8444-555555555555")
TASK_ID = UUID("11111111-2222-4333-8444-555555555555")
NOW = datetime(2026, 8, 25, 10, 0, tzinfo=UTC)


def _user(user_id: UUID = USER_ID) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=user_id,
        access_token="local-user-jwt",
        role="authenticated",
        email="learner@example.com",
        claims={},
    )


def _task(
    *,
    task_id: UUID = TASK_ID,
    user_id: UUID = USER_ID,
    title: str = "Inspect distribution board",
    status: str = "upcoming",
    priority: str = "medium",
    due_date: date | None = None,
    updated_at: datetime = NOW,
    completed_at: datetime | None = None,
) -> TaskItem:
    return TaskItem.model_validate(
        {
            "id": task_id,
            "user_id": user_id,
            "title": title,
            "description": "Verify labeling before energizing.",
            "status": status,
            "priority": priority,
            "due_date": due_date,
            "created_at": NOW - timedelta(days=1),
            "updated_at": updated_at,
            "completed_at": completed_at,
        }
    )


def _database_user(user_id: UUID, email: str) -> User:
    now = NOW.replace(tzinfo=None)
    return User(
        id=str(user_id),
        email=email,
        password_hash="not-used-by-task-tests",
        display_name=None,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


@pytest.fixture
def task_database() -> Generator[tuple[Session, Engine], None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection: object, _: object) -> None:
        cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    session = Session(engine)
    session.add_all(
        [
            _database_user(USER_ID, "learner@example.com"),
            _database_user(OTHER_USER_ID, "other@example.com"),
        ]
    )
    session.commit()
    try:
        yield session, engine
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def task_client(
    task_database: tuple[Session, Engine],
) -> Generator[tuple[TestClient, FastAPI, Session], None, None]:
    inspection_session, engine = task_database
    application = FastAPI()
    application.include_router(tasks.router, prefix="/api/v1/tasks")

    def override_session() -> Generator[Session, None, None]:
        with Session(engine) as request_session:
            yield request_session

    application.dependency_overrides[get_db_session] = override_session
    with TestClient(application) as client:
        yield client, application, inspection_session
    application.dependency_overrides.clear()


def test_schema_contains_task_constraints_index_and_transition_trigger(
    task_database: tuple[Session, Engine],
) -> None:
    session, engine = task_database
    inspector = inspect(engine)
    assert "tasks" in inspector.get_table_names()
    assert {item["name"] for item in inspector.get_check_constraints("tasks")} == {
        "tasks_completion_timestamp_check",
        "tasks_description_length_check",
        "tasks_priority_check",
        "tasks_status_check",
        "tasks_title_length_check",
    }
    assert "tasks_user_status_priority_due_date_idx" in {
        item["name"] for item in inspector.get_indexes("tasks")
    }
    trigger = session.connection().exec_driver_sql(
        "SELECT name FROM sqlite_master "
        "WHERE type = 'trigger' AND name = 'tasks_status_transition'"
    ).scalar_one()
    assert trigger == "tasks_status_transition"


def test_repository_crud_scopes_every_operation_to_owner(
    task_database: tuple[Session, Engine],
) -> None:
    session, _ = task_database
    repository = SQLiteTaskRepository(session)
    first = repository.create_task(
        user_id=USER_ID,
        task=TaskCreate(title="Inspect board", priority="high"),
    )
    repository.create_task(
        user_id=OTHER_USER_ID,
        task=TaskCreate(title="Other user's private task"),
    )

    assert [task.id for task in repository.list_tasks(user_id=USER_ID)] == [
        first.id
    ]
    with pytest.raises(TaskNotFoundError):
        repository.get_task(task_id=first.id, user_id=OTHER_USER_ID)
    with pytest.raises(TaskNotFoundError):
        repository.update_task(
            task_id=first.id,
            user_id=OTHER_USER_ID,
            updates={"title": "Unauthorized change"},
        )
    with pytest.raises(TaskNotFoundError):
        repository.delete_task(task_id=first.id, user_id=OTHER_USER_ID)

    assert repository.get_task(task_id=first.id, user_id=USER_ID).title == (
        "Inspect board"
    )
    repository.delete_task(task_id=first.id, user_id=USER_ID)
    with pytest.raises(TaskNotFoundError):
        repository.get_task(task_id=first.id, user_id=USER_ID)


def test_repository_sets_and_preserves_task_timestamps(
    task_database: tuple[Session, Engine],
) -> None:
    session, _ = task_database
    repository = SQLiteTaskRepository(session)
    created = repository.create_task(
        user_id=USER_ID,
        task=TaskCreate(title="Test circuit"),
    )
    assert created.created_at.tzinfo == UTC
    assert created.updated_at == created.created_at
    assert created.completed_at is None

    started = repository.update_task(
        task_id=created.id,
        user_id=USER_ID,
        updates={"status": "in_progress"},
        expected_status="upcoming",
    )
    completed = repository.update_task(
        task_id=created.id,
        user_id=USER_ID,
        updates={"status": "completed"},
        expected_status="in_progress",
    )
    completion_time = completed.completed_at
    repeated = repository.update_task(
        task_id=created.id,
        user_id=USER_ID,
        updates={"status": "completed"},
        expected_status="completed",
    )

    assert started.completed_at is None
    assert completion_time is not None
    assert repeated.completed_at == completion_time


def test_database_rejects_invalid_values_and_skipped_status_transition(
    task_database: tuple[Session, Engine],
) -> None:
    session, _ = task_database
    now = NOW.replace(tzinfo=None)
    invalid = TaskRecord(
        id=str(TASK_ID),
        user_id=str(USER_ID),
        title="Invalid priority",
        description="",
        status="upcoming",
        priority="urgent",
        created_at=now,
        updated_at=now,
    )
    session.add(invalid)
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()

    repository = SQLiteTaskRepository(session)
    created = repository.create_task(
        user_id=USER_ID,
        task=TaskCreate(title="Transition test"),
    )
    record = session.get(TaskRecord, str(created.id))
    assert record is not None
    record.status = "completed"
    record.completed_at = now
    with pytest.raises(IntegrityError, match="invalid task status transition"):
        session.commit()
    session.rollback()


def test_deleting_user_cascades_to_tasks(
    task_database: tuple[Session, Engine],
) -> None:
    session, _ = task_database
    repository = SQLiteTaskRepository(session)
    created = repository.create_task(
        user_id=USER_ID,
        task=TaskCreate(title="Owned task"),
    )
    user = session.get(User, str(USER_ID))
    assert user is not None
    session.delete(user)
    session.commit()

    assert session.get(TaskRecord, str(created.id)) is None


class FakeTaskRepository:
    def __init__(self, current: TaskItem | None = None) -> None:
        self.current = current or _task()
        self.tasks: list[TaskItem] = [self.current]
        self.updates: list[tuple[dict[str, Any], str | None]] = []
        self.deleted = False

    def list_tasks(self, **_: object) -> list[TaskItem]:
        return self.tasks

    def create_task(self, *, task: TaskCreate, **_: object) -> TaskItem:
        self.current = _task(
            title=task.title,
            status=task.status,
            priority=task.priority,
            due_date=task.due_date,
        )
        return self.current

    def get_task(self, **_: object) -> TaskItem:
        return self.current

    def update_task(
        self,
        *,
        updates: dict[str, Any],
        expected_status: str | None,
        **_: object,
    ) -> TaskItem:
        self.updates.append((updates, expected_status))
        self.current = self.current.model_copy(update=updates)
        return self.current

    def delete_task(self, **_: object) -> None:
        self.deleted = True


def test_service_sorts_active_tasks_by_section_priority_and_due_date() -> None:
    repository = FakeTaskRepository()
    repository.tasks = [
        _task(task_id=UUID(int=1), title="Medium", due_date=date(2026, 8, 26)),
        _task(
            task_id=UUID(int=2),
            title="High later",
            priority="high",
            due_date=date(2026, 8, 30),
        ),
        _task(
            task_id=UUID(int=3),
            title="High sooner",
            priority="high",
            due_date=date(2026, 8, 27),
        ),
        _task(
            task_id=UUID(int=4),
            title="Started",
            status="in_progress",
            priority="high",
        ),
        _task(
            task_id=UUID(int=5),
            title="Done",
            status="completed",
            priority="low",
            completed_at=NOW,
        ),
    ]
    service = TaskService(repository=repository)

    assert [task.title for task in service.list_tasks(_user())] == [
        "High sooner",
        "High later",
        "Medium",
        "Started",
        "Done",
    ]


@pytest.mark.parametrize(
    ("current_status", "next_status"),
    [("upcoming", "in_progress"), ("in_progress", "completed")],
)
def test_service_allows_next_status_only(
    current_status: str,
    next_status: str,
) -> None:
    repository = FakeTaskRepository(current=_task(status=current_status))
    service = TaskService(repository=repository)

    result = service.update_task(
        _user(),
        TASK_ID,
        TaskUpdate(status=next_status),  # type: ignore[arg-type]
    )

    assert result.status == next_status
    assert repository.updates == [({"status": next_status}, current_status)]


@pytest.mark.parametrize(
    ("current_status", "next_status"),
    [
        ("upcoming", "completed"),
        ("in_progress", "upcoming"),
        ("completed", "in_progress"),
    ],
)
def test_service_rejects_skipped_and_backward_status_changes(
    current_status: str,
    next_status: str,
) -> None:
    repository = FakeTaskRepository(current=_task(status=current_status))
    service = TaskService(repository=repository)

    with pytest.raises(TaskConflictError, match="cannot move"):
        service.update_task(
            _user(),
            TASK_ID,
            TaskUpdate(status=next_status),  # type: ignore[arg-type]
        )
    assert repository.updates == []


def test_update_validation_rejects_empty_or_null_required_fields() -> None:
    with pytest.raises(ValidationError, match="At least one"):
        TaskUpdate.model_validate({})
    with pytest.raises(ValidationError, match="title cannot be null"):
        TaskUpdate.model_validate({"title": None})

    clear_due_date = TaskUpdate.model_validate({"due_date": None})
    assert clear_due_date.model_dump(exclude_unset=True) == {"due_date": None}


class FakeTaskService:
    def __init__(
        self,
        *,
        list_error: Exception | None = None,
        update_error: Exception | None = None,
    ) -> None:
        self.task = _task()
        self.list_error = list_error
        self.update_error = update_error
        self.deleted = False

    def list_tasks(self, _: AuthenticatedUser) -> list[TaskItem]:
        if self.list_error:
            raise self.list_error
        return [self.task]

    def create_task(
        self,
        _: AuthenticatedUser,
        task: TaskCreate,
    ) -> TaskItem:
        self.task = _task(title=task.title, priority=task.priority)
        return self.task

    def update_task(
        self,
        _: AuthenticatedUser,
        __: UUID,
        request: TaskUpdate,
    ) -> TaskItem:
        if self.update_error:
            raise self.update_error
        self.task = self.task.model_copy(
            update=request.model_dump(exclude_unset=True)
        )
        return self.task

    def delete_task(self, _: AuthenticatedUser, __: UUID) -> None:
        self.deleted = True


def test_task_endpoints_require_authentication(
    task_client: tuple[TestClient, FastAPI, Session],
) -> None:
    client, _, _ = task_client
    response = client.get("/api/v1/tasks")
    assert response.status_code == 401


def test_real_task_crud_endpoints_and_cross_user_isolation(
    task_client: tuple[TestClient, FastAPI, Session],
) -> None:
    client, application, _ = task_client
    application.dependency_overrides[get_current_user] = _user

    created = client.post(
        "/api/v1/tasks",
        json={"title": "  Replace   damaged outlet  ", "priority": "high"},
    )
    task_id = created.json()["id"]
    listing = client.get("/api/v1/tasks")
    updated = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "in_progress", "due_date": None},
    )

    application.dependency_overrides[get_current_user] = lambda: _user(
        OTHER_USER_ID
    )
    hidden_update = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "Try to take ownership"},
    )
    hidden_delete = client.delete(f"/api/v1/tasks/{task_id}")
    hidden_listing = client.get("/api/v1/tasks")

    application.dependency_overrides[get_current_user] = _user
    deleted = client.delete(f"/api/v1/tasks/{task_id}")

    assert created.status_code == 201
    assert created.json()["title"] == "Replace damaged outlet"
    assert listing.json()["tasks"][0]["user_id"] == str(USER_ID)
    assert updated.status_code == 200
    assert updated.json()["status"] == "in_progress"
    assert hidden_update.status_code == 404
    assert hidden_delete.status_code == 404
    assert hidden_listing.json() == {"tasks": []}
    assert deleted.status_code == 204


def test_endpoint_translates_conflict_and_storage_failure(
    task_client: tuple[TestClient, FastAPI, Session],
) -> None:
    client, application, _ = task_client
    application.dependency_overrides[get_current_user] = _user
    conflict_service = FakeTaskService(
        update_error=TaskConflictError("Task status cannot skip a section")
    )
    application.dependency_overrides[get_task_service] = lambda: conflict_service

    conflict = client.patch(
        f"/api/v1/tasks/{TASK_ID}",
        json={"status": "completed"},
    )

    storage_service = FakeTaskService(list_error=TaskStorageError("unavailable"))
    application.dependency_overrides[get_task_service] = lambda: storage_service
    unavailable = client.get("/api/v1/tasks")

    assert conflict.status_code == 409
    assert conflict.json() == {"detail": "Task status cannot skip a section"}
    assert unavailable.status_code == 503
    assert unavailable.json() == {
        "detail": "Task storage is temporarily unavailable."
    }
