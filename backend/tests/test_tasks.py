import asyncio
import json
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.dependencies import get_current_user
from app.core.security import AuthenticatedUser
from app.main import app
from app.schemas.tasks import TaskCreate, TaskItem, TaskUpdate
from app.services.tasks import (
    SupabaseTaskRepository,
    TaskConflictError,
    TaskMigrationRequiredError,
    TaskProviderError,
    TaskService,
    get_task_service,
)

USER_ID = UUID("d2f7c64a-3e56-4d45-a47d-07331e2a95df")
OTHER_USER_ID = UUID("a1111111-2222-4333-8444-555555555555")
TASK_ID = UUID("11111111-2222-4333-8444-555555555555")
NOW = datetime(2026, 8, 25, 10, 0, tzinfo=UTC)


def _user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=USER_ID,
        access_token="user-jwt",
        role="authenticated",
        email="learner@example.com",
        claims={},
    )


def _task(
    *,
    task_id: UUID = TASK_ID,
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
            "user_id": USER_ID,
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


def _row(**overrides: Any) -> dict[str, Any]:
    return {
        **_task().model_dump(mode="json"),
        **overrides,
    }


def test_repository_scopes_list_to_user_and_forwards_user_jwt() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/rest/v1/tasks"
        assert request.headers["apikey"] == "publishable-key"
        assert request.headers["authorization"] == "Bearer user-jwt"
        assert request.url.params["user_id"] == f"eq.{USER_ID}"
        assert request.url.params["order"] == "updated_at.desc,id.desc"
        return httpx.Response(200, json=[_row()])

    async def run() -> list[TaskItem]:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            repository = SupabaseTaskRepository(
                supabase_url="https://example-project.supabase.co/",
                api_key="publishable-key",
                tasks_table="tasks",
                timeout_seconds=10,
                client=client,
            )
            return await repository.list_tasks(
                user_id=USER_ID,
                access_token="user-jwt",
            )

    assert asyncio.run(run())[0].id == TASK_ID


def test_repository_create_and_conditional_status_update() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.method)
        assert request.headers["prefer"] == "return=representation"
        payload = json.loads(request.content)
        if request.method == "POST":
            assert payload["user_id"] == str(USER_ID)
            assert payload["priority"] == "high"
            return httpx.Response(201, json=[_row(priority="high")])

        assert request.url.params["id"] == f"eq.{TASK_ID}"
        assert request.url.params["user_id"] == f"eq.{USER_ID}"
        assert request.url.params["status"] == "eq.upcoming"
        assert payload == {"status": "in_progress"}
        return httpx.Response(200, json=[_row(status="in_progress")])

    async def run() -> TaskItem:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            repository = SupabaseTaskRepository(
                supabase_url="https://example-project.supabase.co",
                api_key="publishable-key",
                tasks_table="tasks",
                timeout_seconds=10,
                client=client,
            )
            await repository.create_task(
                user_id=USER_ID,
                access_token="user-jwt",
                task=TaskCreate(title="Inspect board", priority="high"),
            )
            return await repository.update_task(
                task_id=TASK_ID,
                user_id=USER_ID,
                access_token="user-jwt",
                updates={"status": "in_progress"},
                expected_status="upcoming",
            )

    assert asyncio.run(run()).status == "in_progress"
    assert calls == ["POST", "PATCH"]


def test_repository_rejects_rows_owned_by_another_user() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[_row(user_id=str(OTHER_USER_ID))])

    async def run() -> None:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            repository = SupabaseTaskRepository(
                supabase_url="https://example-project.supabase.co",
                api_key="publishable-key",
                tasks_table="tasks",
                timeout_seconds=10,
                client=client,
            )
            await repository.list_tasks(
                user_id=USER_ID,
                access_token="user-jwt",
            )

    with pytest.raises(TaskProviderError, match="another user's task"):
        asyncio.run(run())


def test_repository_reports_missing_task_migration() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            404,
            json={
                "code": "PGRST205",
                "message": "Could not find public.tasks in the schema cache",
            },
        )

    async def run() -> None:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            repository = SupabaseTaskRepository(
                supabase_url="https://example-project.supabase.co",
                api_key="publishable-key",
                tasks_table="tasks",
                timeout_seconds=10,
                client=client,
            )
            await repository.list_tasks(
                user_id=USER_ID,
                access_token="user-jwt",
            )

    with pytest.raises(TaskMigrationRequiredError):
        asyncio.run(run())


def test_conditional_update_reports_concurrent_status_change() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "PATCH":
            return httpx.Response(200, json=[])
        return httpx.Response(200, json=[_row(status="completed")])

    async def run() -> None:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler)
        ) as client:
            repository = SupabaseTaskRepository(
                supabase_url="https://example-project.supabase.co",
                api_key="publishable-key",
                tasks_table="tasks",
                timeout_seconds=10,
                client=client,
            )
            await repository.update_task(
                task_id=TASK_ID,
                user_id=USER_ID,
                access_token="user-jwt",
                updates={"status": "in_progress"},
                expected_status="upcoming",
            )

    with pytest.raises(TaskConflictError, match="status changed"):
        asyncio.run(run())


class FakeTaskRepository:
    def __init__(self, current: TaskItem | None = None) -> None:
        self.current = current or _task()
        self.tasks: list[TaskItem] = [self.current]
        self.updates: list[tuple[dict[str, Any], str | None]] = []
        self.deleted = False

    async def list_tasks(self, **_: object) -> list[TaskItem]:
        return self.tasks

    async def create_task(self, *, task: TaskCreate, **_: object) -> TaskItem:
        self.current = _task(
            title=task.title,
            status=task.status,
            priority=task.priority,
            due_date=task.due_date,
        )
        return self.current

    async def get_task(self, **_: object) -> TaskItem:
        return self.current

    async def update_task(
        self,
        *,
        updates: dict[str, Any],
        expected_status: str | None,
        **_: object,
    ) -> TaskItem:
        self.updates.append((updates, expected_status))
        self.current = self.current.model_copy(update=updates)
        return self.current

    async def delete_task(self, **_: object) -> None:
        self.deleted = True


def test_service_sorts_active_tasks_by_section_priority_and_due_date() -> None:
    repository = FakeTaskRepository()
    repository.tasks = [
        _task(
            task_id=UUID(int=1),
            title="Medium",
            priority="medium",
            due_date=date(2026, 8, 26),
        ),
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
    service = TaskService(repository=repository)  # type: ignore[arg-type]

    tasks = asyncio.run(service.list_tasks(_user()))

    assert [task.title for task in tasks] == [
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
    service = TaskService(repository=repository)  # type: ignore[arg-type]

    result = asyncio.run(
        service.update_task(
            _user(),
            TASK_ID,
            TaskUpdate(status=next_status),  # type: ignore[arg-type]
        )
    )

    assert result.status == next_status
    assert repository.updates == [
        ({"status": next_status}, current_status)
    ]


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
    service = TaskService(repository=repository)  # type: ignore[arg-type]

    with pytest.raises(TaskConflictError, match="cannot move"):
        asyncio.run(
            service.update_task(
                _user(),
                TASK_ID,
                TaskUpdate(status=next_status),  # type: ignore[arg-type]
            )
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

    async def list_tasks(self, _: AuthenticatedUser) -> list[TaskItem]:
        if self.list_error:
            raise self.list_error
        return [self.task]

    async def create_task(
        self,
        _: AuthenticatedUser,
        task: TaskCreate,
    ) -> TaskItem:
        self.task = _task(title=task.title, priority=task.priority)
        return self.task

    async def update_task(
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

    async def delete_task(self, _: AuthenticatedUser, __: UUID) -> None:
        self.deleted = True


def test_task_endpoints_require_authentication() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/tasks")

    assert response.status_code == 401


def test_authenticated_task_crud_endpoints() -> None:
    service = FakeTaskService()
    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_task_service] = lambda: service
    try:
        with TestClient(app) as client:
            listing = client.get("/api/v1/tasks")
            created = client.post(
                "/api/v1/tasks",
                json={
                    "title": "  Replace   damaged outlet  ",
                    "priority": "high",
                },
            )
            updated = client.patch(
                f"/api/v1/tasks/{TASK_ID}",
                json={"status": "in_progress", "due_date": None},
            )
            deleted = client.delete(f"/api/v1/tasks/{TASK_ID}")
    finally:
        app.dependency_overrides.clear()

    assert listing.status_code == 200
    assert listing.json()["tasks"][0]["user_id"] == str(USER_ID)
    assert created.status_code == 201
    assert created.json()["title"] == "Replace damaged outlet"
    assert created.json()["priority"] == "high"
    assert updated.status_code == 200
    assert updated.json()["status"] == "in_progress"
    assert updated.json()["due_date"] is None
    assert deleted.status_code == 204
    assert service.deleted is True


def test_empty_task_patch_returns_validation_error() -> None:
    service = FakeTaskService()
    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_task_service] = lambda: service
    try:
        with TestClient(app) as client:
            response = client.patch(f"/api/v1/tasks/{TASK_ID}", json={})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


def test_task_conflict_and_missing_migration_are_translated() -> None:
    conflict_service = FakeTaskService(
        update_error=TaskConflictError("Task status cannot skip a section")
    )
    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_task_service] = lambda: conflict_service
    try:
        with TestClient(app) as client:
            conflict = client.patch(
                f"/api/v1/tasks/{TASK_ID}",
                json={"status": "completed"},
            )

        migration_service = FakeTaskService(
            list_error=TaskMigrationRequiredError("missing")
        )
        app.dependency_overrides[get_task_service] = lambda: migration_service
        with TestClient(app) as client:
            migration = client.get("/api/v1/tasks")
    finally:
        app.dependency_overrides.clear()

    assert conflict.status_code == 409
    assert conflict.json() == {
        "detail": "Task status cannot skip a section"
    }
    assert migration.status_code == 503
    assert "backend/supabase/tasks.sql" in migration.json()["detail"]
