#!/bin/sh
# Startup script: start app immediately so Railway health check passes.
# DB wait and migrations are handled by the background startup thread in api/main.py.

echo "[start.sh] PORT=${PORT:-8000 (default)}"
echo "[start.sh] Starting uvicorn on port ${PORT:-8000}..."
exec uvicorn api.main:app --host 0.0.0.0 --port "${PORT:-8000}"
