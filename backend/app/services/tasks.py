"""Supabase persistence and business rules for the task tracker."""

from datetime import date
from functools import lru_cache
from typing import Any
from uuid import UUID

import httpx
from pydantic import TypeAdapter, ValidationError

from app.core.config import get_settings
from app.core.security import AuthenticatedUser
from app.schemas.tasks import (
    TaskCreate,
    TaskItem,
    TaskPriority,
    TaskStatus,
    TaskUpdate,
)


class TaskConfigurationError(RuntimeError):
    """Raised when Supabase task storage has not been configured."""


class TaskMigrationRequiredError(TaskConfigurationError):
    """Raised when the task table does not exist in Supabase."""


class TaskProviderError(RuntimeError):
    """Raised when Supabase returns an error or malformed data."""


class TaskNotFoundError(LookupError):
    """Raised when a task is absent or does not belong to the user."""


class TaskConflictError(RuntimeError):
    """Raised for invalid transitions or concurrent task status changes."""


_TASKS_ADAPTER = TypeAdapter(list[TaskItem])
_TASK_SELECT = (
    "id,user_id,title,description,status,priority,due_date,created_at,"
    "updated_at,completed_at"
)


class SupabaseTaskRepository:
    """Access tasks through PostgREST using the signed-in user's JWT."""

    def __init__(
        self,
        *,
        supabase_url: str | None,
        api_key: str | None,
        tasks_table: str,
        timeout_seconds: float,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._supabase_url = supabase_url.rstrip("/") if supabase_url else None
        self._api_key = api_key
        self._tasks_table = tasks_table
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=timeout_seconds)

    def _url(self) -> str:
        if not self._supabase_url or not self._api_key:
            raise TaskConfigurationError(
                "SUPABASE_URL and SUPABASE_API_KEY are required"
            )
        return f"{self._supabase_url}/rest/v1/{self._tasks_table}"

    def _headers(
        self,
        access_token: str,
        *,
        return_representation: bool = False,
    ) -> dict[str, str]:
        if not self._api_key:
            raise TaskConfigurationError("SUPABASE_API_KEY is required")
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "apikey": self._api_key,
            "Authorization": f"Bearer {access_token}",
        }
        if return_representation:
            headers["Prefer"] = "return=representation"
        return headers

    async def list_tasks(
        self,
        *,
        user_id: UUID,
        access_token: str,
    ) -> list[TaskItem]:
        response = await self._request(
            "GET",
            self._url(),
            params={
                "select": _TASK_SELECT,
                "user_id": f"eq.{user_id}",
                "order": "updated_at.desc,id.desc",
            },
            headers=self._headers(access_token),
        )
        tasks = self._parse_tasks(response)
        self._assert_owners(tasks, user_id)
        return tasks

    async def create_task(
        self,
        *,
        user_id: UUID,
        access_token: str,
        task: TaskCreate,
    ) -> TaskItem:
        response = await self._request(
            "POST",
            self._url(),
            json={"user_id": str(user_id), **task.model_dump(mode="json")},
            headers=self._headers(access_token, return_representation=True),
        )
        created = self._one_task(response, action="created")
        self._assert_owners([created], user_id)
        return created

    async def get_task(
        self,
        *,
        task_id: UUID,
        user_id: UUID,
        access_token: str,
    ) -> TaskItem:
        response = await self._request(
            "GET",
            self._url(),
            params={
                "select": _TASK_SELECT,
                "id": f"eq.{task_id}",
                "user_id": f"eq.{user_id}",
                "limit": "1",
            },
            headers=self._headers(access_token),
        )
        tasks = self._parse_tasks(response)
        if not tasks:
            raise TaskNotFoundError("Task not found")
        task = tasks[0]
        self._assert_owners([task], user_id)
        return task

    async def update_task(
        self,
        *,
        task_id: UUID,
        user_id: UUID,
        access_token: str,
        updates: dict[str, Any],
        expected_status: TaskStatus | None = None,
    ) -> TaskItem:
        params = {
            "id": f"eq.{task_id}",
            "user_id": f"eq.{user_id}",
        }
        if expected_status is not None:
            # Compare-and-set prevents two requests from moving the same task
            # through conflicting status transitions.
            params["status"] = f"eq.{expected_status}"

        response = await self._request(
            "PATCH",
            self._url(),
            params=params,
            json=updates,
            headers=self._headers(access_token, return_representation=True),
        )
        tasks = self._parse_tasks(response)
        if not tasks:
            if expected_status is not None:
                await self.get_task(
                    task_id=task_id,
                    user_id=user_id,
                    access_token=access_token,
                )
                raise TaskConflictError(
                    "The task status changed while the update was in progress"
                )
            raise TaskNotFoundError("Task not found")

        updated = self._one_task(response, action="updated")
        self._assert_owners([updated], user_id)
        return updated

    async def delete_task(
        self,
        *,
        task_id: UUID,
        user_id: UUID,
        access_token: str,
    ) -> None:
        # PostgREST returns an empty success when RLS hides a row. Resolve it
        # first so callers still receive an accurate 404 response.
        await self.get_task(
            task_id=task_id,
            user_id=user_id,
            access_token=access_token,
        )
        await self._request(
            "DELETE",
            self._url(),
            params={
                "id": f"eq.{task_id}",
                "user_id": f"eq.{user_id}",
            },
            headers=self._headers(access_token),
        )

    async def _request(self, method: str, url: str, **kwargs: object) -> httpx.Response:
        try:
            response = await self._client.request(method, url, **kwargs)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            if self._is_missing_table_response(exc.response):
                raise TaskMigrationRequiredError(
                    "The Supabase task migration has not been applied"
                ) from exc
            raise TaskProviderError("Supabase task request failed") from exc
        except httpx.RequestError as exc:
            raise TaskProviderError("Supabase task request failed") from exc

    @staticmethod
    def _is_missing_table_response(response: httpx.Response) -> bool:
        if response.status_code != 404:
            return False
        try:
            body = response.json()
        except ValueError:
            return False
        return isinstance(body, dict) and body.get("code") == "PGRST205"

    @staticmethod
    def _parse_tasks(response: httpx.Response) -> list[TaskItem]:
        try:
            return _TASKS_ADAPTER.validate_python(response.json())
        except (ValueError, ValidationError) as exc:
            raise TaskProviderError("Supabase returned invalid task data") from exc

    @classmethod
    def _one_task(cls, response: httpx.Response, *, action: str) -> TaskItem:
        tasks = cls._parse_tasks(response)
        if len(tasks) != 1:
            raise TaskProviderError(f"Supabase did not return the {action} task")
        return tasks[0]

    @staticmethod
    def _assert_owners(tasks: list[TaskItem], user_id: UUID) -> None:
        if any(task.user_id != user_id for task in tasks):
            raise TaskProviderError("Supabase returned another user's task")

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()


_ALLOWED_TRANSITIONS: dict[TaskStatus, frozenset[TaskStatus]] = {
    "upcoming": frozenset({"upcoming", "in_progress"}),
    "in_progress": frozenset({"in_progress", "completed"}),
    "completed": frozenset({"completed"}),
}
_STATUS_ORDER: dict[TaskStatus, int] = {
    "upcoming": 0,
    "in_progress": 1,
    "completed": 2,
}
_PRIORITY_ORDER: dict[TaskPriority, int] = {
    "high": 0,
    "medium": 1,
    "low": 2,
}


class TaskService:
    """Apply task workflow rules around the Supabase repository."""

    def __init__(self, *, repository: SupabaseTaskRepository) -> None:
        self._repository = repository

    async def list_tasks(self, user: AuthenticatedUser) -> list[TaskItem]:
        tasks = await self._repository.list_tasks(
            user_id=user.id,
            access_token=user.access_token,
        )
        return sorted(tasks, key=_task_sort_key)

    async def create_task(
        self,
        user: AuthenticatedUser,
        task: TaskCreate,
    ) -> TaskItem:
        return await self._repository.create_task(
            user_id=user.id,
            access_token=user.access_token,
            task=task,
        )

    async def update_task(
        self,
        user: AuthenticatedUser,
        task_id: UUID,
        request: TaskUpdate,
    ) -> TaskItem:
        current = await self._repository.get_task(
            task_id=task_id,
            user_id=user.id,
            access_token=user.access_token,
        )
        updates = request.model_dump(exclude_unset=True, mode="json")

        expected_status: TaskStatus | None = None
        if "status" in request.model_fields_set:
            requested_status = request.status
            if requested_status is None:  # Guarded by schema validation.
                raise TaskConflictError("Task status cannot be null")
            if requested_status not in _ALLOWED_TRANSITIONS[current.status]:
                raise TaskConflictError(
                    f"Task status cannot move from {current.status} "
                    f"to {requested_status}"
                )
            expected_status = current.status

        return await self._repository.update_task(
            task_id=task_id,
            user_id=user.id,
            access_token=user.access_token,
            updates=updates,
            expected_status=expected_status,
        )

    async def delete_task(
        self,
        user: AuthenticatedUser,
        task_id: UUID,
    ) -> None:
        await self._repository.delete_task(
            task_id=task_id,
            user_id=user.id,
            access_token=user.access_token,
        )


def _task_sort_key(task: TaskItem) -> tuple[int, int, int, float]:
    """Group by workflow, then order active tasks by priority and due date."""

    status_order = _STATUS_ORDER[task.status]
    if task.status == "completed":
        completed_at = task.completed_at or task.updated_at
        return status_order, 0, 0, -completed_at.timestamp()

    due_date_order = (
        task.due_date.toordinal() if task.due_date else date.max.toordinal()
    )
    return (
        status_order,
        _PRIORITY_ORDER[task.priority],
        due_date_order,
        -task.updated_at.timestamp(),
    )


@lru_cache
def get_task_repository() -> SupabaseTaskRepository:
    settings = get_settings()
    return SupabaseTaskRepository(
        supabase_url=settings.supabase_url,
        api_key=settings.supabase_api_key,
        tasks_table=settings.supabase_tasks_table,
        timeout_seconds=settings.supabase_request_timeout_seconds,
    )


@lru_cache
def get_task_service() -> TaskService:
    return TaskService(repository=get_task_repository())


async def close_task_repository() -> None:
    get_task_service.cache_clear()
    if not get_task_repository.cache_info().currsize:
        return
    repository = get_task_repository()
    await repository.close()
    get_task_repository.cache_clear()
