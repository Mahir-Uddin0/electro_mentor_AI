FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
COPY rag ./rag

RUN pip install --no-cache-dir . \
    && addgroup --system app \
    && adduser --system --ingroup app app

COPY --chown=app:app data ./data

RUN mkdir -p /app/data/practical_assessment_videos \
    && chown -R app:app /app/data

USER app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
