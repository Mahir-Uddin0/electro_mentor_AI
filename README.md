# ElectroMentor AI RAG backend

The project uses the Gemini Developer API for every AI operation. The retrieval
pipeline reads PDFs, converts them to Markdown, creates semantic chunks with
Gemini embeddings, and persists normalized 768-dimensional vectors in Chroma.
Runtime search embeds each query with the same Gemini model and queries Chroma
directly with the resulting vector. Grounded chat answers are generated with
the stable, free-tier-capable `gemini-3.7-flash` model.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Put your Gemini API key in `.env`:

```env
GEMINI_API_KEY=your-key
```

## Supabase authentication and chat history

Run `supabase/chat_messages.sql` in the Supabase SQL editor to create the
message table, index, and read-only Row Level Security policy. Then configure:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_API_KEY=your-publishable-or-anon-key
SUPABASE_JWT_SECRET=your-legacy-hs256-jwt-secret
SUPABASE_CHAT_MESSAGES_TABLE=chat_messages
CHAT_HISTORY_MESSAGE_LIMIT=7
```

Keep `SUPABASE_JWT_SECRET` on the backend only. `SUPABASE_API_KEY` should be the
project's publishable or legacy anon key; the backend forwards the verified
user access token to the Data API so the user's RLS policy remains active.

Both `POST /api/v1/chat` and `GET /api/v1/chat/history` require:

```http
Authorization: Bearer <supabase-user-access-token>
```

The JWT signature and its issuer, audience, expiry, role, and subject are
verified locally. After verification, the latest configured number of messages
is fetched from Supabase and returned in chronological order. The chat route
fetches this context but does not pass it into the RAG prompt yet.

## Ingest all PDFs

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

## Run the API

```bash
uvicorn app.main:app --reload
```

The chat endpoint at `POST /api/v1/chat` retrieves context from the persistent
Chroma collection using a Gemini `RETRIEVAL_QUERY` embedding, adds the chunks
to a grounded prompt, and sends that prompt to Gemini for answer generation.

## Verify

```bash
pytest -q
ruff check .
```
