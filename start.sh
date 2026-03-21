#!/bin/sh
# Startup script: wait for DB, run migrations, start app

set -e

echo "[start.sh] Waiting for database..."
MAX_ATTEMPTS=15
ATTEMPT=0
until python -c "
import sys
from sqlalchemy import create_engine, text
url = __import__('os').environ.get('DATABASE_URL') or __import__('os').environ.get('POSTGRES_DSN', '')
if url.startswith('postgres://'):
    url = 'postgresql://' + url[len('postgres://'):]
try:
    engine = create_engine(url)
    with engine.connect() as conn:
        conn.execute(text('SELECT 1'))
    print('DB ready.')
except Exception as e:
    print(f'DB not ready: {e}')
    sys.exit(1)
" 2>&1; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    echo "[start.sh] DB never became ready after $MAX_ATTEMPTS attempts. Starting anyway..."
    break
  fi
  echo "[start.sh] Attempt $ATTEMPT/$MAX_ATTEMPTS failed, retrying in 3s..."
  sleep 3
done

echo "[start.sh] Running migrations..."
alembic upgrade head || echo "[start.sh] Migration failed (continuing anyway)"

echo "[start.sh] Starting uvicorn..."
exec uvicorn api.main:app --host 0.0.0.0 --port "${PORT:-8000}"
