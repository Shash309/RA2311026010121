# Campus Notifications Microservice - System Design

## Stage 1: API Design & Contract

### Core Actions
1. **Get Notifications:** Retrieve notifications for the logged-in student.
2. **Mark as Read:** Update the status of a specific notification to read.
3. **Mark All as Read:** Update all unread notifications for the student to read.

### REST API Endpoints

#### 1. Get Notifications
- **Endpoint:** `GET /api/v1/notifications`
- **Headers:**
  - `Authorization: Bearer <token>`
- **Query Parameters:**
  - `page` (optional): Page number for pagination.
  - `limit` (optional): Number of records per page.
  - `unreadOnly` (optional): Boolean to filter only unread notifications.
- **Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "Placement",
      "message": "Interview scheduled",
      "isRead": false,
      "createdAt": "2026-05-02T10:00:00Z"
    }
  ],
  "meta": { "currentPage": 1, "totalPages": 5 }
}
```

#### 2. Mark Notification as Read
- **Endpoint:** `PATCH /api/v1/notifications/:id/read`
- **Headers:**
  - `Authorization: Bearer <token>`
- **Request:** Empty body
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Notification marked as read."
}
```

#### 3. Mark All Notifications as Read
- **Endpoint:** `POST /api/v1/notifications/read-all`
- **Headers:**
  - `Authorization: Bearer <token>`
- **Request:** Empty body
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "All notifications marked as read."
}
```

### Real-Time Notification Mechanism
To support real-time updates without the overhead of client polling, I will use **WebSockets** (or alternatively, Server-Sent Events). 
- When a user logs in, the frontend establishes a secure WebSocket connection with the backend (`wss://api.domain.com/ws/notifications`).
- The connection is authenticated using the same JWT token.
- Whenever an event triggers a notification (e.g., new placement result), the backend publishes the notification directly to the specific user's active WebSocket connection, allowing the frontend to instantly display the alert.

---

## Stage 2: Database Design

### Persistent Storage Choice: PostgreSQL
**Reasoning:** I suggest a relational database like PostgreSQL. Notifications are inherently relational as they tie back to structured entities (Students, Events). PostgreSQL provides ACID compliance, strong data integrity, and excellent indexing capabilities. For the scale described, PostgreSQL is highly performant and supports JSONB if we later need semi-structured metadata attached to notifications.

### Database Schema
```sql
CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id BIGINT NOT NULL,
    notification_type notification_type NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Challenges with Data Volume & Solutions
**Problems:**
- **Slower Queries:** As the table grows into millions of rows, looking up unread notifications will become slower due to index size and table bloat.
- **High Write Load:** Bulk notifications (e.g., campus-wide events) will cause concurrent write spikes, leading to locks and increased latency.

**Solutions:**
1. **Partitioning:** Partition the `notifications` table by `created_at` (e.g., weekly or monthly partitions). Queries for recent notifications only scan the latest partition.
2. **Data Archival:** Move notifications older than 6 months to a cheaper "cold storage" (like AWS S3) or a separate archival table since users rarely view old alerts.

### Sample Queries based on REST APIs
**Get Unread Notifications:**
```sql
SELECT id, notification_type, message, created_at 
FROM notifications 
WHERE student_id = ? AND is_read = FALSE 
ORDER BY created_at DESC 
LIMIT 20 OFFSET 0;
```
**Mark as Read:**
```sql
UPDATE notifications SET is_read = TRUE WHERE id = ? AND student_id = ?;
```

---

## Stage 3: Query Optimization

### Query Analysis
**Original Query:**
```sql
SELECT * FROM notifications WHERE studentID = 1042 AND isRead = false ORDER BY createdAt DESC;
```
- **Accuracy:** Functionally, yes, it accurately fetches all unread notifications for a specific student, sorted by newest first.
- **Why is it slow?:** Without an appropriate index, the database must scan every single row for that `studentID` (or worse, perform a full table scan if no index exists on `studentID`), filter out the read ones, and then sort the results in memory. For 5,000,000 rows, this is heavily resource-intensive.

### Improvements & Computation Cost
- **Change:** I would add a **Composite Index** on `(studentID, isRead, createdAt DESC)`.
- **Computation Cost:** The time complexity of the lookup drops from **O(N)** (Full Table Scan) to **O(log N)** (B-Tree Traversal). The DB engine can directly navigate to the exact branch containing unread records for that student, already pre-sorted by time, completely skipping the in-memory sort phase.

### Indexing Every Column?
**Is this advice effective?** **NO. It is highly counter-productive.**
- **Why not:** Indexes speed up read operations but significantly slow down write operations (`INSERT`, `UPDATE`, `DELETE`). Every time a notification is created or marked as read, every single index on the table would need to be recomputed and updated. Furthermore, indexes consume substantial disk space and memory. You should only index columns used in `WHERE`, `JOIN`, or `ORDER BY` clauses.

### Query: Placement in the last 7 days
```sql
SELECT DISTINCT studentID 
FROM notifications 
WHERE notification_type = 'Placement' 
  AND created_at >= NOW() - INTERVAL '7 days';
```
*(Note: Requires an index on `(notification_type, created_at)` for optimal performance).*

---

## Stage 4: Performance Improvements

### Solutions to Overwhelmed Database from Page Load Fetches
1. **Caching Layer (Redis):** 
   - Store the user's unread notification count and the most recent 20 notifications in a fast, in-memory cache like Redis.
   - On page load, the backend queries Redis instead of PostgreSQL. 
   - When a new notification is generated or an item is marked read, the cache is invalidated or updated.
   - **Tradeoffs:** High performance and vastly reduced DB load. However, introduces system complexity (cache invalidation logic) and potential for stale data if the cache falls out of sync with the DB.

2. **Transition Fully to WebSockets (Push vs Pull):** 
   - Instead of the client sending an HTTP GET request on every page load or route change, the client connects once via WebSockets upon login. 
   - The state of unread notifications is maintained in the frontend (e.g., Redux context). The DB is only queried upon initial connection; subsequent updates are pushed from the server.
   - **Tradeoffs:** Eliminates redundant fetching and provides real-time UX. However, maintaining thousands of persistent stateful WebSocket connections requires significant server memory and load balancer tuning.

---

## Stage 5: Scaling 'Notify All'

### Shortcomings of Current Pseudocode
1. **Synchronous Blocking Loop:** Processing 50,000 iterations in a single thread is incredibly slow and blocks the API response. The HTTP request will likely time out before finishing.
2. **Lack of Fault Tolerance:** If `send_email` fails at index 200 (e.g., due to an API rate limit or network glitch), the execution halts. We lose track of who received it and who didn't. Rerunning the function will send duplicate emails to the first 200 students.
3. **Tight Coupling:** Mixing slow external network calls (email APIs) with fast internal network calls (DB inserts) in a synchronous loop is an anti-pattern. 

### Redesigning for Reliability and Speed
**Should saving to DB and sending email happen together?**
**No.** They should be completely decoupled. Saving an internal notification is critical and fast; sending an email relies on an external third-party provider (SendGrid, SES) which can be slow or rate-limited. By decoupling them using a **Message Broker (Queue)** like RabbitMQ or AWS SQS, a failure in the email service won't prevent the in-app notification from appearing.

### Revised Implementation (Event-Driven using Message Queues)
The API endpoint should immediately accept the request and delegate the heavy lifting to asynchronous background workers.

```python
function notify_all(student_ids: array, message: string):
    # Enqueue a single master job and return success to the HR user instantly
    job_id = generate_uuid()
    enqueue_job(Queue.BULK_NOTIFICATIONS, { "students": student_ids, "msg": message })
    return HTTP_202_ACCEPTED

# Background Worker processing Queue.BULK_NOTIFICATIONS
function handle_bulk_notify_worker(job_data):
    for student_id in job_data.students:
        # Enqueue individual, decoupled tasks
        enqueue_job(Queue.SAVE_DB_AND_PUSH, { "student_id": student_id, "msg": job_data.msg })
        enqueue_job(Queue.SEND_EMAIL, { "student_id": student_id, "msg": job_data.msg })

# Background Worker processing Queue.SAVE_DB_AND_PUSH
function handle_db_and_push_worker(job_data):
    try:
        save_to_db(job_data.student_id, job_data.msg)
        push_to_app(job_data.student_id, job_data.msg)
    except DBError:
        retry_with_exponential_backoff()

# Background Worker processing Queue.SEND_EMAIL
function handle_email_worker(job_data):
    try:
        send_email(job_data.student_id, job_data.msg)
    except EmailAPIError:
        # If external API fails, this specific job retries without affecting others
        retry_with_exponential_backoff()
```

---

## Stage 6: Priority Inbox Implementation

### Approach & Efficiency
To maintain the top 10 notifications efficiently as new ones stream in, I use a **Min-Heap (Priority Queue)** data structure with a fixed capacity of `n` (in this case, 10). 

**Priority Calculation Logic:**
We define priority based on two factors: Type (Weight) and Recency.
1. Weight mapping: `Placement` = 3, `Result` = 2, `Event` = 1.
2. For two notifications, we first compare their weight. If the weights are different, the one with the higher weight is strictly prioritized.
3. If the weights are identical, we compare their timestamps. The notification with the more recent timestamp (larger unix epoch time) is prioritized.

**Efficiency:**
Instead of storing all notifications and sorting them `O(N log N)`, we maintain a Min-Heap of exactly 10 elements. 
- The heap stores items ordered such that the "lowest priority" item among the top 10 is always at the root.
- As new notifications arrive, if the heap has fewer than 10 items, we insert it `O(log K)`.
- If the heap is full (size 10), we compare the new notification to the root (the minimum element in the heap). If the new notification has a *higher* priority than the root, we pop the root and push the new notification `O(log K)`.
- **Time Complexity:** `O(N log K)` where `N` is the total number of incoming notifications and `K` is 10. Since `K` is constant, time complexity effectively becomes **`O(N)`**.
- **Space Complexity:** **`O(K)`** (Constant memory usage, extremely efficient even for millions of notifications).

The actual implementation logic has been placed in the `notification_app_be` folder.
