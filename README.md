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
```

### Supabase authentication and chat history

Run `backend/supabase/chat_messages.sql` in the Supabase SQL editor. It creates
the named-conversation and ordered-message tables, upgrades any rows from the
old flat history schema, and installs ownership constraints, indexes, grants,
triggers, and Row Level Security policies. Then configure `backend/.env`:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_API_KEY=your-publishable-or-anon-key
# Optional: required only if the project still issues legacy HS256 tokens.
SUPABASE_JWT_SECRET=your-legacy-hs256-jwt-secret
SUPABASE_CONVERSATIONS_TABLE=conversations
SUPABASE_CHAT_MESSAGES_TABLE=chat_messages
CHAT_HISTORY_MESSAGE_LIMIT=7
```

Keep `SUPABASE_JWT_SECRET` on the backend only. Current ES256/RS256 tokens are
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

### Verify

```bash
uv run pytest -q
uv run ruff check .
```
