FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install -e .

COPY . .

# Migrations run in Railway's preDeployCommand (see railway.toml), not here.
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
