# Supabase database migrations

## Conversation storage

Run [chat_messages.sql](./chat_messages.sql) once in **Supabase Dashboard -> SQL
Editor**. It creates (or upgrades) the following user-owned data model:

- `conversations`: one row for each named chat.
- `chat_messages`: ordered user and assistant turns belonging to one conversation.
- `chat_messages.sources`: the RAG citations saved with each assistant turn.

The migration preserves rows from the earlier single-history schema by placing
them in one `Imported chat` per user. It also installs indexes, update triggers,
foreign keys, grants, and row-level security policies.

The backend must use the Supabase project base URL and publishable key:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_API_KEY=your-publishable-key
SUPABASE_CONVERSATIONS_TABLE=conversations
SUPABASE_CHAT_MESSAGES_TABLE=chat_messages
CHAT_HISTORY_MESSAGE_LIMIT=7
```

Do not append `/rest/v1` to `SUPABASE_URL`; the backend adds that path. Every
Data API call includes the signed-in user's bearer token, so the SQL RLS policies
select and mutate only that user's rows.

The authenticated REST API is:

- `GET /api/v1/conversations`
- `POST /api/v1/conversations`
- `GET /api/v1/conversations/{conversation_id}`
- `PATCH /api/v1/conversations/{conversation_id}`
- `DELETE /api/v1/conversations/{conversation_id}`
- `POST /api/v1/conversations/{conversation_id}/messages`

Opening a conversation returns its complete stored history for the UI. Sending a
new message separately loads only the latest `CHAT_HISTORY_MESSAGE_LIMIT` prior
turns from that same conversation for Gemini prompt context.

## Missing-table error

If FastAPI reports that the Supabase conversation tables are missing, the
`.env` values do not create them automatically. Run `chat_messages.sql` in the
SQL Editor for the same project referenced by `SUPABASE_URL`. A PostgREST
`PGRST205` response means the migration has not been applied to that project.

## Task tracker

Run [tasks.sql](./tasks.sql) once in **Supabase Dashboard -> SQL Editor**. It
creates the `tasks` table with task status, priority, optional due date,
timestamps, ownership indexes, grants, and Row Level Security policies.

The API uses the same Supabase URL, publishable key, and signed-in user's bearer
token as conversation storage. The table name can be overridden if necessary:

```env
SUPABASE_TASKS_TABLE=tasks
```

The authenticated task API is:

- `GET /api/v1/tasks`
- `POST /api/v1/tasks`
- `PATCH /api/v1/tasks/{task_id}`
- `DELETE /api/v1/tasks/{task_id}`

Status changes are deliberately forward-only: `upcoming` can move to
`in_progress`, and `in_progress` can move to `completed`. Both the service and
the database trigger reject skipped or backward transitions. Active tasks are
returned by workflow section, priority (`high`, `medium`, `low`), and due date.

If FastAPI reports that the task table is missing, run `tasks.sql` in the same
Supabase project referenced by `SUPABASE_URL`.

## One-time learner-profile assessment

Run the current [practical_assessment.sql](./practical_assessment.sql) in
**Supabase Dashboard -> SQL Editor**. Run it again if you previously installed
the older practical/work-assessment schema: the updated SQL is also the v2
migration. It creates one active `practical_assessments` learner-profile row per
authenticated user, its ownership policy, immutable-completion trigger, strict
ten-answer JSON constraints, and restricted grants.

The v2 profile intentionally has no `topic` or `project_name`. During an upgrade,
the migration copies every incompatible v1 row to
`practical_assessment_legacy_archive` as a complete JSON snapshot before removing
that row from the active table. The archived table has no browser policy and the
server role has read-only access. The user's active singleton slot is therefore
available for the new profile without silently losing or reinterpreting the old
work-assessment record. Supabase administrators can inspect the archive in the
SQL Editor if necessary.

The assessment backend uses the publishable key plus the user's JWT for RLS
reads. Trusted draft and evaluation writes use a server-only Supabase secret:

```env
SUPABASE_PRACTICAL_ASSESSMENTS_TABLE=practical_assessments
SUPABASE_SECRET_KEY=your-sb_secret-key-or-legacy-service-role-jwt
```

Never add `SUPABASE_SECRET_KEY` to the frontend or to a `NEXT_PUBLIC_*`
variable. New `sb_secret_` values are sent only as Supabase API keys; legacy
`service_role` JWTs are supported by the backend for existing projects.
Create or copy a secret key under **Supabase Dashboard -> Project Settings ->
API Keys**, then place it only in `backend/.env`.

The authenticated endpoints are:

- `GET /api/v1/practical-assessments/me`
- `POST /api/v1/practical-assessments` (an optional MP4/MOV/WebM video)
- `PUT /api/v1/practical-assessments/{assessment_id}/answers`
- `POST /api/v1/practical-assessments/{assessment_id}/evaluate`

The API always returns the user's nullable profile together with ten fixed
questions about their electrical experience, training, familiar systems, safety
and work habits, tools, troubleshooting approach, confidence, support needs, and
learning preferences. Gemini may suggest only answers supported by the optional
video. Unsupported answers remain empty; the user can fill them and edit every
AI suggestion. Draft answers and their AI provenance are stored in Supabase, and
all ten final answers must be non-empty before the one-time profile can be
completed. A video-analysis failure still leaves a usable manual draft.

Once completed, the answer-derived profile and structured result are immutable.
The backend uses their bounded personalization context to tailor later RAG
explanations; it does not use the profile to weaken electrical-safety guidance.

Uploaded videos are streamed through a temporary backend file and sent to
Gemini's Files API. The local copy is removed after the request, and the backend
requests immediate deletion of Gemini's copy after inference (Gemini's normal
file expiry remains the fallback if cleanup fails). The raw video is not stored
in Supabase. Configure its application limit and assessment model with:

```env
PRACTICAL_ASSESSMENT_MAX_VIDEO_BYTES=100000000
GEMINI_ASSESSMENT_MODEL=gemini-3.7-flash
GEMINI_ASSESSMENT_MAX_OUTPUT_TOKENS=8192
GEMINI_FILE_PROCESSING_TIMEOUT_SECONDS=180
```

For production, also enforce a request-body limit at the reverse proxy or API
gateway slightly above the configured video limit. The endpoint validates the
streamed file and rejects bytes beyond the limit, but an ASGI multipart parser
may spool request data before the endpoint-level check runs.
