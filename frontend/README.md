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
```

Only the Supabase URL and publishable/anon key belong in the browser. Never place the Supabase JWT secret or service-role key in a `NEXT_PUBLIC_` variable.

In Supabase **Authentication → URL Configuration**, set the local site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` as an allowed redirect URL. Add the equivalent HTTPS callback before deploying.

Set `NEXT_PUBLIC_USE_MOCK_API=false` when the FastAPI endpoints are ready. The API client reads the current Supabase session and sends `Authorization: Bearer <access_token>` on backend requests.

The existing FastAPI verifier is configured for a legacy `HS256` JWT secret. If the Supabase project uses the newer asymmetric signing-key system, update the backend to validate against the project's JWKS endpoint before disabling mock mode.

The temporary frontend contract expects these FastAPI routes under `/api/v1`: `GET /dashboard`, `GET /guides`, `GET /tasks`, `POST /chat`, `POST /photo-analysis`, and `POST /checklists/generate`. While mock mode is enabled, matching local handlers under `/api/mock/*` supply deterministic responses.

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
