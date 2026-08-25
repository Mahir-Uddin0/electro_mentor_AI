from fastapi import APIRouter

from app.api.v1.endpoints import (
    conversations,
    guides,
    health,
    photo_analysis,
    safety_checklists,
    tasks,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(guides.router, prefix="/guides", tags=["guides"])
api_router.include_router(
    conversations.router,
    prefix="/conversations",
    tags=["conversations"],
)
api_router.include_router(
    photo_analysis.router,
    prefix="/photo-analysis",
    tags=["photo analysis"],
)
api_router.include_router(
    safety_checklists.router,
    prefix="/safety-checklists",
    tags=["safety checklists"],
)
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
