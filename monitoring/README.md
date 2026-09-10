# ElectroMentor.AI monitoring

The Compose stack keeps metrics and logs on the same private Docker network as
the application:

```text
backend:8000/metrics <- prometheus:9090 <- grafana:3000
Docker logs          -> alloy:12345    -> loki:3100 -> grafana:3000
                                                    host Grafana port: 3001
```

Only Grafana is published on a new host port. Prometheus, Loki, and Alloy use
Compose DNS names and are not directly exposed by the host.

## Start and verify

For a new installation, copy the root environment example. For an existing
installation, preserve `.env` and add the three `GRAFANA_*` entries from
`.env.example`. Generate independent secrets, place them in `.env`, and then
start the application and monitoring services together:

```bash
cp .env.example .env      # new installations only
openssl rand -hex 32       # AUTH_JWT_SECRET
openssl rand -hex 32       # API_KEY_ENCRYPTION_SECRET
openssl rand -base64 32    # GRAFANA_ADMIN_PASSWORD
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

Open Grafana at `http://localhost:3001` by default (or the host port configured
by `GRAFANA_PORT`) and sign in using `GRAFANA_ADMIN_USER` and
`GRAFANA_ADMIN_PASSWORD`. Grafana provisions both data sources and the
**ElectroMentor.AI** dashboard on first startup. The dashboard refreshes every
15 seconds and defaults to the most recent six hours.

Prometheus scrapes the backend every 15 seconds. Its target is intentionally the
internal address `backend:8000/metrics`; Grafana uses `prometheus:9090` and
`loki:3100` internally.

## Metrics

The backend exposes a deliberately small, low-cardinality metric set:

- `http_requests_total` and `http_request_duration_seconds` use the HTTP method,
  normalized FastAPI route template, and status code. Raw URL paths are never
  used as labels, and the `/metrics` scrape itself is excluded.
- `ai_feature_requests_total` and `ai_feature_request_duration_seconds` use only
  a bounded feature name and `success`, `error`, or `cancelled` status. They
  cover the real assistant, photo-analysis, safety-checklist, and practical
  assessment AI operations.
- `rag_requests_total` and `rag_request_duration_seconds` measure the retrieval
  performed for assistant context.

No prompts, tokens, API keys, user identifiers, conversation IDs, filenames, or
other user-controlled values are Prometheus labels.

The provisioned dashboard contains request volume, error rates, averages, and
p95 latency panels for the API, assistant, RAG, and photo analysis. Checklist
and practical-assessment series are available for ad hoc PromQL using the
`feature` label without adding a large set of narrowly used panels.

## Logs

Alloy discovers only Compose containers carrying the
`com.electromentor.logs=true` label. It maps Docker Compose metadata to these
stable Loki labels:

- `service`: the Compose service, such as `backend` or `frontend`
- `compose_project`: the Compose project name
- `container`: the generated container name

Useful Grafana Explore queries include:

```logql
{service="backend"}
{service="backend"} |= "ERROR"
{service="frontend"}
```

Alloy mounts `/var/run/docker.sock` read-only and never promotes request or user
data into labels. Application logs still must not include credentials or bearer
tokens.

## Persistence and configuration

Configuration is committed under `monitoring/`; runtime data is stored only in
named Docker volumes:

- `prometheus_data` for time series (30-day retention)
- `grafana_data` for Grafana state
- `loki_data` for logs (30-day retention)
- `alloy_data` for log read positions

The existing `backend_data` volume remains unchanged. Container recreation and
`docker compose down` preserve named volumes. `docker compose down --volumes`
permanently removes all of them and should be used only when that data is no
longer needed.

Grafana administrator values belong in the uncommitted root `.env`. Grafana
stores the initial administrator account in `grafana_data`; changing the
environment variable later does not reset an already initialized Grafana
database.

## Registry deployment

Prometheus, Loki, Alloy, and Grafana use pinned public images. To publish the
application images to your own registry, set `BACKEND_IMAGE=host/name:tag` and
`FRONTEND_IMAGE=host/name:tag` in `.env`, then run:

```bash
docker compose build backend frontend
docker compose push backend frontend
```

On the deployment host, use the same two image variables and pull before
starting the stack. Keep the repository's Compose and `monitoring/` files with
the deployment because they provide the runtime topology and provisioned
configuration.
