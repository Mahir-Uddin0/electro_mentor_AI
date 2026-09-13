# ElectroMentor AI frontend

The ElectroMentor frontend is an installable Next.js application for practical
electrical learning. It provides an English/Bangla interface for the AI mentor,
photo analysis, safety resources, guides, practical assessments, and personal
task tracking.

## Technology

- Next.js 16 App Router
- React 19
- TypeScript 7
- Tailwind CSS 4
- Lucide icons
- Native web app manifest and service worker

## Start locally

### Requirements

- Node.js 22 or newer
- npm
- The FastAPI backend at `http://127.0.0.1:8000` for registration, sign-in, and
  all real feature APIs

```bash
cd frontend
cp .env.example .env.local
npm ci
npm run dev
```

Open <http://localhost:3000>.

The example configuration enables a safe preview entry point and mock dashboard
data. Registration and sign-in always call FastAPI. The implemented chat,
photo, checklist, guide, task, and assessment clients use their real backend
routes by default.

For a completely backend-driven run, set:

```dotenv
NEXT_PUBLIC_USE_MOCK_API=false
```

## Environment variables

| Variable | Example default | Effect |
| --- | --- | --- |
| `NEXT_PUBLIC_BACKEND_URL` | `http://127.0.0.1:8000` | FastAPI origin used by browser requests |
| `NEXT_PUBLIC_USE_MOCK_API` | `true` | Enables preview access and mock data for general unfinished endpoints |
| `NEXT_PUBLIC_USE_MOCK_CHAT_API` | `false` | Uses mock conversation storage and responses when `true` |
| `NEXT_PUBLIC_USE_MOCK_PHOTO_API` | `false` | Uses deterministic photo-analysis preview data when `true` |
| `NEXT_PUBLIC_USE_MOCK_CHECKLIST_API` | `false` | Mocks both checklist browsing and generation when `true` |
| `NEXT_PUBLIC_USE_MOCK_GUIDE_API` | `false` | Uses preview guide data instead of the PDF API when `true` |
| `NEXT_PUBLIC_USE_MOCK_TASK_API` | `false` | Uses preview tasks instead of SQLite-backed tasks when `true` |
| `NEXT_PUBLIC_USE_MOCK_ASSESSMENT_API` | `false` | Uses the assessment preview workflow when `true` |

These values are embedded in the browser bundle during `npm run build`; rebuild
the frontend after changing them. In Docker, the application uses
`NEXT_PUBLIC_BACKEND_URL=/backend-api`, and the Next.js rewrite sends that path
to FastAPI inside the Compose network.

## Product areas and routes

| Area | Routes |
| --- | --- |
| Public | `/`, `/login`, `/register`, `/offline` |
| Workspace | `/dashboard`, `/settings` |
| AI mentor | `/assistant` |
| Photo analysis | `/photo-analysis`, `/photo-analysis/review`, `/photo-analysis/results/[id]` |
| Safety checklists | `/safety-checklists`, `/safety-checklists/generate`, `/safety-checklists/[id]` |
| Guides | `/guides`, `/guides/[id]` |
| Practice tracker | `/practice-tracker` |
| Practical assessments | `/assessments/history`, `/assessments/new/upload`, `/assessments/new/questions`, `/assessments/new/answers`, `/assessments/new/results`, `/assessments/new/skills`, `/assessments/new/suggestions` |

`/guides/lighting-circuit-design` and
`/safety-checklists/house-wiring` remain available as dedicated reference
screens. Dynamic `[id]` routes load backend-provided PDFs or analysis results.

## Authentication and API behavior

FastAPI owns registration, credentials, JWT signing, refresh sessions, and user
authorization. The frontend stores the returned session in browser local
storage, refreshes an expiring access token through `/api/v1/auth/refresh`, and
synchronizes login state across tabs. Refresh tokens rotate after every
successful refresh.

If refresh fails or a real API request returns `401`, the client clears the
session and redirects to `/login?reason=session_expired`. It never contains the
JWT signing secret and does not attempt to verify signatures in the browser.

Protected-route gating is client-side because tokens are stored in local
storage. Do not render private user data into protected pages during a static or
server build. A future HttpOnly-cookie/BFF design would reduce token exposure to
browser JavaScript.

Real feature requests include both headers:

```http
Authorization: Bearer <access-token>
Accept-Language: en
```

The language header changes supported AI text between English (`en`) and Bangla
(`bn`) while leaving JSON keys and enum values unchanged. A backend `428`
response opens the Gemini-key prompt; users can save their key from **Settings**.

## Backend integrations

- **Conversations:** persistent conversation CRUD and grounded messages through
  `/api/v1/conversations`.
- **Photo analysis:** multipart upload to `/api/v1/photo-analysis` in the
  `image` field. Accepted types are JPG, PNG, WebP, HEIC, and HEIF, up to 14 MB.
  Completed reports are held only in the current browser session.
- **Checklists:** list and stream PDFs from `/api/v1/safety-checklists`, or send
  a task to `/api/v1/safety-checklists/generate`.
- **Guides:** search backend PDF metadata and stream a selected file through
  `/api/v1/guides/{guide_id}/file`.
- **Tasks:** user-scoped CRUD through `/api/v1/tasks`; task status progresses
  from `upcoming` to `in_progress` to `completed`.
- **Assessments:** upload a required MP4, MOV, or WebM video up to 100 MB,
  generate ten questions and supported answers, edit answers, evaluate, and
  browse completed history through `/api/v1/practical-assessments`.

Assessment pages share a client provider, allowing a draft to move through the
workflow without static placeholders. Uploaded videos stay in the backend's
private storage and are never copied into `public/`.

## Progressive Web App

The production build includes a manifest and service worker. Supported browsers
can install it on Android, iOS, and desktop. Production installation requires
HTTPS; `localhost` is treated as a secure context for development.

The service worker registers only in a production build:

```bash
npm run build
npm run start
```

Its cache is deliberately narrow: the offline fallback, manifest, icons, and
hashed Next.js assets needed to render that fallback. API responses, tokens,
conversations, AI results, uploaded media, and other user data are never cached.
All AI features and mutations remain online-only.

When intentionally changing precached assets or cache behavior, increment
`CACHE_NAME` in `public/service-worker.js`. Replace the placeholder install
icons while preserving these paths and dimensions:

- `public/icons/icon-192.png` — 192 × 192
- `public/icons/icon-512.png` — 512 × 512

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run build` | Create the production build with webpack |
| `npm run start` | Serve the production build |

Before opening a pull request or deploying:

```bash
npm run typecheck
npm run build
```

For real browser-to-backend requests, use `http://localhost:3000` so the origin
matches the backend's default CORS configuration. See the
[project README](../README.md) for backend setup and full-stack Docker usage.
