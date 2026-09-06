"""Authenticated, user-owned task tracker endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.dependencies import get_current_user
from app.core.security import AuthenticatedUser
from app.schemas.tasks import TaskCreate, TaskItem, TaskListResponse, TaskUpdate
from app.services.tasks import (
    TaskConflictError,
    TaskNotFoundError,
    TaskService,
    TaskStorageError,
    get_task_service,
)

router = APIRouter()

CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
TaskServiceDependency = Annotated[TaskService, Depends(get_task_service)]


@router.get("", response_model=TaskListResponse)
def list_tasks(
    user: CurrentUser,
    service: TaskServiceDependency,
) -> TaskListResponse:
    try:
        return TaskListResponse(tasks=service.list_tasks(user))
    except TaskStorageError as exc:
        raise _storage_unavailable() from exc


@router.post("", response_model=TaskItem, status_code=status.HTTP_201_CREATED)
def create_task(
    request: TaskCreate,
    user: CurrentUser,
    service: TaskServiceDependency,
) -> TaskItem:
    try:
        return service.create_task(user, request)
    except TaskStorageError as exc:
        raise _storage_unavailable() from exc


@router.patch("/{task_id}", response_model=TaskItem)
def update_task(
    task_id: UUID,
    request: TaskUpdate,
    user: CurrentUser,
    service: TaskServiceDependency,
) -> TaskItem:
    try:
        return service.update_task(user, task_id, request)
    except TaskNotFoundError as exc:
        raise _not_found() from exc
    except TaskConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except TaskStorageError as exc:
        raise _storage_unavailable() from exc


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: UUID,
    user: CurrentUser,
    service: TaskServiceDependency,
) -> Response:
    try:
        service.delete_task(user, task_id)
    except TaskNotFoundError as exc:
        raise _not_found() from exc
    except TaskStorageError as exc:
        raise _storage_unavailable() from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Task not found.",
    )


def _storage_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Task storage is temporarily unavailable.",
    )
