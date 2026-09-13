# ElectroMentor AI monitoring

ElectroMentor ships with an automatically provisioned observability stack for
the Docker Compose deployment. Prometheus collects API metrics, Alloy forwards
opted-in container logs to Loki, and Grafana provides dashboards and log
exploration.

```text
FastAPI /metrics ──> Prometheus ──> Grafana
                                      ^
backend/frontend logs ──> Alloy ──> Loki
```

Prometheus, Loki, and Alloy remain on the private `electromentor` Compose
network. Only Grafana is published to the host, on port `3001` by default.

## Start the stack

Monitoring starts with the application; there is no separate Compose command.
From the repository root:

```bash
cp .env.example .env      # first installation only
openssl rand -hex 32       # AUTH_JWT_SECRET
openssl rand -hex 32       # API_KEY_ENCRYPTION_SECRET
openssl rand -base64 32    # GRAFANA_ADMIN_PASSWORD
```

Save the generated values in `.env`, then run:

```bash
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

Open <http://localhost:3001> and sign in with `GRAFANA_ADMIN_USER` and
`GRAFANA_ADMIN_PASSWORD`. Change the published port with `GRAFANA_PORT` if 3001
is already in use.

Grafana provisions the Prometheus and Loki data sources and the
**ElectroMentor.AI** dashboard on first startup. The dashboard defaults to the
last six hours and refreshes every 15 seconds.

> Grafana stores its initial administrator credentials in `grafana_data`.
> Changing the environment variables later does not reset an already-created
> administrator account.

## Services

| Service | Internal address | Host access | Role |
| --- | --- | --- | --- |
| Prometheus | `prometheus:9090` | Not published | Scrapes metrics every 15 seconds |
| Loki | `loki:3100` | Not published | Stores application logs for 30 days |
| Alloy | `alloy:12345` | Not published | Discovers and forwards selected Docker logs |
| Grafana | `grafana:3000` | `localhost:${GRAFANA_PORT:-3001}` | Dashboards and Explore |
| Backend metrics | `backend:8000/metrics` | `localhost:8000/metrics` | Application metric source |

## Metrics

The backend deliberately exposes a small, low-cardinality metric set:

| Metric | Labels | Meaning |
| --- | --- | --- |
| `http_requests_total` | method, normalized route, status code | API request volume |
| `http_request_duration_seconds` | method, normalized route, status code | API request latency |
| `ai_feature_requests_total` | bounded feature name, result status | AI operation volume and outcome |
| `ai_feature_request_duration_seconds` | bounded feature name, result status | AI operation latency |
| `rag_requests_total` | bounded result status | Retrieval volume and outcome |
| `rag_request_duration_seconds` | bounded result status | Retrieval latency |

The `/metrics` scrape is excluded from HTTP request instrumentation. Raw URL
paths are normalized to FastAPI route templates, preventing IDs from creating
unbounded series. Prometheus labels never contain prompts, API keys, tokens,
user IDs, conversation IDs, or filenames.

The provisioned dashboard covers API volume, error rate, average and p95
latency, assistant generation, RAG, and photo analysis. Checklist and practical
assessment series remain available for ad hoc PromQL through the bounded
`feature` label.

## Logs

Alloy discovers only containers labeled:

```yaml
com.electromentor.logs: "true"
```

The current Compose files opt in the `backend` and `frontend` services. Alloy
attaches only stable deployment metadata:

| Label | Example |
| --- | --- |
| `service` | `backend` |
| `compose_project` | `electro_mentor_ai` |
| `container` | Compose-generated container name |

Useful queries in **Grafana → Explore → Loki**:

```logql
{service="backend"}
{service="backend"} |= "ERROR"
{service="frontend"}
```

Alloy mounts `/var/run/docker.sock` read-only for container discovery. Avoid
logging credentials, bearer tokens, uploaded content, or other sensitive user
data even though those fields are not promoted to Loki labels.

## Persistence and retention

| Volume | Data |
| --- | --- |
| `prometheus_data` | Prometheus time series, retained for 30 days |
| `loki_data` | Loki chunks and indexes, retained for 30 days |
| `grafana_data` | Grafana users and state |
| `alloy_data` | Alloy log read positions |
| `backend_data` | SQLite, Chroma, and private backend application files |

`docker compose down` and container recreation preserve these named volumes.
`docker compose down --volumes` permanently deletes them and should be used only
when all application and monitoring data can be discarded.

Committed configuration lives here:

```text
monitoring/
├── alloy/config.alloy
├── loki/config.yml
├── prometheus/prometheus.yml
└── grafana/
    ├── dashboards/electromentor-ai.json
    └── provisioning/
        ├── dashboards/dashboards.yml
        └── datasources/datasources.yml
```

Dashboard JSON and provisioning files are mounted read-only. Make durable
dashboard changes in the committed JSON rather than only through the Grafana UI.

## Operational checks

```bash
# Container and health status
docker compose ps

# Application logs
docker compose logs --tail=100 backend frontend

# Monitoring logs
docker compose logs --tail=100 prometheus loki alloy grafana

# Confirm the backend metric endpoint
curl --fail http://localhost:8000/metrics

# Confirm Grafana health
curl --fail http://localhost:3001/api/health
```

If the dashboard has no metrics, confirm that `backend` is healthy and inspect
the Prometheus logs. If logs are absent, confirm the service has the opt-in label
and inspect Alloy and Loki logs. On hosts without `/var/run/docker.sock`, Alloy's
Docker log discovery must be adapted to the container runtime.

## Registry deployment

`prod.docker-compose.yml` pulls the versioned frontend and backend images while
using the same pinned monitoring images and configuration. Keep this directory
on the deployment host, because Compose bind-mounts its files into the monitoring
containers.

```bash
docker compose -f prod.docker-compose.yml config --quiet
docker compose -f prod.docker-compose.yml pull
docker compose -f prod.docker-compose.yml up -d
```

Return to the [project README](../README.md) for the complete deployment and
application setup.
