# Tracery backend — production image
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# install the app package + its runtime dependencies (from pyproject.toml)
COPY . .
RUN pip install --upgrade pip && pip install -e .

# run DB migrations, then serve. Railway/Render inject $PORT.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
