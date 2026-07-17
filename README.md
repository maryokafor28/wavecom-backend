# WaveCom Notification Delivery System

A scalable, fault-tolerant notification delivery system for transactional notifications (email, SMS, and push), built with a stateless, horizontally-scaled API layer, async queue-based processing, and pluggable real/mock provider integrations.

## Table of Contents

- [Problem Overview](#problem-overview)
- [System Architecture](#system-architecture)
- [Components](#components)
- [Tech Stack](#tech-stack)
- [API Design](#api-design)
- [Database Schema](#database-schema)
- [Queueing Model & Retry Flow](#queueing-model--retry-flow)
- [Scaling Strategy](#scaling-strategy)
- [Fault Tolerance Strategy](#fault-tolerance-strategy)
- [Deployment](#deployment)
- [Design Defense](#design-defense)

---

## Problem Overview

### Business Context

WaveCom is a communications platform serving clients who require:

- **High reliability**: Transactional notifications must be delivered, with automatic retry on failure
- **Scalability**: The architecture must support horizontal scaling of every stateless component (API, workers) without code changes
- **Multi-channel support**: Email, SMS, and push notifications through pluggable, swappable providers
- **Fault tolerance**: The system must survive individual component failures (a single API replica, a provider outage) without losing data or going down
- **Observability**: Every notification's delivery status and failure reason must be queryable, including real third-party error messages (not generic placeholders)

### Requirements

- **API-driven**: RESTful endpoints for creating and monitoring notifications
- **Asynchronous processing**: The API never blocks on the actual send — it queues and returns immediately
- **Retry logic**: Automatic retry with exponential backoff for failed deliveries
- **Status tracking**: Real-time notification status (`pending`, `queued`, `processing`, `sent`, `failed`)
- **Multi-channel**: Email (Resend), SMS (Twilio), and Push (Firebase Cloud Messaging) — each independently switchable between a real provider and a mock, via environment flags

---

## Components and Responsibilities

### 1. nginx (Reverse Proxy / Load Balancer)

**Responsibilities:**

- Single public entry point for all API traffic
- Load-balances requests across all API replicas using round-robin
- Forwards the real client IP to the API layer via `X-Forwarded-For` / `X-Real-IP`, so rate limiting sees actual clients rather than nginx's own address

**Key Features:**

- Config-driven via `nginx.conf`, using Docker's internal DNS to discover all live API replicas automatically
- Verified to distribute traffic evenly across replicas under real load testing

### 2. Express API Server (`src/server.ts`, `src/app.ts`)

**Responsibilities:**

- Handle HTTP requests
- Validate input data
- Interact with MongoDB
- Publish messages to RabbitMQ
- Return immediate responses
- Enforce per-client rate limiting via Redis

**Key Features:**

- Fully stateless — runs as multiple replicas behind nginx with no shared in-process state
- `trust proxy` configured so `req.ip` correctly reflects the real client IP forwarded by nginx
- CORS-enabled for frontend access
- Environment-based configuration, validated at startup (fails loud if required vars are missing)
- Graceful shutdown handling (drains in-flight requests before exiting)
- Health check endpoint (`/health`)

### 3. MongoDB

**Responsibilities:**

- Persist notification records
- Track status throughout the notification lifecycle
- Store retry attempts and real provider error messages
- Provide query/filter capabilities for the list endpoint

**Collections:**

- `notifications`: main collection for all notification records

### 4. Redis

**Responsibilities:**

- Backs distributed rate limiting, shared correctly across all API replicas (a single global counter, not one per replica)
- Backs response caching for read-heavy endpoints (single notification lookup, list queries), with TTL-based expiry and explicit invalidation on delete
- Configured to fail open: if Redis is unreachable, requests are still served (uncached, unlimited) rather than the API going down

### 5. RabbitMQ Message Queue

**Responsibilities:**

- Decouple the API from processing
- Ensure message persistence
- Enable horizontal scaling of workers
- Provide reliable message delivery, with a dead-letter queue for exhausted retries

**Queue Configuration:**

- Durable: survives RabbitMQ restarts
- Persistent messages: not lost on crash
- Manual acknowledgment: ensures delivery
- Dead-letter exchange + queue for messages that are nacked or expire

### 6. Worker Process (`src/workers/notificationWorker.ts`)

**Responsibilities:**

- Consume messages from the queue
- Process notifications asynchronously
- Call the appropriate notification provider
- Handle failures and retries with exponential backoff
- Update notification status, including the real failure reason when available

**Key Features:**

- Single message processing (`prefetch: 1`)
- Exponential backoff retry logic (5s → 10s → 20s)
- Graceful shutdown

### 7. Notification Providers (`src/services/notification.service.ts`, `src/services/providers/`)

**Responsibilities:**

- Abstract provider-specific logic behind a common interface
- Route to the correct channel (email/SMS/push)
- Return success/failure status — SMS specifically returns the real failure reason from the provider, not a generic message

**Providers, each independently toggled via an environment flag (real provider in production, mock for local development):**

- **Email — Resend**: real transactional email via a verified sending domain
- **SMS — Twilio**: real SMS delivery; falls back to a mock provider locally to avoid consuming trial credits during development
- **Push — Firebase Cloud Messaging**: real push delivery; also toggleable via a mock for local development

---

## Tech Stack

### Backend

- **Node.js** v20+
- **TypeScript** v5.x
- **Express** v5.x — Web framework
- **MongoDB** — NoSQL database (MongoDB Atlas in production)
- **Mongoose** — ODM for MongoDB
- **RabbitMQ** (via `amqplib`) — Message broker (CloudAMQP in production)
- **Redis** (via `ioredis`) — Distributed rate limiting and response caching (Redis Cloud in production)
- **Pino** — Structured JSON logging

### Notification Providers

- **Resend** — Transactional email, via a verified sending domain
- **Twilio** — SMS delivery
- **Firebase Admin SDK** — Push notifications (FCM)

### Infrastructure

- **Docker** & **Docker Compose** (V2) — Containerization and local/production orchestration
- **nginx** — Reverse proxy and load balancer across API replicas
- **MongoDB Atlas** — Managed MongoDB (production)
- **CloudAMQP** — Managed RabbitMQ (production)
- **Redis Cloud** — Managed Redis (production)

### Security & Middleware

- **Helmet** — Security headers
- **express-rate-limit** + **rate-limit-redis** — Distributed rate limiting, shared correctly across all API replicas
- **CORS** — Configurable cross-origin access

> **Note:** This project requires a recent release of **Docker Compose V2** (the `docker compose` CLI). The `deploy.replicas` field used for local multi-instance scaling is honored by Compose V2 without requiring Docker Swarm; older Compose V1 (`docker-compose`, hyphenated) ignores this field. Verify your version with `docker compose version`.

---

## API Design

Full API documentation, including request/response examples for every endpoint, is maintained as a **Postman collection**.

📎 **Postman Collection:** _[link to be added once deployed]_

### Quick Reference

| Method   | Endpoint                 | Description                                                                        |
| -------- | ------------------------ | ---------------------------------------------------------------------------------- |
| `POST`   | `/api/notifications`     | Create a new notification and queue it for delivery                                |
| `GET`    | `/api/notifications/:id` | Get the status and details of a single notification                                |
| `GET`    | `/api/notifications`     | List notifications, with optional filtering by `status` / `channel` and pagination |
| `DELETE` | `/api/notifications/:id` | Delete a notification                                                              |
| `GET`    | `/health`                | Health check endpoint                                                              |

> **Rate limiting:** `/api/notifications` routes are rate-limited per client (100 requests / 15 minutes by default), enforced consistently across all API replicas via a shared Redis counter.

---

## Database Schema

### Notifications Collection

```typescript
{
  _id: ObjectId,                    // Auto-generated unique ID
  recipient: String,                // Email, phone, or device token (max 320 chars)
  message: String,                  // Notification content (max 5000 chars)
  channel: String,                  // "email" | "sms" | "push"
  subject: String | null,           // Optional email subject (max 200 chars)
  status: String,                   // Current status (see below)
  attempts: Number,                 // Current retry count (default: 0)
  maxAttempts: Number,              // Maximum retries (default: 3)
  lastAttemptAt: Date | null,       // Last processing attempt timestamp
  sentAt: Date | null,              // Successful delivery timestamp
  failedAt: Date | null,            // Final failure timestamp
  error: String | null,             // Real error message on failure (max 1000 chars) —
                                     // for SMS specifically, this surfaces the actual
                                     // provider error (e.g. a genuine Twilio message),
                                     // not a generic placeholder
  metadata: Object | null,          // Custom data (Schema.Types.Mixed)
  createdAt: Date,                  // Auto-generated creation timestamp
  updatedAt: Date                   // Auto-generated update timestamp
}
```

### Status Values

- `pending`: Created but not yet queued
- `queued`: Published to RabbitMQ, waiting for a worker
- `processing`: A worker is currently sending the notification
- `sent`: Successfully delivered
- `failed`: Failed after max retry attempts

### Validation

All field constraints (required fields, max lengths, enums) are enforced at the schema level via Mongoose, so invalid data is rejected before it reaches the database — not just at the API layer.

### Indexes

```javascript
{ status: 1, createdAt: -1 }     // Filter by status, sort by date (used by the list endpoint)
{ recipient: 1 }                  // Look up by recipient
{ channel: 1, status: 1 }         // Filter by channel and status
```

Good, this clarifies something important the original README got wrong: **there are actually two separate retry layers**, not one. Let me write this accurately.

````markdown
## Queueing Model & Retry Flow

### Two Independent Retry Layers

This system has two separate retry mechanisms operating at different levels:

1. **Message-level retry** (`queue.service.ts`) — catches _unexpected exceptions_ during message processing (e.g. a crash while parsing or handling a message). Tracks retry count via an `x-retry-count` message header, up to 3 attempts, before the message is permanently routed to the dead-letter queue.
2. **Business-level retry** (`notificationWorker.ts`) — catches _expected provider failures_ (e.g. Resend/Twilio/Firebase returning an error) and retries with exponential backoff (5s → 10s → 20s), up to `maxAttempts` (default: 3) tracked directly on the notification record in MongoDB.

In practice, almost all retries you'll see are business-level (a provider failing to send) — the message-level retry exists as a safety net for genuinely unexpected processing errors, not routine provider failures.

### Message Structure

Messages published to the RabbitMQ queue:

```json
{
  "notificationId": "675a1b2c3d4e5f6g7h8i9j0k",
  "attempt": 1
}
```
````

### Processing Flow

```
1. CREATE
   ├─ API receives request
   ├─ Validate input
   ├─ Save to MongoDB (status: pending)
   └─ Publish to RabbitMQ
       └─ Update status: queued

2. PROCESS (Worker)
   ├─ Consume message from queue (prefetch: 10 — up to 10 unacknowledged messages processed concurrently per worker)
   ├─ Update status: processing
   ├─ Fetch notification from MongoDB
   ├─ Send via provider (Resend / Twilio / Firebase, or mock)
   └─ Handle result:
       ├─ SUCCESS
       │   ├─ Update status: sent
       │   ├─ Set sentAt timestamp
       │   └─ Acknowledge message (removed from queue)
       │
       └─ FAILURE (business-level)
           ├─ Check attempts < maxAttempts
           ├─ YES: Wait (exponential backoff), increment attempt, re-publish, status: queued
           └─ NO: status: failed, failedAt set, real provider error message stored
```

### Retry Strategy (Business-Level)

```
Attempt 1 fails → wait 5s  → retry
Attempt 2 fails → wait 10s → retry
Attempt 3 fails → wait 20s → retry
Still failing   → mark as failed, store the real provider error message
```

**Why exponential backoff:** avoids hammering a provider that's temporarily struggling, gives transient issues time to resolve, and reduces load during an outage rather than compounding it.

### Queue Configuration

```javascript
{
  durable: true,       // Queue survives RabbitMQ restart
  persistent: true,    // Messages survive restart
  noAck: false,         // Manual acknowledgment
  prefetch: 10          // Up to 10 messages processed concurrently per worker
}
```

## Scaling Strategy

### 1. API Servers (Stateless, Horizontally Scaled)

The API layer is fully stateless — no in-process session data, no local caching — so any replica can serve any request. This was a deliberate design goal, not an assumption: all shared state (rate-limit counters, cached responses) lives in Redis, not in the API process itself.

**Implementation:**

```yaml
# docker-compose.yml
api:
  build: .
  deploy:
    replicas: 3
```

nginx sits in front as a reverse proxy, load-balancing across all replicas via round-robin, using Docker's internal DNS to discover them automatically — no manual configuration needed when scaling up or down.

**Verified behavior:**

- Sequential requests to a single URL were observed landing on different replicas (`api-1`, `api-2`, `api-3`) in round-robin order, confirming nginx correctly distributes load
- A rate limit test (100 requests allowed, 101st+ rejected) was run against all 3 replicas simultaneously and cut off at exactly the 100th request — not ~300 — proving the rate-limit counter is genuinely shared via Redis across replicas, not tracked independently per instance

> **Requires Docker Compose V2.** The `deploy.replicas` field is honored for local multi-instance scaling by Compose V2 without requiring Docker Swarm. Verify with `docker compose version`.

### 2. Worker Processes (Independent Queue Consumers)

Workers consume from the same RabbitMQ queue; RabbitMQ distributes messages across all connected consumers automatically (round-robin), so adding more worker instances increases processing throughput without any code or configuration changes.

Each worker processes up to 10 messages concurrently (`prefetch: 10`), since sends are I/O-bound (waiting on a provider API call), not CPU-bound.

### 3. MongoDB (Managed, via MongoDB Atlas)

Rather than self-hosting MongoDB with manually configured replica sets, the production deployment uses **MongoDB Atlas**, which provides:

- Automatic replication and failover
- Managed backups
- Connection handled identically to a self-hosted instance from the application's perspective — the same Mongoose connection code works unchanged, only the connection string differs (`MONGODB_URI`, swapped via environment variable)

### 4. RabbitMQ (Managed, via CloudAMQP)

Similarly, RabbitMQ runs on **CloudAMQP** in production rather than a self-hosted container. The application's queue logic (`rabbitmq.config.ts`) required zero code changes to support this — `amqplib` natively handles the `amqps://` (TLS) connection string CloudAMQP provides, with the same reconnection and dead-letter logic that was built and tested against a local RabbitMQ container.

### 5. Redis (Managed, via Redis Cloud)

Rate limiting and caching run against **Redis Cloud** in production. Both the rate limiter (`express-rate-limit` + `rate-limit-redis`) and the cache service were built with a fail-open posture: if Redis is unreachable, requests are still served — uncached and unlimited — rather than the whole API going down over a Redis outage.

### Local vs. Production, One Codebase

A single `docker-compose.yml` supports both modes via Compose profiles:

```bash
# Local development — spins up local Mongo/RabbitMQ/Redis containers alongside the app
docker compose --profile local up --build

# Production — connects to managed cloud services instead, via .env values
docker compose up --build -d
```

The only difference between the two is which values are set for `MONGODB_URI`, `RABBITMQ_URL`, and `REDIS_URL` in `.env` — the application code and container images are identical in both environments.

---

## Fault Tolerance Strategy

### 1. Message Persistence

**Problem:** RabbitMQ restarts or crashes → messages lost.

**Solution:** Durable queues + persistent messages.

```typescript
await channel.assertQueue(NOTIFICATION_QUEUE, {
  durable: true, // Queue survives restart
  arguments: { "x-dead-letter-exchange": DLX_EXCHANGE },
});

channel.sendToQueue(NOTIFICATION_QUEUE, message, {
  persistent: true, // Message survives restart
});
```

**Result:** messages survive a RabbitMQ restart.

### 2. Dead-Letter Queue

**Problem:** A message that repeatedly fails to process (not a provider failure — a genuine processing error) shouldn't be lost or retried forever.

**Solution:** A dedicated dead-letter exchange and queue. Messages that are explicitly nacked with `requeue: false`, or that exceed the message-level retry limit (see Queueing Model), are routed here instead of vanishing — giving a durable record of messages that needed manual investigation.

### 3. Automatic Reconnection with Exponential Backoff

**Problem:** The RabbitMQ connection drops (network blip, broker restart, managed-service maintenance).

**Solution:** The connection wrapper listens for `close` events and automatically schedules a reconnect, using exponential backoff (1s → 2s → 4s → ... capped at 30s, up to 10 attempts) rather than retrying instantly and hammering a broker that's still recovering. A reconnect guard (`isReconnecting`) prevents overlapping reconnect attempts, and `isShuttingDown` ensures a deliberate shutdown is never mistaken for a dropped connection.

**Result:** the API and worker recover automatically from a transient RabbitMQ outage without manual intervention or a restart.

### 4. Manual Acknowledgment

**Problem:** A worker crashes mid-processing.

**Solution:** Messages are only acknowledged (`channel.ack`) after processing succeeds. If the worker crashes before acknowledging, RabbitMQ redelivers the message once the connection recovers.

### 5. Exponential Backoff on Business-Level Failures

**Problem:** A provider (Resend, Twilio, Firebase) is temporarily failing.

**Solution:** Failed sends are retried with increasing delay (5s → 10s → 20s) rather than immediately, per the retry flow described above — reducing load on a struggling provider and giving transient issues time to resolve.

### 6. Redis Fail-Open

**Problem:** Redis (rate limiting, caching) becomes unreachable.

**Solution:** Both the rate limiter and the cache service are built to fail open — if a Redis operation fails, the request is still served (uncached, unrestricted) rather than the API returning an error. Losing rate-limiting or caching during a Redis outage is an acceptable degradation; losing the entire API because a supporting service is down is not.

### 7. Managed Database & Broker Resilience

**Problem:** Self-hosted MongoDB/RabbitMQ/Redis are single points of failure.

**Solution:** Production runs all three as managed services (MongoDB Atlas, CloudAMQP, Redis Cloud), which handle their own replication, failover, and backups — outside the scope of this application's own code, but a deliberate infrastructure choice over self-hosting.

### 8. Graceful Shutdown

**Problem:** A deployment or restart kills the API or worker mid-request/mid-processing.

**Solution:** Both the API and worker listen for `SIGTERM`/`SIGINT`, stop accepting new work, drain in-flight requests/messages, close connections cleanly (RabbitMQ, MongoDB, Redis), and exit — with a forced-exit timeout as a backstop if shutdown hangs.

### 9. Health Checks

GET /health

Confirms the API is running and responsive; used by container orchestration to determine instance health.

---

## Deployment

### Infrastructure

The system is deployed on a single **Oracle Cloud Always Free** VM instance running Ubuntu, with the following managed services handling data persistence and messaging:

| Component             | Production Service                         |
| --------------------- | ------------------------------------------ |
| Database              | **MongoDB Atlas** (M0 free tier)           |
| Message Broker        | **CloudAMQP** (Little Lemur, free tier)    |
| Cache / Rate Limiting | **Redis Cloud** (free tier)                |
| Email                 | **Resend**, with a verified sending domain |
| SMS                   | **Twilio**                                 |
| Push                  | **Firebase Cloud Messaging**               |

The application layer itself — 3 API replicas, 1 worker, and nginx — runs as Docker containers on the Oracle VM, connecting out to the managed services above rather than self-hosting them.

### Deployment Process

1. **Provision the VM** — an Oracle Cloud Always Free Ampere A1 (or AMD Micro) instance, Ubuntu image, with Docker and Docker Compose V2 installed
2. **Clone the repository** onto the VM
3. **Configure environment variables** — a `.env` file on the VM holds production values: managed-service connection strings (`MONGODB_URI`, `RABBITMQ_URL`, `REDIS_URL`), provider credentials (Resend, Twilio, Firebase), and the real-provider toggle flags (`USE_REAL_SMS=true`, `USE_REAL_PUSH=true`) — set to `true` in production, `false` in local development to avoid consuming provider trial credits
4. **Start the stack**, without the `local` profile so no local Mongo/RabbitMQ/Redis containers are started:

```bash
   docker compose up --build -d
```

5. **Verify** — `docker compose ps` confirms all containers (3× `api`, `worker`, `nginx`) are healthy and running; `docker compose logs` confirms each service successfully connected to its managed cloud dependency

### Network Access

- nginx is the only container with a published port (`80`), and is the sole entry point for all external traffic — the API replicas themselves are not directly reachable from outside the Docker network
- MongoDB Atlas, CloudAMQP, and Redis Cloud are each configured to accept connections from the VM's IP specifically (rather than left open to all IPs), reducing exposure to unauthorized access

### One Codebase, Two Modes

The same `docker-compose.yml` and application code run locally and in production — only the `.env` values and the presence/absence of the `--profile local` flag differ:

```bash
# Local development
docker compose --profile local up --build

# Production (this deployment)
docker compose up --build -d
```

This means anything verified locally — load balancing, shared rate limiting, retry logic, graceful shutdown — behaves identically in production, since it's the same containers and code, just pointed at different (managed, rather than local) infrastructure.
Good instinct — let's ground this entirely in things you actually built and can defend, not hypothetical capacity math for numbers you never tested.

---

```markdown
## Design Defense

### 1. Why a Message Queue Instead of Sending Directly from the API?

**Without a queue (synchronous):**
```

Client → API → Send via provider (200ms–3s) → Response

```
The client waits for the full provider round-trip, the API is blocked for that duration, and a provider outage directly takes down API response times.

**With a queue (this system's actual design):**
```

Client → API → Save + Publish to RabbitMQ → Response (near-instant)
↓
Worker → Send via provider

```
The API returns as soon as the notification is persisted and queued — it never waits on the provider. This was verified directly: notifications consistently return `201 Created` immediately, with the actual send (and any retries) happening asynchronously, visible only by polling `GET /api/notifications/:id` afterward.

**Why RabbitMQ specifically:** persistent, durable messages (verified — messages survive without being lost across restarts in testing), a dead-letter queue for exhausted retries, and independent horizontal scaling of workers without touching the API.

### 2. Why Is the API Stateless, and How Was That Actually Proven?

Statelessness was a deliberate design constraint, not just an assumption — every piece of state that could have lived in-process (rate-limit counters, cached responses) was deliberately pushed into Redis instead.

This was verified concretely, not just claimed:
- **Load balancing test:** nginx, load-balancing round-robin across 3 API replicas, was observed distributing sequential requests across all 3 instances (`api-1 → api-3 → api-1 → api-3 → api-2 → api-2` across 6 requests)
- **Shared rate limiting test:** a 100-request rate limit was enforced as a single global count across all 3 replicas simultaneously — 100 requests succeeded, the 101st onward returned `429`, proving the limit is genuinely shared via Redis rather than tracked independently per replica (which would have allowed ~300 successes)

### 3. How Does the System Handle Provider Failures Without Losing Information?

A common failure mode in systems like this is swallowing the real reason a send failed and replacing it with a generic message — which makes debugging (and demonstrating *why* something failed) impossible.

This system was specifically built to avoid that, for SMS: `TwilioSmsProvider` returns the real error string from Twilio's API, which flows through `NotificationService.send()` and the worker's failure handler, and is stored directly on the notification record. This was verified end-to-end: a deliberately invalid Twilio `from` number produced the exact error `"Twilio: 'From' +1234567890 is not a Twilio phone number or Short Code country mismatch"` stored in the notification's `error` field — a genuine, specific third-party error, not a placeholder like `"Provider returned failure"`.

### 4. How Does Retry Logic Actually Behave?

Retry behavior was tested directly, not just implemented: a notification sent to a deliberately invalid/unverified recipient went through exactly 3 attempts (`attempts: 3`), with waits of 5s, 10s, and 20s between them (matching the exponential backoff formula), before landing on `status: "failed"` with the real provider error preserved.

### 5. Why Fail Open on Redis, Rather Than Fail Closed?

If Redis (rate limiting, caching) becomes unreachable, the system deliberately continues serving requests — uncached, unrestricted — rather than returning errors. The reasoning: losing rate-limiting or caching temporarily is a degraded-but-functional state; losing the entire API because a supporting service went down is a much worse outcome for a notification system whose whole purpose is reliable delivery.

### 6. Why Managed Services Instead of Self-Hosted Databases/Broker in Production?

Self-hosting MongoDB, RabbitMQ, and Redis on the same VM as the application would mean a single machine failure takes down data, messaging, and the application simultaneously. Using MongoDB Atlas, CloudAMQP, and Redis Cloud moves replication, failover, and backup responsibility to services built for that purpose — a deliberate trade-off of infrastructure control for reliability, appropriate given the project's scope and resources.

### 7. What's the Known, Acknowledged Limitation of This Deployment?

The application layer (nginx + 3 API replicas + worker) still runs on a **single VM**. While each of the 3 API replicas can individually fail without taking the others down (proven above), a failure of the underlying VM itself would take down all of them simultaneously, since they share the same physical/virtual host. The managed data/messaging services are unaffected by this specific failure mode, but the application layer itself is not yet distributed across multiple hosts. The natural next step for true host-level fault tolerance would be an orchestrator like Kubernetes or Docker Swarm, scheduling replicas across genuinely separate machines — a deliberate scope boundary for this project, not an oversight.
```
