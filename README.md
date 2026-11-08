# BSE Trades Dashboard

A live trades dashboard fed by a slow BSE pull (up to **15 minutes**) behind a network that kills any HTTP connection open longer than **30 seconds**.

- **Mock BSE API** — `GET /getTrades` with a configurable pull delay (default 15 min) and a few thousand seeded trades.
- **Node.js backend** — starts pulls, receives the BSE webhook, ingests into SQLite idempotently, pushes updates over Server-Sent Events.
- **React dashboard** — opens instantly with the trades already pulled, even mid-pull; new trades appear by themselves when a pull finishes. No page refresh, no polling loop, no cron/scheduler.

Design write-up with diagrams: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

## Quick start

Requirements: **Node.js 20.19+** (22 recommended) and npm. Nothing else — SQLite is embedded.

```bash
npm install
npm run dev:demo      # pulls take 45 s instead of 15 min (still longer than the 30 s cap)
```

Open **http://localhost:5173**.

For the real 15-minute pull time use `npm run dev` instead.

### What you'll see

1. The dashboard opens immediately. On a first run there are no trades yet and a pull has already started (shown with a progress stepper and the BSE's ETA).
2. After the pull time, the table fills in **by itself** — no reload.
3. Click **Pull now**. While it runs, the existing trades stay on screen and fully usable (search, sort, filter).
4. When it completes, 250 additional trades appear and flash green in the open page.

Try breaking it: close the tab and reopen it mid-pull (instant load, correct status), stop the API with Ctrl+C mid-pull and start it again after the pull time has passed (it reconciles with the BSE and finishes the import), or click **Pull now** twice (second request is refused).

### Production-style run

```bash
npm start             # builds the React app, then serves everything from the API on http://localhost:4000
```

### Docker

```bash
docker build -t bse-trades-dashboard .
docker run --rm -p 4000:4000 -v bse-trades-data:/app/data bse-trades-dashboard
```

Open **http://localhost:4000**. The SQLite database is stored in the `bse-trades-data` Docker volume.

### Tests

```bash
npm run test:e2e      # ~40 s; scaled-down cap (5 s) and pull (6 s)
```

The test spawns the mock BSE and API on spare ports and checks: instant reads during a pull, single-flight pulls (409), push on completion across cycling SSE streams, idempotent ingest (3 000 → 3 250 trades, 250 inserted, no duplicates), crash recovery after a missed webhook, webhook signature/duplicate handling, that a blocking pull is killed by the cap, and that the API itself never exceeded the cap.

## Project layout

```
backend/    Express API, organised as MVC (see below)
frontend/   React (Vite) dashboard, standard React layout (see below)
mock-bse/   Mock exchange: async job API, webhooks with retries, deterministic seeded trades
shared/     HMAC signing + the connection-cap simulator used by both servers
scripts/    End-to-end test
docs/       Architecture note, video outline
```

### Backend (MVC)

```
backend/src/
  server.js              Entry point: starts HTTP server, boot-time recovery, graceful shutdown
  app.js                 Builds the Express app (middleware, routes, serves the built React app)
  config/
    index.js             Environment variables -> one config object
    database.js          Opens SQLite and creates the tables
  models/                Data access only (SQL lives here)
    Trade.js             Idempotent insert, "trades after seq N", totals
    Pull.js              One row per pull; DB-enforced "only one active pull"
    Event.js             Durable event log used for SSE replay
  controllers/           Read the request, call models/services, send the response
    tradeController.js   GET  /api/trades
    pullController.js    GET/POST /api/pulls, POST /api/pulls/:id/resume
    webhookController.js POST /webhooks/bse (verifies the HMAC signature)
    eventController.js   GET  /api/events (SSE)
    statusController.js  GET  /health, /api/state
  routes/                Maps URLs to controllers (one file per resource)
  services/              Business logic that is not tied to a single request
    pullService.js       Pull lifecycle: start, webhook, ingest, resume, boot-time reconcile
    bseClient.js         Calls to the BSE API (with timeouts under the 30 s cap)
    eventBus.js          Saves events to the log, then fans them out
    sseHub.js            Keeps SSE streams alive ~25 s, replays missed events
  views/
    pullView.js          Shapes DB rows into the JSON the frontend receives
  middlewares/
    errorHandler.js      Last-resort error handler
```

The "view" in this MVC is JSON: the React app is the user-facing view layer.

### Frontend (standard React layout)

```
frontend/
  index.html
  vite.config.js         Dev server + proxy of /api to the backend
  public/                Static files served as-is (favicon)
  src/
    main.jsx             React entry point
    App.jsx              Root component
    index.css            Global styles: colour tokens, reset
    App.css              Layout and component styles
    assets/              Images (logo)
    pages/
      DashboardPage.jsx  The dashboard screen: wires the hook to the components
    components/          Reusable UI pieces
      Header.jsx  StatusPanel.jsx  StatsRow.jsx  TradesTable.jsx
    hooks/
      useTradeFeed.js    Loads trades, listens to SSE, syncs only the new trades
    services/
      api.js             fetch() calls to the backend
    utils/
      format.js          Number / date formatting
```

## Mock BSE API

The BSE needs 15 minutes to assemble a pull, so `GET /getTrades` cannot return the data in the same response. It starts a job:

| Endpoint | Description |
|---|---|
| `GET /getTrades?callbackUrl=…` | Starts a pull. Returns `202 { jobId, status, readyAt, totalRecords }` immediately. Calls `callbackUrl` with an HMAC-signed webhook when ready (retried with backoff). |
| `GET /getTrades/:jobId` | `{ status: "pending" \| "ready", progress, readyAt }` |
| `GET /getTrades/:jobId/results?cursor=0&limit=500` | One page of `{ tradeId, client, symbol, quantity, price, timestamp }`; `409` until ready. `nextCursor` is `null` on the last page. |
| `GET /getTrades?blocking=1` | The naive behaviour: hold the connection for the whole pull. Dies at the 30 s cap — useful to demonstrate why jobs are needed. |

Data is deterministic: trade *N* always has the same content, and each new pull has 250 more trades than the last (3 000 → 3 250 → 3 500 …), which makes idempotency and "new trades appear" easy to see.

## Backend API

| Endpoint | Description |
|---|---|
| `GET /api/trades?afterSeq=N&limit=5000` | Trades with `seq > N`. `{ trades, lastSeq, hasMore }`. |
| `GET /api/state` | Active / last completed / last failed pull and trade counts. |
| `POST /api/pulls` | Start a pull. `202` started · `409` one already running · `502` BSE unreachable. |
| `POST /api/pulls/:id/resume` | Resume a `stalled` import. |
| `GET /api/pulls` | Recent pull history. |
| `GET /api/events` | SSE stream: `pull_*` events and `state`. Ends itself after ~25 s; clients reconnect with `Last-Event-ID`. |
| `POST /webhooks/bse` | BSE callback (`x-bse-signature: sha256=<hmac of raw body>`). |

## Configuration (environment variables)

**Mock BSE**

| Variable | Default | |
|---|---|---|
| `PORT` | `4001` | |
| `PULL_DELAY_MS` | `900000` | How long a pull takes (15 min). |
| `BASE_TRADES` / `GROWTH_PER_PULL` | `3000` / `250` | Trades in the first pull / extra trades per later pull. |
| `SEED` | `42` | Data seed. |
| `WEBHOOK_SECRET` | `dev-webhook-secret` | Must match the API. |
| `WEBHOOK_RETRIES` / `WEBHOOK_RETRY_BASE_MS` | `5` / `2000` | Webhook retry policy (exponential). |
| `CONNECTION_CAP_MS` | `30000` | Destroys requests open longer than this (`0` = off). |

**API**

| Variable | Default | |
|---|---|---|
| `PORT` | `4000` | |
| `BSE_URL` | `http://localhost:4001` | |
| `PUBLIC_URL` | `http://localhost:$PORT` | Address the BSE uses to reach the webhook. |
| `WEBHOOK_SECRET` | `dev-webhook-secret` | |
| `DB_PATH` | `./data/trades.db` | SQLite file (relative to `backend/`). Delete it to start fresh. |
| `AUTO_PULL_ON_START` | `true` | Start one pull on first boot when the database is empty. |
| `CONNECTION_CAP_MS` | `30000` | As above. |
| `SSE_MAX_AGE_MS` | `25000` | Planned lifetime of each SSE stream (keep below the cap). |
| `PAGE_SIZE` | `500` | Records per BSE result page. |

Example: `PULL_DELAY_MS=20000 npm run dev` for a 20-second pull.

## Notes and assumptions

- The BSE is assumed to offer an asynchronous job API, as the mock does. A BSE that can only answer one blocking request for 15 minutes cannot be consumed through a 30 s network.
- Pulls start on first boot and via **Pull now** / `POST /api/pulls`. The app contains no scheduler, as required; an external system can call that endpoint if automation is ever wanted.
- SQLite and the in-process event fan-out mean a single API instance. See the architecture note for how this scales out.
