from fastapi import APIRouter

from app.api.v1.endpoints import conversations, health, photo_analysis

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
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
