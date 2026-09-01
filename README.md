# ElectroMentor AI

This repository contains two applications:

- `frontend/` — the Next.js 16 and React 19 product UI, Supabase browser authentication, and backend API client.
- `backend/` — the FastAPI, Gemini RAG, Supabase JWT verification, and chat-history service.

See [`frontend/README.md`](frontend/README.md) for frontend setup, environment variables, and the complete 20-route screen map.

## Frontend quick start

Use Node.js 22 or newer:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Mock API mode is enabled by default, so the UI works before Supabase and the remaining FastAPI endpoints are configured.

## RAG backend

The project uses the Gemini Developer API for every AI operation. The retrieval
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

Put your Gemini API key in `.env`:

```env
GEMINI_API_KEY=your-key

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
limiter, so normal chat retrieval remains responsive.

Gemini limits are enforced per project and can include requests per minute,
tokens per minute, and requests per day. The local limiter cannot account for
traffic from another process or API key in the same project, and it cannot
create additional daily quota. Keep these settings below the active limits
shown for your project in Google AI Studio; if the daily allowance is already
exhausted, resume ingestion after the provider resets it.

### Supabase authentication and user-owned data

Run `backend/supabase/chat_messages.sql` in the Supabase SQL editor. It creates
the named-conversation and ordered-message tables, upgrades any rows from the
old flat history schema, and installs ownership constraints, indexes, grants,
triggers, and Row Level Security policies. Also run
`backend/supabase/tasks.sql` for the task tracker and
`backend/supabase/practical_assessment.sql` for each user's one-time learner
profile. Then configure `backend/.env`:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_API_KEY=your-publishable-or-anon-key
# Server-only secret key used for trusted profile writes. Never expose it
# through a NEXT_PUBLIC_* variable.
SUPABASE_SECRET_KEY=your-sb_secret-key-or-legacy-service-role-jwt
# Optional: required only if the project still issues legacy HS256 tokens.
SUPABASE_JWT_SECRET=your-legacy-hs256-jwt-secret
SUPABASE_CONVERSATIONS_TABLE=conversations
SUPABASE_CHAT_MESSAGES_TABLE=chat_messages
SUPABASE_TASKS_TABLE=tasks
SUPABASE_PRACTICAL_ASSESSMENTS_TABLE=practical_assessments
CHAT_HISTORY_MESSAGE_LIMIT=7
```

Keep `SUPABASE_JWT_SECRET` and `SUPABASE_SECRET_KEY` on the backend only.
Current ES256/RS256 tokens are
verified locally with Supabase's cached public JWKS and do not need that secret.
`SUPABASE_API_KEY` should be the project's publishable or legacy anon key; the
backend forwards the verified user access token to the Data API so the user's
RLS policy remains active.

All `/api/v1/conversations` endpoints require:

```http
Authorization: Bearer <supabase-user-access-token>
```

The JWT signature and its issuer, audience, expiry, role, and subject are
verified locally. Users can list, create, open, rename, and delete only their
own conversations. Sending a message stores the user turn, loads only the latest
seven prior messages from that conversation for Gemini, then stores the grounded
assistant answer and its RAG citations. Opening a conversation returns its full
stored history for the frontend.

The authenticated `/api/v1/tasks` endpoints list, create, update, and delete
only the current user's tasks. Task status advances from `upcoming` to
`in_progress` to `completed`; active tasks are ordered by priority and due date.

The authenticated `/api/v1/practical-assessments` workflow creates a one-time
electrical learner profile. It accepts an optional MP4/MOV/WebM introduction
video and returns ten fixed questions about the user's experience, training,
safety habits, tools, troubleshooting approach, documentation, support needs,
and learning preferences. Gemini suggests only answers directly supported by
the video; unsupported answers stay empty, and every suggestion remains editable
before all ten final question-and-answer records are saved for that user.

Gemini then produces self-reported competency estimates and learning suggestions,
not a work evaluation, qualification, or safety certification. Raw video bytes
are not stored in Supabase. Once completed, the profile row is immutable and its
compact summary is included as untrusted personalization context in later RAG
chats without weakening electrical-safety instructions. See
`backend/supabase/README.md` for the endpoint and migration details.

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
