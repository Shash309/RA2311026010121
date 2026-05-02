## API Test Evidence

### 1. Authentication API
* Generates access token using credentials

### 2. Vehicle Maintenance Scheduler
* Endpoint: /schedule
* Returns optimized task allocation using knapsack algorithm

### 3. Notification Priority System
* Endpoint: /priority
* Returns top 10 notifications sorted by priority

All screenshots are stored in:
`vehicle_maintenance_scheduler/outputs/screenshots/`

* auth-success.png
* scheduler-api.png
* priority-api.png
* output-file.png

**Notes:**
* All APIs are tested locally
* Authentication handled via interceptor
* Responses include real-time computed data
* Output file generated for scheduler results
