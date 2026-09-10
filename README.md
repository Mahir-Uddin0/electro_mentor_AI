# ElectroMentor AI

This repository contains two applications:

- `frontend/` — the Next.js 16 and React 19 product UI, local authentication
  session client, and backend API client.
- `backend/` — the FastAPI, local SQLite authentication, Gemini RAG, and
  user-owned feature services.

See [`frontend/README.md`](frontend/README.md) for frontend setup, environment variables, and the complete 20-route screen map.

## Docker Compose deployment

Docker Compose runs the production frontend and backend on the same host. The
frontend proxies browser API calls to the backend over the private Compose
network, so no public hostname or Nginx configuration is required.

```bash
cp .env.example .env
# Set independent AUTH_JWT_SECRET and API_KEY_ENCRYPTION_SECRET values.
docker compose up --build -d
docker compose ps
```

Open the frontend at `http://SERVER_HOST:3000`. FastAPI is exposed at
`http://SERVER_HOST:8000`, and its existing health endpoint is
`http://SERVER_HOST:8000/api/v1/health`.

The named `backend_data` volume is mounted at `/app/data`. It retains the
SQLite database, uploaded assessment videos, generated RAG data, and bundled
document libraries when the backend container is recreated. To deploy a new
image without deleting that data, use `docker compose up --build -d`; do not
run `docker compose down --volumes` unless the stored data should be erased.

## Frontend quick start

Use Node.js 22 or newer:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Mock API mode is enabled by default, so the UI
works before the remaining FastAPI endpoints are configured.

## RAG backend

The project uses the Gemini Developer API for every AI operation. Each signed-in
user adds their own key in Settings; the backend encrypts it at rest and uses it
only for that user's runtime requests. The retrieval
pipeline reads PDFs, converts them to Markdown, creates semantic chunks with
Gemini embeddings, and persists normalized 768-dimensional vectors in Chroma.
Runtime search embeds each query with the same Gemini model and queries Chroma
directly with the resulting vector. Grounded chat answers are generated with
the stable, free-tier-capable `gemini-3.7-flash` model.

### Setup

```bash
cd backend
uv sync
```

Configure backend security in `.env`:

```env
AUTH_JWT_SECRET=replace-with-output-from-openssl-rand-hex-32
API_KEY_ENCRYPTION_SECRET=use-a-second-openssl-rand-hex-32-output

# Optional: used only by the offline PDF-ingestion command.
GEMINI_API_KEY=optional-ingestion-key

# Conservative PDF-ingestion pacing. Check your active project limits in
# Google AI Studio before increasing these values.
GEMINI_EMBEDDING_BATCH_SIZE=5
GEMINI_EMBEDDING_REQUESTS_PER_MINUTE=5
GEMINI_EMBEDDING_TOKENS_PER_MINUTE=10000
GEMINI_EMBEDDING_MAX_RETRIES=8
GEMINI_EMBEDDING_RETRY_BASE_SECONDS=15
GEMINI_EMBEDDING_RETRY_MAX_SECONDS=120
```

The ingestion embedder spaces requests approximately 12 seconds apart at the
default five-request-per-minute limit. It also splits large batches using a
conservative local token estimate and enforces that estimated budget over a
rolling minute. A Gemini `429`, timeout, or temporary server error is retried
with exponential backoff, jitter, and the provider's `Retry-After` value when
one is supplied. Runtime query embeddings do not use the slow ingestion
limiter, so normal chat retrieval remains responsive and uses the signed-in
user's key.

Gemini limits are enforced per project and can include requests per minute,
tokens per minute, and requests per day. The local limiter cannot account for
traffic from another process or API key in the same project, and it cannot
create additional daily quota. Keep these settings below the active limits
shown for your project in Google AI Studio; if the daily allowance is already
exhausted, resume ingestion after the provider resets it.

### Local SQLite authentication

Authentication is owned by FastAPI and stored locally in the `users` and
`refresh_sessions` SQLite tables. On startup the backend creates
`data/electromentor.db` and these tables when they do not exist. Configure:

```env
DATABASE_URL=sqlite:///data/electromentor.db
AUTH_JWT_SECRET=replace-with-output-from-openssl-rand-hex-32
API_KEY_ENCRYPTION_SECRET=replace-with-a-different-openssl-rand-hex-32-output
AUTH_JWT_ISSUER=electromentor-api
AUTH_JWT_AUDIENCE=electromentor-web
AUTH_ACCESS_TOKEN_MINUTES=15
AUTH_REFRESH_TOKEN_DAYS=14
```

Generate both secrets separately with `openssl rand -hex 32`. Keep the API-key
encryption secret stable across deployments; changing it makes saved keys
unreadable, so users must delete and add them again. Registration and login return
a short-lived backend-signed access JWT and an opaque, rotating refresh token.
Only the refresh token's SHA-256 digest is stored in SQLite. The endpoints are:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
GET  /api/v1/settings/gemini-api-key
PUT  /api/v1/settings/gemini-api-key
DELETE /api/v1/settings/gemini-api-key
```

Send the access JWT to protected backend endpoints with:

```http
Authorization: Bearer <backend-access-token>
```

### Local SQLite task tracker

The authenticated task API now stores task data in the same local SQLite
database as authentication. FastAPI creates the `tasks` table, constraints,
ownership index, foreign key, and status-transition trigger at startup; no
separate schema migration command or external task configuration is required.

Every task query combines the requested task ID with the authenticated user's
ID from the backend JWT. As a result, users can list and mutate only their own
tasks, and another user's task is returned as `404 Not Found` rather than being
revealed. Deleting a user also deletes that user's tasks through the database
foreign key.

The endpoints remain unchanged:

```text
GET    /api/v1/tasks
POST   /api/v1/tasks
PATCH  /api/v1/tasks/{task_id}
DELETE /api/v1/tasks/{task_id}
```

Task status advances from `upcoming` to `in_progress` to `completed`. The
service validates transitions and the SQLite trigger enforces the same rule at
the database boundary. Active tasks are ordered by priority and due date.

### Local SQLite conversations and practical assessments

Conversations, ordered chat messages, and practical-assessment records are
stored in the same local SQLite database as authentication and tasks. FastAPI
creates the required tables, ownership constraints, indexes, and triggers at
startup. No separate schema command or external database service is required.
Configure the local paths and chat-context limit in `backend/.env`:

```env
DATABASE_URL=sqlite:///data/electromentor.db
CHAT_HISTORY_MESSAGE_LIMIT=7
PRACTICAL_ASSESSMENT_VIDEO_DIRECTORY=data/practical_assessment_videos
PRACTICAL_ASSESSMENT_MAX_VIDEO_BYTES=100000000
```

Users can list, create, open, rename, and delete only their own conversations.
Sending a message stores the user turn, loads only the latest
seven prior messages from that conversation for Gemini, then stores the grounded
assistant answer and its RAG citations. Opening a conversation returns its full
stored history for the frontend.

The authenticated `/api/v1/practical-assessments` workflow accepts a required
MP4, MOV, or WebM practical-work video and generates ten questions. The video is
kept in the configured private server directory; SQLite stores its private path,
metadata, questions, editable answers, and evaluation. Video files are never
placed in the frontend's public directory or exposed through a public URL.

Gemini suggests only answers supported by the video. Unsupported answers stay
empty, and every suggestion remains editable before evaluation. A user may have
one active draft and any number of completed assessments. Completed results are
available through the authenticated history and detail endpoints and cannot be
edited.

### Ingest all PDFs

Place source files in `data/raw_pdfs`, then run the complete pipeline:

```bash
python -m rag.ingestion.pipeline
```

The generated artifacts are:

- `data/markdown/<document>.md`
- `data/chunks/<document>.jsonl`
- `data/chroma/` persistent vector database

Unchanged documents are skipped based on their SHA-256 hash and the embedding
and chunking configuration stored with their Chroma records. To rebuild them:

```bash
python -m rag.ingestion.pipeline --force
```

### Run the API

```bash
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The endpoint at
`POST /api/v1/conversations/{conversation_id}/messages` retrieves context from
the persistent Chroma collection using a Gemini `RETRIEVAL_QUERY` embedding,
combines it with the selected conversation's recent messages, and sends the
grounded prompt to Gemini for answer generation and persistence.

### Safety-checklist PDFs

Place downloadable checklist PDFs in `backend/data/safety_checklist`. The
authenticated `GET /api/v1/safety-checklists` endpoint discovers the directory
on every request and returns filename-derived titles, PDF metadata, page counts,
file sizes, categories, and stable document IDs. The authenticated
`GET /api/v1/safety-checklists/{checklist_id}/file` endpoint opens the selected
PDF inline; add `?download=true` to request attachment disposition. Adding or
removing a PDF does not require a code change or database migration.

The authenticated `POST /api/v1/safety-checklists/generate` endpoint sends a
specific electrical-task description to Gemini and returns schema-validated JSON
with a title, task summary, ordered sections, and prioritized checklist items. The
same structured response reports `invalid_prompt` with no checklist content when
the input is gibberish, unrelated, or too vague. The frontend calls this real
endpoint by default; `NEXT_PUBLIC_USE_MOCK_CHECKLIST_API=true` explicitly enables
the local preview response instead.

### Wiring and circuit guide PDFs

Place guide PDFs in `backend/data/wiring_circuit_guide_library`. The
authenticated `GET /api/v1/guides` endpoint returns live PDF metadata and stable
IDs; `GET /api/v1/guides/{guide_id}/file` streams the selected guide inline or
as an attachment when called with `?download=true`. Filenames containing
newlines or control characters are cleaned for display and download while the
real filesystem path remains private. The frontend guide catalog, search,
categories, sorting, viewer, and downloads all use these endpoints.

### Verify

```bash
uv run pytest -q
uv run ruff check .
```
