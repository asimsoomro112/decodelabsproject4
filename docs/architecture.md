# SynapseBridge — Architecture

## The one idea

The integration **is** the product. A single API client (`frontend/js/api/client.js`)
is the only code allowed to call `fetch()`. Everything else — views, tracer,
background canvas, connection chip — reacts to the events it emits:

```
request:start → request:preflight-suspected → request:attempt (×N)
    → request:end | request:error
```

## I-P-O: "Building the Nervous System"

| Layer | Role | Lives in |
|---|---|---|
| **Input** — Sensory Interface | Views capture intent, build params, manage UI states | `frontend/js/views/` |
| **Bridge** — the network | HTTP across origins; CORS preflight; headers both ways | `frontend/js/api/`, backend `src/middleware/cors.ts` |
| **Process** — Cognitive Vault | Routing, validation (Zod 4), auth, rate limiting, storage | `backend/src/` |
| **Output** — back to senses | Safe parse → `textContent` DOM injection → trace completion | views + `frontend/js/trace/` |

## Request lifecycle (8 steps)

1. **click** — user action fires (view records `traceLabel`).
2. **try** — client builds URL, headers (`Accept`, conditional `Content-Type`,
   `Authorization` from role, auto `Idempotency-Key` on POST, `X-Request-Id`
   minted per request), timeout via `AbortSignal.timeout` + `AbortSignal.any`
   (manual fallback).
3. **fetch + CORS** — preflight suspected when cross-origin and non-simple
   (PUT/PATCH/DELETE, `Authorization`, `Idempotency-Key`, JSON `Content-Type`);
   the ghost packet flies first.
4. **await** — UI stays responsive; each attempt reported to the tracer.
5. **check** — `if (!response.ok)`: parse problem+json when the content type is
   JSON, else fall back to status text. Never assume a 404 body is JSON.
6. **json** — `await response.text()` then `JSON.parse` in try/catch; 204/empty
   → `null`; 2xx non-JSON → `ApiError{kind:"parse"}`.
7. **DOM** — `textContent`/`createElement` only; hostile input renders inert.
8. **finally** — spinner off, `aria-busy` cleared, trace entry completed with
   real render time.

## Backend pipeline (middleware order)

```
helmet → requestId → serverTiming → requestLog (records EVERYTHING incl. OPTIONS)
  → cors → express.json(10kb) → contentType(415) → rateLimit(general)
  → rateLimit(writes) → routes → notFound(404/405) → errorHandler(problem+json)
```

## Retry policy (idempotency matrix)

| Method | Auto-retry on network/429/502/503/504? |
|---|---|
| GET, PUT, DELETE | Yes (≤3 attempts, exp backoff + full jitter, honors `Retry-After`) |
| POST | Only with caller-supplied `Idempotency-Key` |
| PATCH | **Never** (optimistic UI + manual retry instead) |

4xx (except 429) and user aborts are never retried.

## Storage

`InternRepository` interface → `memoryStore` (default, seeded with 14 interns)
or `pgStore` (enabled when `DATABASE_URL` is set; lazy `pg` import; one
migration in `backend/migrations/001_interns.sql`).
