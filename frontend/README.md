# ElectroMentor.AI frontend

The frontend is a Next.js App Router application for the ElectroMentor learning platform. It includes the 20 product screens represented by the UI/UX references, direct Supabase authentication, and a typed API client that forwards the signed-in user's access token to the FastAPI backend.

## Local setup

Use Node.js 22 or newer (the current Supabase client requires it).

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Until Supabase and the backend are configured, keep `NEXT_PUBLIC_USE_MOCK_API=true`; the application will use its local mock route handlers and the login/register screens offer preview access.

## Environment variables

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
NEXT_PUBLIC_USE_MOCK_API=true
NEXT_PUBLIC_USE_MOCK_CHAT_API=false
NEXT_PUBLIC_USE_MOCK_PHOTO_API=false
NEXT_PUBLIC_USE_MOCK_CHECKLIST_API=false
NEXT_PUBLIC_USE_MOCK_GUIDE_API=false
NEXT_PUBLIC_USE_MOCK_TASK_API=false
```

Only the Supabase URL and publishable/anon key belong in the browser. Never place the Supabase JWT secret or service-role key in a `NEXT_PUBLIC_` variable.

In Supabase **Authentication → URL Configuration**, set the local site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` as an allowed redirect URL. Add the equivalent HTTPS callback before deploying.

`NEXT_PUBLIC_USE_MOCK_API` controls the unfinished dashboard and AI checklist-generation endpoints. Conversation history, photo analysis, the PDF libraries, and the task tracker have separate feature switches, so they can use FastAPI while the remaining screens use preview data. Keep their feature-specific switches set to `false` for the real authenticated APIs.

The API client asks Supabase for a current session before every real backend
request. Supabase refreshes an expired access token when possible; a failed
refresh, missing session, or backend `401` clears the browser session and sends
the user to `/login?reason=session_expired`. An expired token is never attached
to a FastAPI request. Preview login works only with the mock chat API.

FastAPI accepts legacy `HS256` tokens when `SUPABASE_JWT_SECRET` is configured
and current `ES256`/`RS256` tokens through Supabase's cached public JWKS. The
project's signing key can therefore rotate without forcing the browser to reuse
an obsolete token.

Conversation history uses these FastAPI routes under `/api/v1`:

- `GET /conversations` and `POST /conversations`
- `GET`, `PATCH`, and `DELETE /conversations/{conversation_id}`
- `POST /conversations/{conversation_id}/messages`

Photo fault detection sends an authenticated multipart request to `POST /photo-analysis` with the selected file in the `image` field. Accepted formats are JPG, PNG, WebP, HEIC, and HEIF up to 14 MB. Completed reports are retained only for the current user and browser session; the backend does not persist photo reports yet.

The safety-checklist library loads live PDF metadata from `GET /safety-checklists` and fetches a selected file from `GET /safety-checklists/{checklist_id}/file`. Both requests carry the current Supabase access token. PDFs can be viewed inside the application or downloaded without exposing a server filesystem path.

The wiring and circuit guide library follows the same authenticated flow through `GET /guides` and `GET /guides/{guide_id}/file`. Titles, descriptions, categories, page counts, file sizes, update times, and IDs come from the backend PDF catalog rather than static frontend data.

The Task Tracker uses authenticated, user-scoped FastAPI routes under `/api/v1`:

- `GET /tasks` and `POST /tasks`
- `PATCH /tasks/{task_id}` and `DELETE /tasks/{task_id}`

Tasks are grouped into Upcoming, In Progress, and Completed sections. The first two sections are sorted by priority and due date, and changing a task's status moves it to the matching section without a page reload. Keep `NEXT_PUBLIC_USE_MOCK_TASK_API=false` to persist tasks in Supabase through FastAPI.

The remaining temporary frontend contract expects `GET /dashboard` and `POST /checklists/generate`. While the relevant mock switch is enabled, matching local handlers under `/api/mock/*` supply deterministic responses.

## Product routes

1. `/login`
2. `/register`
3. `/dashboard`
4. `/guides`
5. `/guides/lighting-circuit-design`
6. `/assistant`
7. `/photo-analysis`
8. `/photo-analysis/review`
9. `/photo-analysis/results/demo`
10. `/safety-checklists`
11. `/safety-checklists/generate`
12. `/safety-checklists/house-wiring`
13. `/practice-tracker`
14. `/settings`
15. `/assessments/new/upload`
16. `/assessments/new/questions`
17. `/assessments/new/answers`
18. `/assessments/new/results`
19. `/assessments/new/suggestions`
20. `/assessments/new/checklist`

## Validation

```bash
npm run typecheck
npm run build
```

For real backend requests, run the frontend from `http://localhost:3000` so it matches the backend's configured CORS origin.
