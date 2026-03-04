"""
Global exception handlers for FastAPI.
All error responses use a consistent JSON envelope:
{
    "error":      "NotFound",
    "message":    "Match abc123 not found",
    "request_id": "a1b2c3d4",
    "timestamp":  "2026-03-04T10:00:00Z"
}
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("alpha_engine.errors")

_STATUS_NAMES = {
    400: "BadRequest",
    401: "Unauthorized",
    403: "Forbidden",
    404: "NotFound",
    422: "ValidationError",
    429: "TooManyRequests",
    500: "InternalServerError",
    503: "ServiceUnavailable",
}


def _error_body(
    error: str,
    message: str,
    request_id: str | None = None,
) -> dict:
    return {
        "error": error,
        "message": message,
        "request_id": request_id or str(uuid.uuid4())[:8],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        request_id = getattr(request.state, "request_id", None)
        error_name = _STATUS_NAMES.get(exc.status_code, f"HTTP{exc.status_code}")
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(error_name, str(exc.detail), request_id),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", None)
        logger.exception(
            "Unhandled exception",
            extra={"request_id": request_id, "path": request.url.path},
        )
        return JSONResponse(
            status_code=500,
            content=_error_body(
                "InternalServerError",
                "An unexpected error occurred",
                request_id,
            ),
        )
