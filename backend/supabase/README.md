# Supabase conversation storage

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
