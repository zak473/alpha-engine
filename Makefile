.PHONY: dev dev-api dev-frontend lint format check test test-watch migrate migrate-new migrate-down build logs ps

# ─── Full stack ────────────────────────────────────────────────────────────
dev:
	docker compose up --build

# ─── Individual services ──────────────────────────────────────────────────
dev-api:
	uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

dev-frontend:
	cd frontend && npm run dev

# ─── Linting ──────────────────────────────────────────────────────────────
lint:
	ruff check .
	cd frontend && npm run lint

# ─── Formatting ───────────────────────────────────────────────────────────
format:
	ruff format .
	cd frontend && npx prettier --write "src/**/*.{ts,tsx}"

# ─── Type checking ────────────────────────────────────────────────────────
check:
	cd frontend && npx tsc --noEmit

# ─── Tests ────────────────────────────────────────────────────────────────
test:
	pytest tests/ -v --tb=short

test-watch:
	pytest tests/ -v --tb=short -f

# ─── Database migrations ──────────────────────────────────────────────────
migrate:
	alembic upgrade head

migrate-new:
	@read -p "Migration name: " name; alembic revision --autogenerate -m "$$name"

migrate-down:
	alembic downgrade -1

# ─── Docker helpers ───────────────────────────────────────────────────────
build:
	docker compose build

logs:
	docker compose logs -f api

ps:
	docker compose ps
