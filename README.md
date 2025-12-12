# WaveCom Notification Delivery System

A scalable, fault-tolerant notification delivery system built to handle enterprise-scale transactional notifications (email, SMS, and push) with support for up to 50,000 notifications per minute.

## Table of Contents

- [Problem Overview](#problem-overview)
- [System Architecture](#system-architecture)
- [Components](#components)
- [Tech Stack](#tech-stack)
- [API Design](#api-documentation)
- [Database Schema](#database-schema)
- [Queueing model & Retry Flow](#queueing--retry-flow)
- [Scaling Strategy](#scaling-strategy)
- [Fault Tolerance strategy](#fault-tolerance)
- [Design Defense](#design-defense)

---

## Problem Overview

### Business Context

WaveCom is a communications startup serving enterprise clients (banks, fintechs, logistics companies) who require:

- **High reliability**: Critical transactional notifications must be delivered
- **Scalability**: Handle traffic spikes up to 50,000 notifications/minute
- **Multi-channel support**: Email, SMS, and Push notifications
- **Fault tolerance**: System must gracefully handle provider failures
- **Observability**: Track delivery status and retry attempts

### Requirements

1. **API-driven**: RESTful endpoints for creating and monitoring notifications
2. **Asynchronous processing**: Don't block API responses while sending notifications
3. **Retry logic**: Automatic retry with exponential backoff for failed deliveries
4. **Status tracking**: Real-time notification status (pending, queued, processing, sent, failed)
5. **Multi-channel**: Support email, SMS, and push notification providers

---

## System Architecture

### High-Level Architecture

![WaveCom Architecture Diagram](./src/assets/notification%20architecure.drawio.png)

### Request Flow

1. **Client Request**: User/Frontend sends notification request to API
2. **API Processing**:
   - Validates request data
   - Creates notification record in MongoDB (status: `pending`)
   - Publishes message to RabbitMQ queue
   - Updates notification status to `queued`
   - Returns response immediately (non-blocking)
3. **Queue Processing**:
   - Worker process consumes message from queue
   - Updates notification status to `processing`
   - Attempts to send via appropriate provider
4. **Provider Interaction**:
   - Success: Updates status to `sent`, records timestamp
   - Failure: Implements retry logic with exponential backoff
5. **Retry Logic**:
   - Failed notifications are requeued with incremented attempt counter
   - Maximum 3 attempts with delays: 5s, 10s, 20s
   - After max attempts: Status set to `failed`

---

## Components and responsibilities

### 1. Express API Server (`src/server.ts`, `src/app.ts`)

**Responsibilities:**

- Handle HTTP requests
- Validate input data
- Interact with MongoDB
- Publish messages to RabbitMQ
- Return immediate responses

**Key Features:**

- CORS-enabled for frontend access
- Environment-based configuration
- Graceful shutdown handling
- Health check endpoint

### 2. MongoDB Database

**Responsibilities:**

- Persist notification records
- Track status throughout lifecycle
- Store retry attempts and error messages
- Provide query capabilities for filtering

**Collections:**

- `notifications`: Main collection for all notification records

### 3. RabbitMQ Message Queue

**Responsibilities:**

- Decouple API from processing
- Ensure message persistence
- Enable horizontal scaling
- Provide reliable message delivery

**Queue Configuration:**

- Durable: Survives RabbitMQ restarts
- Persistent messages: Won't be lost
- Manual acknowledgment: Ensures delivery

### 4. Worker Process (`src/workers/notificationWorker.ts`)

**Responsibilities:**

- Consume messages from queue
- Process notifications asynchronously
- Interact with notification providers
- Handle failures and retries
- Update notification status

**Key Features:**

- Single message processing (prefetch: 1)
- Exponential backoff retry logic
- Error logging and tracking
- Graceful shutdown

### 5. Notification Services (`src/services/notification.service.ts`)

**Responsibilities:**

- Abstract provider-specific logic
- Route to correct channel (email/SMS/push)
- Simulate network delays and failures
- Return success/failure status

**Mock Providers:**

- Email: 90% success rate, 200-500ms delay
- SMS: 85% success rate, 100-300ms delay
- Push: 95% success rate, 50-150ms delay

---

## Tech Stack

### Backend

- **Node.js** v18+
- **TypeScript** v5.x
- **Express** v5.x - Web framework
- **MongoDB** v9.x - NoSQL database
- **Mongoose** - ODM for MongoDB
- **RabbitMQ** (via amqplib) - Message broker

### Infrastructure

- **Docker** - For RabbitMQ

## Scaling Strategy

### Horizontal Scaling

The system is designed to scale horizontally across all components:

#### 1. API Servers (Stateless)

**Current:** Single Express server
**Scale to:** Multiple API instances behind a load balancer

```
                  ┌─────────────┐
                  │Load Balancer│
                  └─────────────┘
                    │    │    │
          ┌─────────┼────┼────┼─────────┐
          │         │    │    │         │
    ┌─────▼───┐ ┌──▼────▼──┐ ┌▼────────▼┐
    │ API #1  │ │ API #2  │ │  API #3  │
    └─────────┘ └─────────┘ └──────────┘
```

**How:**

```bash
# Run multiple API instances on different ports
pm2 start src/server.ts -i 4  # 4 instances

# Or with Docker
docker-compose scale api=5
```

**Handles:** 10,000 req/min per instance → 50,000 req/min with 5 instances

---

#### 2. Worker Processes (Parallel Processing)

**Current:** Single worker process
**Scale to:** Multiple workers consuming from same queue

```
    ┌─────────────┐
    │  RabbitMQ   │
    │    Queue    │
    └─────────────┘
       │  │  │  │
    ┌──┴──┴──┴──┴──┐
    │ Workers (10)  │
    │ Processing    │
    │ in Parallel   │
    └───────────────┘
```

**How:**

```bash
# Run multiple workers
for i in {1..10}; do
  npm run worker &
done

# Or with PM2
pm2 start src/workers/notificationWorker.ts -i 10
```

**Handles:** 100 notif/min per worker → 1,000 notif/min with 10 workers

**RabbitMQ automatically distributes** messages across workers (round-robin)

---

#### 3. MongoDB (Replica Set)

**Current:** Single MongoDB instance
**Scale to:** Replica set for high availability

```
    ┌─────────┐
    │ Primary │◄──── Writes
    └────┬────┘
         │ Replicates
    ┌────┼────┐
    │    │    │
┌───▼┐ ┌─▼──┐ ┌▼───┐
│Sec1│ │Sec2│ │Sec3│◄──── Reads
└────┘ └────┘ └────┘
```

**Benefits:**

- High availability (auto-failover)
- Read scaling (distribute reads to secondaries)
- Data redundancy

---

#### 4. RabbitMQ (Clustering)

**Current:** Single RabbitMQ instance
**Scale to:** Clustered RabbitMQ

```
┌─────────┐   ┌─────────┐   ┌─────────┐
│ Node 1  │◄─►│ Node 2  │◄─►│ Node 3  │
└─────────┘   └─────────┘   └─────────┘
```

**Benefits:**

- High availability
- Load distribution
- Increased throughput

---

### Capacity Planning

**Target: 50,000 notifications/minute**

**Breakdown:**

```
50,000 notif/min ÷ 60 sec = 833 notif/sec

Assumptions:
- Each API request: 10ms processing
- Each worker sends: 0.5 notif/sec (2s per notif including delays)
- MongoDB write: 5ms

Required Resources:
- API Servers: 833 ÷ 100 req/sec = 9 instances
- Workers: 833 ÷ 0.5 = 1,666 workers (unrealistic)
  OR optimize provider to 0.1s/notif → 167 workers
- MongoDB: Replica set with 3 nodes
- RabbitMQ: 3-node cluster
```

---

## Fault Tolerance Strategy

### 1. Message Persistence

**Problem:** RabbitMQ crashes, messages lost
**Solution:** Durable queues + persistent messages

```javascript
// Queue configuration
await channel.assertQueue(QUEUE_NAME, {
  durable: true, // Queue survives restart
});

// Message configuration
channel.sendToQueue(QUEUE_NAME, message, {
  persistent: true, // Message survives restart
});
```

**Result:** Messages survive RabbitMQ restart

---

### 2. Manual Acknowledgment

**Problem:** Worker crashes mid-processing
**Solution:** Manual message acknowledgment

```javascript
channel.consume(
  QUEUE_NAME,
  async (msg) => {
    try {
      await processNotification(msg);
      channel.ack(msg); // Only ack on success
    } catch (error) {
      channel.nack(msg, false, true); // Requeue on failure
    }
  },
  { noAck: false }
);
```

**Result:** Failed messages return to queue for retry

---

### 3. Exponential Backoff

**Problem:** Provider temporarily down
**Solution:** Wait longer between retries

```javascript
const delay = Math.pow(2, attempt) * 5; // 5s, 10s, 20s
await sleep(delay * 1000);
```

**Result:** Reduces load on failing systems, increases success rate

---

### 4. Database Replica Set

**Problem:** MongoDB crashes
**Solution:** Automatic failover to secondary

```
Primary fails → Secondary promoted → App reconnects automatically
```

**Result:** Zero downtime during database failures

---

### 5. Health Checks & Monitoring

**Endpoints:**

```bash
# API health
GET /health

# Worker health (logs)
Monitors queue depth, processing rate, error rate
```

## Queueing & Retry Flow

### Message Structure

Messages published to RabbitMQ queue:

```json
{
  "notificationId": "675a1b2c3d4e5f6g7h8i9j0k",
  "attempt": 1
}
```

### Processing Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Notification Lifecycle                     │
└──────────────────────────────────────────────────────────────┘

1. CREATE
   ├─ API receives request
   ├─ Validate input
   ├─ Save to MongoDB (status: pending)
   └─ Publish to RabbitMQ
       └─ Update status: queued

2. PROCESS (Worker)
   ├─ Consume message from queue
   ├─ Update status: processing
   ├─ Fetch notification from MongoDB
   ├─ Send via provider
   └─ Handle result:
       ├─ SUCCESS
       │   ├─ Update status: sent
       │   ├─ Set sentAt timestamp
       │   └─ Acknowledge message (remove from queue)
       │
       └─ FAILURE
           ├─ Check attempts < maxAttempts
           ├─ YES: RETRY
           │   ├─ Calculate delay (exponential backoff)
           │   ├─ Wait delay seconds
           │   ├─ Increment attempt counter
           │   ├─ Re-publish to queue
           │   └─ Update status: queued
           │
           └─ NO: GIVE UP
               ├─ Update status: failed
               ├─ Set failedAt timestamp
               ├─ Store error message
               └─ Acknowledge message
```

### Retry Strategy

**Exponential Backoff:**

- Attempt 1 fails → Wait 5 seconds → Retry
- Attempt 2 fails → Wait 10 seconds → Retry
- Attempt 3 fails → Wait 20 seconds → Retry
- Attempt 3 fails again → Mark as `failed`

**Formula:**

```javascript
delaySeconds = Math.pow(2, attempt) * 5;
// attempt=1: 2^1 * 5 = 10s (but we use 5s for first)
// attempt=2: 2^2 * 5 = 20s (but we use 10s)
// attempt=3: 2^3 * 5 = 40s (but we use 20s)
```

**Why Exponential Backoff?**

- Prevents overwhelming failing providers
- Gives time for transient issues to resolve
- Reduces unnecessary load during outages

### Queue Configuration

```javascript
{
  durable: true,        // Queue survives RabbitMQ restart
  persistent: true,     // Messages survive restart
  noAck: false,         // Manual acknowledgment
  prefetch: 1           // Process one message at a time
}
```

**Benefits:**

- **Durability**: Messages not lost during crashes
- **Manual Ack**: Messages stay in queue until confirmed processed
- **Prefetch 1**: Prevents worker overload, ensures fair distribution

---

## API Documentation

### Base URL

```
http://localhost:3000
```

### Endpoints

#### 1. Create Notification

**POST** `/api/notifications`

Creates a new notification and queues it for processing.

**Request Body:**

```json
{
  "recipient": "user@example.com",
  "message": "Your order has been shipped!",
  "channel": "email",
  "subject": "Order Update",
  "metadata": {
    "orderId": "12345",
    "userId": "user-abc"
  }
}
```

**Request Fields:**

- `recipient` (string, required): Email address, phone number, or device token
- `message` (string, required): Notification content
- `channel` (string, required): One of: `email`, `sms`, `push`
- `subject` (string, optional): Email subject line (only for email channel)
- `metadata` (object, optional): Additional custom data

**Response (201 Created):**

```json
{
  "status": "success",
  "message": "Notification created and queued for processing",
  "data": {
    "id": "675a1b2c3d4e5f6g7h8i9j0k",
    "recipient": "user@example.com",
    "channel": "email",
    "status": "queued",
    "createdAt": "2024-12-11T10:30:00.000Z"
  }
}
```

**Error Response (400 Bad Request):**

```json
{
  "status": "error",
  "message": "Missing required fields: recipient, message, channel"
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "user@example.com",
    "message": "Welcome to WaveCom!",
    "channel": "email",
    "subject": "Welcome"
  }'
```

---

#### 2. Get Notification Status

**GET** `/api/notifications/:id`

Retrieves details of a specific notification.

**URL Parameters:**

- `id` (string, required): Notification ID

**Response (200 OK):**

```json
{
  "status": "success",
  "data": {
    "id": "675a1b2c3d4e5f6g7h8i9j0k",
    "recipient": "user@example.com",
    "message": "Your order has been shipped!",
    "channel": "email",
    "subject": "Order Update",
    "status": "sent",
    "attempts": 1,
    "maxAttempts": 3,
    "lastAttemptAt": "2024-12-11T10:30:05.000Z",
    "sentAt": "2024-12-11T10:30:05.500Z",
    "failedAt": null,
    "error": null,
    "metadata": {
      "orderId": "12345"
    },
    "createdAt": "2024-12-11T10:30:00.000Z",
    "updatedAt": "2024-12-11T10:30:05.500Z"
  }
}
```

**Error Response (404 Not Found):**

```json
{
  "status": "error",
  "message": "Notification not found"
}
```

**cURL Example:**

```bash
curl http://localhost:3000/api/notifications/675a1b2c3d4e5f6g7h8i9j0k
```

---

#### 3. List Notifications

**GET** `/api/notifications`

Retrieves a paginated list of notifications with optional filtering.

**Query Parameters:**

- `status` (string, optional): Filter by status (`pending`, `queued`, `processing`, `sent`, `failed`)
- `channel` (string, optional): Filter by channel (`email`, `sms`, `push`)
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20, max: 100)

**Response (200 OK):**

```json
{
  "status": "success",
  "data": {
    "notifications": [
      {
        "id": "675a1b2c3d4e5f6g7h8i9j0k",
        "recipient": "user@example.com",
        "channel": "email",
        "status": "sent",
        "attempts": 1,
        "createdAt": "2024-12-11T10:30:00.000Z",
        "sentAt": "2024-12-11T10:30:05.500Z",
        "failedAt": null
      }
    ],
    "pagination": {
      "total": 150,
      "page": 1,
      "limit": 20,
      "totalPages": 8
    }
  }
}
```

**cURL Examples:**

```bash
# Get all notifications
curl http://localhost:3000/api/notifications

# Filter by status
curl "http://localhost:3000/api/notifications?status=sent"

# Filter by channel
curl "http://localhost:3000/api/notifications?channel=email"

# Pagination
curl "http://localhost:3000/api/notifications?page=2&limit=10"

# Combined filters
curl "http://localhost:3000/api/notifications?status=sent&channel=email&page=1&limit=20"
```

---

#### 4. Health Check

**GET** `/health`

Checks if the API server is running.

**Response (200 OK):**

```json
{
  "status": "success",
  "message": "WaveCom Notification System is running",
  "timestamp": "2024-12-11T10:30:00.000Z"
}
```

---

## Database Schema

### Notifications Collection

```typescript
{
  _id: ObjectId,                    // Auto-generated unique ID
  recipient: String,                // Email, phone, or device token
  message: String,                  // Notification content
  channel: String,                  // "email" | "sms" | "push"
  subject: String | null,           // Optional email subject
  status: String,                   // Current status (see below)
  attempts: Number,                 // Current retry count
  maxAttempts: Number,              // Maximum retries (default: 3)
  lastAttemptAt: Date | null,       // Last processing attempt timestamp
  sentAt: Date | null,              // Successful delivery timestamp
  failedAt: Date | null,            // Final failure timestamp
  error: String | null,             // Error message if failed
  metadata: Object | null,          // Custom data
  createdAt: Date,                  // Auto-generated creation timestamp
  updatedAt: Date                   // Auto-generated update timestamp
}
```

### Status Values

- **`pending`**: Created but not yet queued
- **`queued`**: Published to RabbitMQ, waiting for worker
- **`processing`**: Worker currently sending notification
- **`sent`**: Successfully delivered
- **`failed`**: Failed after max retry attempts

### Indexes

```javascript
// Optimize common queries
{ status: 1, createdAt: -1 }     // Filter by status, sort by date
{ recipient: 1 }                  // Search by recipient
{ channel: 1, status: 1 }         // Filter by channel and status
```

---

## Design Defense

### 1. Why This Architecture?

**Question:** Why use a message queue instead of processing notifications directly in the API?

**Answer:**

**Without Queue (Synchronous):**

```
Client → API → Send Email (2-5 seconds) → Response
└─ User waits 5 seconds for response
└─ API blocked during send
└─ Can't scale independently
```

**With Queue (Asynchronous):**

```
Client → API → Queue → Response (50ms)
                 ↓
              Worker → Send Email (2-5s)

- User gets instant response
- API never blocked
- Workers scale independently
- Failed sends don't affect API
```

**Why RabbitMQ specifically?**

- Persistent messages (won't lose data)
- Flexible routing (can add priorities, dead-letter queues)
- Easy horizontal scaling
- Good performance (50k+ messages/sec)

### 2. How Will It Handle 50,000 Notifications/Minute?

**Question:** Prove this architecture can handle the target load.

**Answer:**

**Math:**

```
50,000 notif/min = 833 notif/sec

Components capacity:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
API Server (single instance):
- Express handles ~5,000 req/sec (simple CRUD)
- Our endpoint: ~100ms processing (DB write + queue)
- Capacity: 10 req/sec per core
- 4-core server: 40 req/sec
- Need: 833 ÷ 40 = 21 API servers

MongoDB:
- Write speed: ~10,000 writes/sec (single instance)
- Our writes: Simple documents, ~5ms each
- Need: 833 writes/sec
- Single instance handles it
- Use replica set for redundancy

RabbitMQ:
- Throughput: 50,000+ msg/sec (persistent messages)
- Our rate: 833 msg/sec
- Single instance handles it
- Use cluster for high availability

Workers:
- Mock provider: 200-500ms per notification
- Real providers: 1-3 seconds per notification
- Conservative: 2 seconds per notification
- 1 worker: 0.5 notif/sec
- Need: 833 ÷ 0.5 = 1,666 workers

Optimization: Batch sends
- Send 10 notifications per API call
- 1 worker: 5 notif/sec
- Need: 833 ÷ 5 = 167 workers

### 3. How Does the System Degrade Gracefully Under Load?

**Question:** What happens when load exceeds capacity?

**Answer:**

**Scenario: 100,000 notif/min (2× capacity)**

**Degradation Levels:**

**Level 1: Queue Buffering (Load: 100-150% capacity)**
```

More messages coming in than workers can process
→ RabbitMQ queue depth increases
→ Messages wait longer but aren't lost
→ API still accepts requests instantly
→ Workers process at max speed

User Impact: Notifications delayed by 1-2 minutes
System Impact: Queue using more memory

```

**Level 2: Horizontal Scaling (Load: 150-200% capacity)**
```

Auto-scaling triggers
→ Add more workers (10 → 20 → 30)
→ Queue depth decreases
→ Processing catches up

User Impact: Delay reduces to normal
System Impact: Higher costs

```

**Level 3: Rate Limiting (Load: >200% capacity)**
```

Queue depth exceeds threshold (50,000 messages)
→ API starts rejecting new requests (HTTP 503)
→ Client implements exponential backoff
→ Existing messages still processed

User Impact: Some requests rejected, must retry
System Impact: Prevents queue overflow, protects database

````

**Why This Works:**
- Queue acts as shock absorber
- System never crashes (just slows down)
- Critical notifications never lost
- Can add resources dynamically
- Degradation is predictable and measurable

**Monitoring Alerts:**
```yaml
Warning (queue > 5,000):
  action: Prepare to scale workers

Critical (queue > 20,000):
  action: Auto-scale workers +50%

Emergency (queue > 50,000):
  action: Enable rate limiting
````

---

### 4. What Are the Bottlenecks and Mitigations?

**Question:** Where will the system break first, and how do we fix it?

**Answer:**

#### Bottleneck #1: Worker Processing Speed

**Problem:**

- Workers limited by provider API speed (1-3s per notification)
  → Can't process fast enough
  → Queue backs up

**Mitigations:**

1. **Batch Sending**

```javascript
   // Instead of 1 notification per call
   sendEmail(recipient, message);

   // Send 10 at once
   sendBulkEmail([recipient1, recipient2, ...]);

   Result: 10× throughput increase
```

2. **Parallel Provider Connections**

```javascript
   // Instead of sequential
   await sendEmail();
   await sendSMS();

   // Parallel
   await Promise.all([sendEmail(), sendSMS()]);

   Result: 2× faster for multi-channel
```

3. **Provider Connection Pooling**

```javascript
   // Reuse HTTP connections
   const axiosInstance = axios.create({
     httpAgent: new http.Agent({ keepAlive: true })
   });

   Result: Eliminate connection overhead
```

---

#### Bottleneck #2: MongoDB Write Contention

**Problem:**
High write rate → Lock contention → Slow writes
→ API response time increases
→ User experience degrades
**Mitigations:**

1. **Write Concern Optimization**

```javascript
   // Instead of waiting for confirmation
   await notification.save();  // Default: wait for write

   // Fire-and-forget
   await notification.save({ w: 0 });  // Don't wait

   Result: 5× faster writes (but less safe)
```

2. **Sharding**
   Partition data by recipient hash
   → Distribute writes across multiple servers
   → Linear scalability
3. **Batch Inserts**

```javascript
   // Instead of 1 insert per notification
   await Notification.create(notification);

   // Batch 100 at once
   await Notification.insertMany(notifications);

   Result: 10× faster inserts
```

---

#### Bottleneck #3: RabbitMQ Single Node

**Problem:**
Single RabbitMQ node → Limited throughput
→ Becomes bottleneck at extreme scale

**Mitigations:**

1. **RabbitMQ Clustering**
   3-node cluster → Distribute load
   → 3× throughput
   → High availability

2. **Queue Sharding**
   notifications-priority-high
   notifications-priority-medium
   notifications-priority-low
   → Route by priority
   → Process high-priority first

---

#### Bottleneck #4: Network Bandwidth

**Problem:**
Large message payloads → Network saturation
→ Slow message delivery

**Mitigations:**

1. **Message Compression**

```javascript
   const compressed = zlib.gzipSync(JSON.stringify(message));
   channel.sendToQueue(queue, compressed);

   Result: 70% bandwidth reduction
```

2. **Reference Pattern**

```javascript
   // Instead of full notification in queue
   { notificationId, recipient, message, ... }  // 1KB

   // Just ID
   { notificationId }  // 24 bytes

   → Worker fetches full data from MongoDB
   Result: 99% bandwidth reduction
```

---

### Summary Table: Bottlenecks & Solutions

| Bottleneck      | Impact        | Solution           | Cost                 |
| --------------- | ------------- | ------------------ | -------------------- |
| Worker Speed    | Queue backup  | Batch sending      | Low (code change)    |
| MongoDB Writes  | Slow API      | Sharding           | High (infra)         |
| RabbitMQ Node   | Message delay | Clustering         | Medium (3× servers)  |
| Network         | Slow delivery | Compression        | Low (code change)    |
| Provider Limits | Failed sends  | Multiple providers | Medium (integration) |

---

## Conclusion

This system demonstrates production-ready architecture with:

- ✅ **Scalability**: Horizontal scaling across all components
- ✅ **Reliability**: Message persistence, retries, fault tolerance
- ✅ **Performance**: Asynchronous processing, optimized queries
- ✅ **Observability**: Status tracking, logging, metrics
- ✅ **Maintainability**: Clean separation of concerns, TypeScript

---
