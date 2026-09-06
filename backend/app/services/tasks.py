"""SQLite persistence and business rules for the task tracker."""

from datetime import UTC, date, datetime
from typing import Annotated, Any, Protocol
from uuid import UUID, uuid4

from fastapi import Depends
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser
from app.db.models import TaskRecord
from app.db.session import get_db_session
from app.schemas.tasks import (
    TaskCreate,
    TaskItem,
    TaskPriority,
    TaskStatus,
    TaskUpdate,
)


class TaskStorageError(RuntimeError):
    """Raised when local task persistence fails."""


class TaskNotFoundError(LookupError):
    """Raised when a task is absent or does not belong to the user."""


class TaskConflictError(RuntimeError):
    """Raised for invalid transitions or concurrent task status changes."""


class TaskRepository(Protocol):
    def list_tasks(self, *, user_id: UUID) -> list[TaskItem]: ...

    def create_task(self, *, user_id: UUID, task: TaskCreate) -> TaskItem: ...

    def get_task(self, *, task_id: UUID, user_id: UUID) -> TaskItem: ...

    def update_task(
        self,
        *,
        task_id: UUID,
        user_id: UUID,
        updates: dict[str, Any],
        expected_status: TaskStatus | None = None,
    ) -> TaskItem: ...

    def delete_task(self, *, task_id: UUID, user_id: UUID) -> None: ...


def _utcnow() -> datetime:
    # SQLite stores UTC timestamps without an offset.
    return datetime.now(UTC).replace(tzinfo=None)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)


def _to_task_item(record: TaskRecord) -> TaskItem:
    return TaskItem.model_validate(
        {
            "id": record.id,
            "user_id": record.user_id,
            "title": record.title,
            "description": record.description,
            "status": record.status,
            "priority": record.priority,
            "due_date": record.due_date,
            "created_at": _as_utc(record.created_at),
            "updated_at": _as_utc(record.updated_at),
            "completed_at": _as_utc(record.completed_at),
        }
    )


class SQLiteTaskRepository:
    """Persist tasks locally, scoping every operation to the owning user."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def list_tasks(self, *, user_id: UUID) -> list[TaskItem]:
        try:
            records = self._session.scalars(
                select(TaskRecord).where(TaskRecord.user_id == str(user_id))
            ).all()
        except SQLAlchemyError as exc:
            raise TaskStorageError("Could not read tasks from SQLite") from exc
        return [_to_task_item(record) for record in records]

    def create_task(self, *, user_id: UUID, task: TaskCreate) -> TaskItem:
        now = _utcnow()
        record = TaskRecord(
            id=str(uuid4()),
            user_id=str(user_id),
            title=task.title,
            description=task.description,
            status=task.status,
            priority=task.priority,
            due_date=task.due_date,
            created_at=now,
            updated_at=now,
            completed_at=now if task.status == "completed" else None,
        )
        self._session.add(record)
        try:
            self._session.commit()
            self._session.refresh(record)
        except SQLAlchemyError as exc:
            self._session.rollback()
            raise TaskStorageError("Could not create task in SQLite") from exc
        return _to_task_item(record)

    def get_task(self, *, task_id: UUID, user_id: UUID) -> TaskItem:
        record = self._get_owned_record(task_id=task_id, user_id=user_id)
        return _to_task_item(record)

    def update_task(
        self,
        *,
        task_id: UUID,
        user_id: UUID,
        updates: dict[str, Any],
        expected_status: TaskStatus | None = None,
    ) -> TaskItem:
        values = dict(updates)
        values["updated_at"] = _utcnow()
        if values.get("status") == "completed":
            values["completed_at"] = func.coalesce(
                TaskRecord.completed_at,
                _utcnow(),
            )
        elif "status" in values:
            values["completed_at"] = None

        statement = update(TaskRecord).where(
            TaskRecord.id == str(task_id),
            TaskRecord.user_id == str(user_id),
        )
        if expected_status is not None:
            # Compare-and-set prevents competing requests from applying a
            # transition based on stale task state.
            statement = statement.where(TaskRecord.status == expected_status)

        try:
            result = self._session.execute(statement.values(**values))
            if result.rowcount != 1:
                self._session.rollback()
                if expected_status is not None:
                    self._get_owned_record(task_id=task_id, user_id=user_id)
                    raise TaskConflictError(
                        "The task status changed while the update was in progress"
                    )
                raise TaskNotFoundError("Task not found")
            self._session.commit()
            return self.get_task(task_id=task_id, user_id=user_id)
        except (TaskConflictError, TaskNotFoundError):
            raise
        except SQLAlchemyError as exc:
            self._session.rollback()
            raise TaskStorageError("Could not update task in SQLite") from exc

    def delete_task(self, *, task_id: UUID, user_id: UUID) -> None:
        try:
            result = self._session.execute(
                delete(TaskRecord).where(
                    TaskRecord.id == str(task_id),
                    TaskRecord.user_id == str(user_id),
                )
            )
            if result.rowcount != 1:
                self._session.rollback()
                raise TaskNotFoundError("Task not found")
            self._session.commit()
        except TaskNotFoundError:
            raise
        except SQLAlchemyError as exc:
            self._session.rollback()
            raise TaskStorageError("Could not delete task from SQLite") from exc

    def _get_owned_record(self, *, task_id: UUID, user_id: UUID) -> TaskRecord:
        try:
            record = self._session.scalar(
                select(TaskRecord).where(
                    TaskRecord.id == str(task_id),
                    TaskRecord.user_id == str(user_id),
                )
            )
        except SQLAlchemyError as exc:
            raise TaskStorageError("Could not read task from SQLite") from exc
        if record is None:
            raise TaskNotFoundError("Task not found")
        return record


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
    """Apply task workflow and ownership rules around local persistence."""

    def __init__(self, *, repository: TaskRepository) -> None:
        self._repository = repository

    def list_tasks(self, user: AuthenticatedUser) -> list[TaskItem]:
        tasks = self._repository.list_tasks(user_id=user.id)
        return sorted(tasks, key=_task_sort_key)

    def create_task(
        self,
        user: AuthenticatedUser,
        task: TaskCreate,
    ) -> TaskItem:
        return self._repository.create_task(user_id=user.id, task=task)

    def update_task(
        self,
        user: AuthenticatedUser,
        task_id: UUID,
        request: TaskUpdate,
    ) -> TaskItem:
        current = self._repository.get_task(task_id=task_id, user_id=user.id)
        updates = request.model_dump(exclude_unset=True, mode="python")

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

        return self._repository.update_task(
            task_id=task_id,
            user_id=user.id,
            updates=updates,
            expected_status=expected_status,
        )

    def delete_task(
        self,
        user: AuthenticatedUser,
        task_id: UUID,
    ) -> None:
        self._repository.delete_task(task_id=task_id, user_id=user.id)


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


def get_task_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> TaskService:
    return TaskService(repository=SQLiteTaskRepository(session))
