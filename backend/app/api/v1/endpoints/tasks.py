"""Authenticated, user-owned task tracker endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.dependencies import get_current_user
from app.core.security import AuthenticatedUser
from app.schemas.tasks import TaskCreate, TaskItem, TaskListResponse, TaskUpdate
from app.services.tasks import (
    TaskConfigurationError,
    TaskConflictError,
    TaskMigrationRequiredError,
    TaskNotFoundError,
    TaskProviderError,
    TaskService,
    get_task_service,
)

router = APIRouter()

CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
TaskServiceDependency = Annotated[TaskService, Depends(get_task_service)]


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    user: CurrentUser,
    service: TaskServiceDependency,
) -> TaskListResponse:
    try:
        return TaskListResponse(tasks=await service.list_tasks(user))
    except (TaskConfigurationError, TaskProviderError) as exc:
        raise _translate_provider_error(exc) from exc


@router.post("", response_model=TaskItem, status_code=status.HTTP_201_CREATED)
async def create_task(
    request: TaskCreate,
    user: CurrentUser,
    service: TaskServiceDependency,
) -> TaskItem:
    try:
        return await service.create_task(user, request)
    except (TaskConfigurationError, TaskProviderError) as exc:
        raise _translate_provider_error(exc) from exc


@router.patch("/{task_id}", response_model=TaskItem)
async def update_task(
    task_id: UUID,
    request: TaskUpdate,
    user: CurrentUser,
    service: TaskServiceDependency,
) -> TaskItem:
    try:
        return await service.update_task(user, task_id, request)
    except TaskNotFoundError as exc:
        raise _not_found() from exc
    except TaskConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except (TaskConfigurationError, TaskProviderError) as exc:
        raise _translate_provider_error(exc) from exc


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    user: CurrentUser,
    service: TaskServiceDependency,
) -> Response:
    try:
        await service.delete_task(user, task_id)
    except TaskNotFoundError as exc:
        raise _not_found() from exc
    except (TaskConfigurationError, TaskProviderError) as exc:
        raise _translate_provider_error(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Task not found.",
    )


def _translate_provider_error(exc: Exception) -> HTTPException:
    if isinstance(exc, TaskMigrationRequiredError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "The Supabase task table is missing. Run "
                "backend/supabase/tasks.sql in the Supabase SQL Editor."
            ),
        )
    if isinstance(exc, TaskConfigurationError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase task storage is not configured.",
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Task storage is temporarily unavailable.",
    )
