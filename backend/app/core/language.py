"""Per-request response-language selection for AI-generated content."""

from contextvars import ContextVar, Token
from typing import Literal

ResponseLanguage = Literal["en", "bn"]

_response_language: ContextVar[ResponseLanguage] = ContextVar(
    "response_language",
    default="en",
)


def parse_response_language(value: str | None) -> ResponseLanguage:
    """Resolve the supported language from a standard Accept-Language value."""

    if not value:
        return "en"
    for preference in value.split(","):
        tag = preference.split(";", maxsplit=1)[0].strip().casefold()
        if tag == "bn" or tag.startswith("bn-"):
            return "bn"
        if tag == "en" or tag.startswith("en-"):
            return "en"
    return "en"


def get_response_language() -> ResponseLanguage:
    return _response_language.get()


def set_response_language(language: ResponseLanguage) -> Token[ResponseLanguage]:
    return _response_language.set(language)


def reset_response_language(token: Token[ResponseLanguage]) -> None:
    _response_language.reset(token)


def ai_language_instruction(*, structured: bool = False) -> str:
    """Return a strict language instruction for the current Gemini request."""

    if get_response_language() == "bn":
        instruction = (
            "Write all human-readable response text in natural Bangla using "
            "Bengali script. Use clear terminology suitable for a Bangladeshi "
            "electrical learner. Do not translate quoted source text."
        )
    else:
        instruction = "Write all human-readable response text in clear English."
    if structured:
        instruction += (
            " Preserve JSON keys, schema field names, IDs, competency identifiers, "
            "enum values, numeric values, and grade values exactly as required by "
            "the response schema; translate only human-readable text fields."
        )
    return instruction


class ResponseLanguageMiddleware:
    """Bind Accept-Language to a context variable for one ASGI request."""

    def __init__(self, app: object) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: object, send: object) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        header_value: str | None = None
        for name, value in scope.get("headers", []):
            if name.lower() == b"accept-language":
                header_value = value.decode("latin-1")
                break
        token = set_response_language(parse_response_language(header_value))
        try:
            await self.app(scope, receive, send)
        finally:
            reset_response_language(token)
