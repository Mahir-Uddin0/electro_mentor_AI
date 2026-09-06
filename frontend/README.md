# ElectroMentor.AI frontend

The frontend is a Next.js App Router application for the ElectroMentor learning platform. It includes the 20 product screens represented by the UI/UX references, authentication through the FastAPI backend, and a typed API client that forwards the signed-in user's backend-issued access token.

## Local setup

Use Node.js 22 or newer.

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Keep `NEXT_PUBLIC_USE_MOCK_API=true` if you want the login/register screens to offer preview access and the unfinished general API routes to use local mock handlers. Registration and sign-in always use the FastAPI backend.

## Environment variables

```dotenv
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
NEXT_PUBLIC_USE_MOCK_API=true
NEXT_PUBLIC_USE_MOCK_CHAT_API=false
NEXT_PUBLIC_USE_MOCK_PHOTO_API=false
NEXT_PUBLIC_USE_MOCK_CHECKLIST_API=false
NEXT_PUBLIC_USE_MOCK_GUIDE_API=false
NEXT_PUBLIC_USE_MOCK_TASK_API=false
NEXT_PUBLIC_USE_MOCK_ASSESSMENT_API=false
```

`NEXT_PUBLIC_USE_MOCK_API` controls the unfinished dashboard and AI checklist-generation endpoints. Conversation history, photo analysis, the PDF libraries, the task tracker, and learner-profile assessment have separate feature switches, so they can use FastAPI while the remaining screens use preview data. Keep their feature-specific switches set to `false` for the real authenticated APIs.

The API client stores the FastAPI session in browser local storage. Before every
real backend request it checks the access-token expiry and uses
`POST /api/v1/auth/refresh` when necessary. Refresh tokens rotate on every
successful refresh. A rejected refresh or backend `401` clears the browser
session and sends the user to `/login?reason=session_expired`. Login state is
synchronized across browser tabs.

The authentication routes are:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

FastAPI issues and verifies the access JWT. The frontend does not contain the
JWT signing secret and does not verify token signatures itself.

Protected route gating is client-side because this version stores the token
response in browser local storage. Do not render sensitive user data into a
protected page at build time. A future HttpOnly-cookie/BFF design can move the
route decision back to the Next.js server and further reduce token exposure to
browser JavaScript.

Conversation history uses these FastAPI routes under `/api/v1`:

- `GET /conversations` and `POST /conversations`
- `GET`, `PATCH`, and `DELETE /conversations/{conversation_id}`
- `POST /conversations/{conversation_id}/messages`

Photo fault detection sends an authenticated multipart request to `POST /photo-analysis` with the selected file in the `image` field. Accepted formats are JPG, PNG, WebP, HEIC, and HEIF up to 14 MB. Completed reports are retained only for the current user and browser session; the backend does not persist photo reports yet.

The safety-checklist library loads live PDF metadata from `GET /safety-checklists` and fetches a selected file from `GET /safety-checklists/{checklist_id}/file`. Both requests carry the current backend access token. PDFs can be viewed inside the application or downloaded without exposing a server filesystem path.

The wiring and circuit guide library follows the same authenticated flow through `GET /guides` and `GET /guides/{guide_id}/file`. Titles, descriptions, categories, page counts, file sizes, update times, and IDs come from the backend PDF catalog rather than static frontend data.

The Task Tracker uses authenticated, user-scoped FastAPI routes under `/api/v1`:

- `GET /tasks` and `POST /tasks`
- `PATCH /tasks/{task_id}` and `DELETE /tasks/{task_id}`

Tasks are grouped into Upcoming, In Progress, and Completed sections. The first two sections are sorted by priority and due date, and changing a task's status moves it to the matching section without a page reload. Keep `NEXT_PUBLIC_USE_MOCK_TASK_API=false` to persist tasks in the backend's local SQLite database through FastAPI.

The one-time learner-profile questionnaire uses authenticated FastAPI routes under `/api/v1`:

- `GET /practical-assessments/me` loads the current user's draft or completed profile and the fixed questionnaire/checklist definitions.
- `POST /practical-assessments` starts the profile with an optional MP4, MOV, or WebM introduction video up to 100 MB.
- `PUT /practical-assessments/{assessment_id}/answers` saves all ten editable answers.
- `POST /practical-assessments/{assessment_id}/evaluate` creates and stores the personalized learner profile from the user's final answers and any supported video information.

The six profile screens share one provider, so a draft can move between the question and answer steps without static placeholder data. Gemini fills only answers supported by the optional video; every answer remains user-editable before final submission. Completed profile scores, learning suggestions, and the competency checklist are rendered from the saved user-specific record. Keep `NEXT_PUBLIC_USE_MOCK_ASSESSMENT_API=false` to use this backend flow.

The remaining temporary frontend contract expects `GET /dashboard` and `POST /checklists/generate`. While the relevant mock switch is enabled, matching local handlers under `/api/mock/*` supply deterministic responses.

## Progressive Web App

Production builds include a native web app manifest and service worker, so the
frontend can be installed in standalone mode from supported Android, iOS, and
desktop browsers. Service workers and installation require HTTPS in production;
`localhost` is treated as a secure context for local testing. The service worker
registers only in a production build, so test it with:

```bash
npm run build
npm run start
```

The offline cache contains only the `/offline` fallback, the manifest, PWA icons,
and the hashed Next.js static files required to render that fallback. API
responses, authentication sessions or tokens, user data, conversations, AI responses,
uploaded media, and analysis results are intentionally never cached. AI chat,
photo review, authentication, database operations, and all mutations remain
online-only.

The current install icons are brand-colored placeholders in
`public/icons/icon-192.png` and `public/icons/icon-512.png`; their editable source
is `public/icons/icon-source.svg`. Replace the PNG files with final artwork while
keeping the same names and exact dimensions (and keeping important content inside
the platform-safe center area).

When intentionally changing precached resources or service-worker cache behavior,
increment `CACHE_NAME` in `public/service-worker.js` (for example,
`electromentor-v1` to `electromentor-v2`). Activation removes older
`electromentor-*` caches.

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
