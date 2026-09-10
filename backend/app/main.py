import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import Response

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.language import ResponseLanguageMiddleware
from app.db.session import initialize_database
from app.observability import PrometheusMiddleware
from app.services.llm import close_llm_client
from app.services.photo_analysis import close_photo_analysis_service
from app.services.practical_assessments import close_practical_assessment_service
from app.services.safety_checklist_generation import (
    close_safety_checklist_generation_service,
)

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    initialize_database(get_settings())
    yield
    await close_llm_client()
    await close_photo_analysis_service()
    await close_practical_assessment_service()
    await close_safety_checklist_generation_service()


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="RAG and chat API for electrical skills training.",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.add_middleware(ResponseLanguageMiddleware)
    application.add_middleware(PrometheusMiddleware)
    application.include_router(api_router, prefix=settings.api_v1_prefix)

    @application.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        return Response(
            content=generate_latest(),
            headers={"Content-Type": CONTENT_TYPE_LATEST},
        )

    @application.exception_handler(Exception)
    async def unhandled_exception(_: Request, _exc: Exception) -> JSONResponse:
        logger.error("Unhandled backend request error")
        return JSONResponse(
            status_code=500,
            content={"detail": "An unexpected error occurred."},
        )

    return application


app = create_app()
