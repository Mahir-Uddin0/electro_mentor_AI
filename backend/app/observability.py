"""Low-cardinality Prometheus metrics for the API and its AI features."""

import asyncio
from collections.abc import Iterator
from contextlib import contextmanager
from time import perf_counter
from typing import Literal

from prometheus_client import Counter, Histogram
from starlette.types import ASGIApp, Message, Receive, Scope, Send

AI_FEATURES = (
    "assistant",
    "photo_analysis",
    "safety_checklist",
    "practical_assessment_questions",
    "practical_assessment_answers",
    "practical_assessment_evaluation",
)
OPERATION_STATUSES = ("success", "error", "cancelled")

AI_REQUEST_DURATION_BUCKETS = (
    0.1,
    0.25,
    0.5,
    1.0,
    2.5,
    5.0,
    10.0,
    30.0,
    60.0,
    120.0,
    300.0,
    600.0,
)
RAG_REQUEST_DURATION_BUCKETS = (
    0.01,
    0.025,
    0.05,
    0.1,
    0.25,
    0.5,
    1.0,
    2.5,
    5.0,
    10.0,
    30.0,
)
HTTP_REQUEST_DURATION_BUCKETS = (
    0.005,
    0.01,
    0.025,
    0.05,
    0.1,
    0.25,
    0.5,
    1.0,
    2.5,
    5.0,
    10.0,
    30.0,
    60.0,
    120.0,
    300.0,
    600.0,
)

ai_feature_requests_total = Counter(
    "ai_feature_requests_total",
    "Completed AI feature operations by feature and outcome.",
    ("feature", "status"),
)
ai_feature_request_duration_seconds = Histogram(
    "ai_feature_request_duration_seconds",
    "AI feature operation duration in seconds by feature and outcome.",
    ("feature", "status"),
    buckets=AI_REQUEST_DURATION_BUCKETS,
)
rag_requests_total = Counter(
    "rag_requests_total",
    "Completed RAG retrieval operations by outcome.",
    ("status",),
)
rag_request_duration_seconds = Histogram(
    "rag_request_duration_seconds",
    "RAG retrieval duration in seconds by outcome.",
    ("status",),
    buckets=RAG_REQUEST_DURATION_BUCKETS,
)
http_requests_total = Counter(
    "http_requests_total",
    "Completed HTTP requests by method, normalized route, and status code.",
    ("method", "route", "status_code"),
)
http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds by method, normalized route, and status code.",
    ("method", "route", "status_code"),
    buckets=HTTP_REQUEST_DURATION_BUCKETS,
)

# Export zero-valued AI/RAG series before the first operation so provisioned
# dashboards show zero rather than "no data" on a fresh deployment.
for _feature in AI_FEATURES:
    for _status in OPERATION_STATUSES:
        ai_feature_requests_total.labels(feature=_feature, status=_status)
        ai_feature_request_duration_seconds.labels(
            feature=_feature,
            status=_status,
        )
for _status in OPERATION_STATUSES:
    rag_requests_total.labels(status=_status)
    rag_request_duration_seconds.labels(status=_status)

AIStatus = Literal["success", "error", "cancelled"]


@contextmanager
def track_ai_feature(feature: str) -> Iterator[None]:
    """Measure one real AI-backed feature operation without sensitive labels."""

    if feature not in AI_FEATURES:
        raise ValueError(f"Unknown AI feature: {feature}")
    with _track_operation(
        counter=ai_feature_requests_total,
        histogram=ai_feature_request_duration_seconds,
        fixed_labels={"feature": feature},
    ):
        yield


@contextmanager
def track_rag_request() -> Iterator[None]:
    """Measure a retrieval operation used to supply assistant context."""

    with _track_operation(
        counter=rag_requests_total,
        histogram=rag_request_duration_seconds,
    ):
        yield


@contextmanager
def _track_operation(
    *,
    counter: Counter,
    histogram: Histogram,
    fixed_labels: dict[str, str] | None = None,
) -> Iterator[None]:
    started = perf_counter()
    status: AIStatus = "error"
    try:
        yield
    except asyncio.CancelledError:
        status = "cancelled"
        raise
    else:
        status = "success"
    finally:
        labels = {**(fixed_labels or {}), "status": status}
        counter.labels(**labels).inc()
        histogram.labels(**labels).observe(perf_counter() - started)


class PrometheusMiddleware:
    """Record HTTP metrics using route templates rather than raw URL paths."""

    def __init__(self, app: ASGIApp) -> None:
        self._app = app

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        if scope["type"] != "http" or _is_metrics_path(scope):
            await self._app(scope, receive, send)
            return

        started = perf_counter()
        response_status: int | None = None
        cancelled = False

        async def send_with_status(message: Message) -> None:
            nonlocal response_status
            if message["type"] == "http.response.start":
                response_status = int(message["status"])
            await send(message)

        try:
            await self._app(scope, receive, send_with_status)
        except asyncio.CancelledError:
            cancelled = True
            raise
        finally:
            status_code = response_status or (499 if cancelled else 500)
            labels = {
                "method": str(scope.get("method", "UNKNOWN")).upper(),
                "route": _route_template(scope),
                "status_code": str(status_code),
            }
            http_requests_total.labels(**labels).inc()
            http_request_duration_seconds.labels(**labels).observe(
                perf_counter() - started
            )


def _route_template(scope: Scope) -> str:
    fastapi_scope = scope.get("fastapi")
    if isinstance(fastapi_scope, dict):
        effective_route = fastapi_scope.get("effective_route_context")
        path_format = getattr(effective_route, "path_format", None)
        if isinstance(path_format, str) and path_format:
            return path_format

    route = scope.get("route")
    path = getattr(route, "path", None)
    return path if isinstance(path, str) and path else "unmatched"


def _is_metrics_path(scope: Scope) -> bool:
    path = str(scope.get("path", ""))
    return path.rstrip("/") == "/metrics"
