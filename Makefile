.PHONY: install dev migrate test lint

install:
	pip install -e ".[dev]"

dev:
	uvicorn app.main:app --reload --port 8000

migrate:
	alembic upgrade head

test:
	pytest -v --cov=app --cov-report=term-missing

lint:
	ruff check app tests
	ruff format --check app tests
