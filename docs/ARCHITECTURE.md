# Architecture note

## The problem

A full BSE pull takes **up to 15 minutes**. The network kills **any HTTP connection open longer than 30 seconds**. So no component may ever wait on a request for the length of a pull — not the dashboard, not our backend, not the BSE client.

The design therefore **separates starting a pull, waiting for it, and showing its results**, and connects those three with durable state and push notifications instead of long-lived connections.

## Diagram

```mermaid
flowchart LR
    subgraph Browser
        UI["React dashboard"]
    end

    subgraph API["Node API (Express)"]
        PM["Pull manager<br/>start · ingest · reconcile"]
        REST["REST: /api/trades?afterSeq=N<br/>POST /api/pulls"]
        SSE["SSE hub<br/>/api/events"]
        WH["Webhook: /webhooks/bse<br/>HMAC verified"]
        DB[("SQLite<br/>trades · pulls · events")]
    end

    BSE["Mock BSE API<br/>GET /getTrades -> 202 job"]

    UI -- "1 GET trades (instant, from DB)" --> REST
    UI -- "2 EventSource (re-opened every ~25 s)" --> SSE
    UI -- "Pull now" --> PM
    PM -- "3 GET /getTrades (returns in ms)" --> BSE
    BSE -. "4 15 min later: signed webhook" .-> WH
    WH --> PM
    PM -- "5 page through results (500/page, each call < 30 s)" --> BSE
    PM -- "6 idempotent upsert" --> DB
    PM -- "7 publish event" --> SSE
    SSE -- "8 pull_completed" --> UI
    UI -- "9 GET trades?afterSeq=lastSeq" --> REST
    REST --> DB
```

### One pull, end to end

```mermaid
sequenceDiagram
    participant U as Dashboard
    participant A as API
    participant D as SQLite
    participant B as BSE

    U->>A: GET /api/trades?afterSeq=0 (instant)
    A-->>U: trades already pulled
    U->>A: open /api/events (SSE)
    A-->>U: state snapshot + live events

    U->>A: POST /api/pulls ("Pull now")
    A->>D: INSERT pull (UNIQUE active) - 409 if one is running
    A->>B: GET /getTrades?callbackUrl=...
    B-->>A: 202 { jobId, readyAt }  (milliseconds)
    A-->>U: SSE pull_pending (ETA)

    Note over B: ~15 minutes of work.<br/>No connection is open anywhere.<br/>Dashboard keeps showing existing trades.

    B->>A: POST /webhooks/bse (HMAC signed)
    A-->>B: 202 immediately
    loop each 500-record page
        A->>B: GET results?cursor=N
        A->>D: upsert page + save cursor (one transaction)
        A-->>U: SSE pull_progress
    end
    A->>D: pull = completed
    A-->>U: SSE pull_completed
    U->>A: GET /api/trades?afterSeq=lastSeq
    A-->>U: only the new trades -> appear in the open table
```

## Why this design

**1. Async job + webhook instead of a long request.**
The BSE call that "takes 15 minutes" becomes three short calls: *create job* (returns `202` in milliseconds), *a signed webhook when it's ready*, and *paged result downloads* (each well under 30 s). The 15-minute wait is spent with zero open connections, so the network limit never comes into play. The webhook is what removes the need for a polling loop or scheduler on our side.

**2. The database is the source of truth, and the UI only reads from it.**
Ingested trades are committed to SQLite as they arrive. That's why the dashboard opens instantly with whatever has been pulled — a `GET /api/trades` is a local indexed read and never depends on the state of a BSE pull. A pull in progress is just a row in `pulls`.

**3. Push, not poll — and the push channel respects the 30 s cap too.**
Server-Sent Events give a one-way stream from API to browser. But a stream is also a connection, and the network would kill it at 30 s. So the server ends each stream cleanly after ~25 s (after sending a `bye` event), and the browser's built-in `EventSource` reconnects in ~0.5 s with `Last-Event-ID`. The server (a) replays events the client missed from a durable `events` table and (b) opens every stream with a **state snapshot**, so even a client that was offline for an hour converges. Heartbeats alone would not be enough against an absolute-duration cap; cycling the stream is what makes it robust. Reconnecting is connection hygiene, not data polling: no data requests are made on a timer. In a real browser run, a full two-pull session produced exactly three `/api/trades` requests — initial load and one per completed pull.

**4. Trades sync by cursor.**
Every trade gets a monotonic `seq`. Clients ask for "everything after seq N", so the first load and every later update use the same code path, and a pull that adds 250 rows to 3 000 transfers 250 rows.

