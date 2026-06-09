# Mini-Dify — dev convenience targets
PY := backend/.venv/bin/python
PIP := backend/.venv/bin/pip
DB_URL ?= postgresql+asyncpg://minidify:minidify@localhost:5433/minidify

.PHONY: setup up down migrate api web test lint cli

setup:  ## create backend venv + install deps
	python3 -m venv backend/.venv
	$(PIP) install -e "backend/.[dev]"

up:  ## start Postgres + pgvector
	docker compose up -d db

down:  ## stop containers
	docker compose down

migrate:  ## apply DB migrations
	cd backend && DATABASE_URL=$(DB_URL) .venv/bin/alembic upgrade head

api:  ## run the API on :8000
	cd backend && DATABASE_URL=$(DB_URL) .venv/bin/uvicorn app.main:app --reload --port 8000

web:  ## run the frontend dev server (Phase 3)
	cd frontend && npm run dev

cli:  ## run the sample workflow headless
	cd backend && .venv/bin/python run_workflow.py sample_rag.json \
		--input '{"question":"What is the refund policy?"}' --kb sample_kb.json

test:  ## run the backend test suite
	cd backend && LLM_PROVIDER=mock .venv/bin/pytest -q

lint:  ## ruff check
	cd backend && .venv/bin/ruff check .
