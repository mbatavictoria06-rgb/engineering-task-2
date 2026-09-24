# Engineering Task 2 - Background Job System Documentation

## 1. Project Overview

This project implements a robust background job processing system designed to handle long-running workloads, specifically **background PDF job generation**. 

PDF generation was chosen as the slow/background workload because it perfectly simulates a CPU-heavy, blocking, and slow operation. In a typical web request lifecycle, generating a PDF synchronously would block the main event loop and lead to timeouts or a poor user experience. Offloading this task to a background worker ensures the API remains fast, responsive, and available.

## 2. Architecture

The architecture is designed to completely decouple the HTTP request lifecycle from the heavy processing work.

- **API Process**: A lightweight Node.js/Express server responsible for receiving job requests, validating them, saving them to the database, and immediately returning an HTTP 202 response to the client.
- **PostgreSQL/Prisma**: The system uses PostgreSQL as the centralized datastore and job queue, managed via the Prisma ORM. PostgreSQL handles atomic locking and concurrent access.
- **Separate Worker Process**: A standalone Node.js process dedicated strictly to polling the database for pending jobs and processing them. The worker process operates independently of the API.
- **PDF Output Location**: Generated PDFs are securely saved to the local filesystem under the path `storage/jobs/<job-id>.pdf`.
- **Separation of Concerns**: The request path never touches the PDF generation logic. It solely writes a job record to the database. The background worker independently discovers and executes the job.

## 3. Job Record

The job queue is powered by a `Job` table in PostgreSQL. Every job record contains the following fields:

- `id`: A unique UUID primary key.
- `type`: The type of job (e.g., `generate-pdf`).
- `payload`: A JSON field containing the dynamic data required to run the job (e.g., HTML content or user details).
- `status`: The current state of the job.
- `attempts`: The number of times the job has been attempted.
- `maxAttempts`: The maximum number of retries allowed before the job is marked dead.
- `lastError`: A text field storing the stack trace or error message of the most recent failure.
- `runAt`: A timestamp determining the earliest time a job can be picked up. Used for scheduling retries with backoff.
- `startedAt`: A timestamp recording when processing most recently began.
- `finishedAt`: A timestamp recording when the job was successfully completed or permanently failed.
- `idempotencyKey`: A unique string ensuring duplicate requests do not create duplicate jobs.

### Statuses
- **`pending`**: The job is queued and waiting to be picked up by a worker.
- **`processing`**: A worker has claimed the job and is actively executing it.
- **`succeeded`**: The job was executed successfully and the PDF was generated.
- **`failed`**: The job encountered an error during execution but has not yet exceeded its `maxAttempts`. It is scheduled to be retried.
- **`dead`**: The job has failed repeatedly and exhausted all retries. It will not be processed again automatically.

## 4. Enqueue (POST /api/jobs)

The enqueue endpoint (`POST /api/jobs`) is responsible for accepting new background tasks.

- **Validation**: Incoming payloads are validated to ensure required fields are present.
- **HTTP 202**: Upon successfully saving the job to the database, the API responds with an HTTP 202 Accepted status.
- **Immediate Return**: The API returns instantly, completely decoupling the HTTP request from the PDF generation process.
- **No PDF Work**: No PDF generation code or logic is executed in the API handler.
- **Idempotency**: Clients must submit an `idempotencyKey`. If a duplicate key is submitted, the API catches the collision and returns the existing job details instead of creating a new one.
- **Database Unique Constraint**: The idempotency is strictly enforced by a unique index on the `idempotencyKey` column in the PostgreSQL database.

## 5. Worker

The worker operates as a completely separate background daemon.

- **Separate Process**: It is run independently of the API server.
- **Polling**: The worker continuously polls the database on a set interval looking for jobs where `status = 'pending'` and `runAt <= NOW()`.
- **Atomic Claim**: To prevent race conditions, the worker claims jobs atomically.
- **PostgreSQL `FOR UPDATE SKIP LOCKED`**: The query used to claim jobs utilizes `FOR UPDATE SKIP LOCKED`. This guarantees that if multiple workers are polling simultaneously, they will skip over rows already locked by other workers, ensuring each job is claimed exactly once.
- **Why SELECT-then-UPDATE is unsafe**: Performing a standard `SELECT` to find a job, followed by an `UPDATE` to mark it as `processing`, introduces a severe race condition. Multiple concurrent workers could `SELECT` the same job simultaneously and attempt to process it duplicate times.
- **Configurable Concurrency**: The worker limits how many jobs it processes concurrently based on configuration.

## 6. Failure and Retry

The system is resilient to transient failures.

- **Attempts and lastError**: Every time a job fails, its `attempts` counter is incremented, and the `lastError` field is updated with the exception details.
- **failed vs dead**: If `attempts` is less than `maxAttempts`, the job is marked `failed` and queued for a retry. If it reaches the maximum, it is marked `dead`.
- **Exponential Backoff**: Retries are not immediate. The time between retries increases exponentially to give struggling downstream systems time to recover.
- **Jitter**: A randomized jitter factor is applied to the backoff duration to prevent the "thundering herd" problem, where many retrying jobs wake up at the exact same millisecond.

### Current Configuration Values
- `MAX_JOB_ATTEMPTS=3`
- `JOB_BACKOFF_BASE_MS=1000`
- `MAX_CONCURRENCY=2`
- `WORKER_POLL_INTERVAL_MS=1000`
- `JOB_PROCESSING_TIMEOUT_MS=10000`
- `PDF_PROCESSING_DELAY_MS=2000`
- `FORCE_PDF_FAILURE=false`

## 7. Idempotent PDF Work

The PDF generation itself is structured to be idempotent.

- **Output Path**: Files are saved to `storage/jobs/<job-id>.pdf`.
- **Output Existence Check**: Before doing the heavy lifting of generating a PDF, the worker checks if the file at this path already exists.
- **Job ID as Output Key**: By tying the output filename to the unique `job-id`, we prevent overlapping file writes.
- **Duplicate Prevention**: Because of the existence check and the deterministic output path, a repeated worker run (e.g., due to a crash immediately after file creation but before the DB update) will simply detect the existing file and mark the job as succeeded without regenerating it.

## 8. Stuck-Job Recovery

If a worker process crashes or is killed out-of-memory while processing a job, the job is left indefinitely in the `processing` state.

- **Processing Timeout**: The system defines a `JOB_PROCESSING_TIMEOUT_MS`. Jobs stuck in `processing` longer than this threshold are considered orphaned.
- **Recovery Sweep**: A background recovery process periodically sweeps the database for these timed-out jobs.
- **Attempt Increment**: When a stuck job is found, its `attempts` counter is incremented.
- **Requeue/Dead**: Based on the attempt count, the stuck job is either reset to `failed` and rescheduled (requeued), or marked `dead` if retries are exhausted.
- **Concurrency-Safe Recovery**: The recovery sweep is also concurrency-safe, utilizing atomic updates to prevent multiple processes from recovering the same job at once.

## 9. Dead-Letter View

Jobs that exhaust all retries require manual intervention.

- **GET `/admin/dead-letters`**: Returns a list of all jobs in the `dead` status.
- **Details**: The view provides the `payload`, the `lastError` that caused the final failure, and the number of `attempts`.
- **Manual Retry (`POST /api/jobs/:id/retry`)**: An endpoint is provided to forcefully reset a `dead` job back to `pending`, resetting its attempt count so a human can retry it after fixing the underlying issue.

## 10. Status Endpoint

- **GET `/api/jobs/:id`**: Allows clients to poll for the status of their job. It returns the current `status`, `attempts`, and timestamps (`startedAt`, `finishedAt`, `runAt`), giving full visibility into the job's lifecycle without exposing sensitive internal state.

## 11. Break-It Tests

| Test | What Was Tested | Result | Key Measured Evidence | Evidence File |
| :--- | :--- | :--- | :--- | :--- |
| **Test 1: Concurrency** | Flooding the queue with 50 jobs to ensure `MAX_CONCURRENCY` is respected. | Passed. The worker correctly throttled execution. | Worker logs showing exactly 2 jobs processing at any given time. | `evidence/test-1-concurrency.md` |
| **Test 2: Failure/Retry/Dead** | Forcing deterministic failures (`FORCE_PDF_FAILURE=true`) to verify exponential backoff and dead-lettering. | Passed. Jobs transitioned from `failed` -> `dead`. | Logs showing backoff calculations and DB records showing `status = dead`. | `evidence/test-2-failure-retry-dead.md` |
| **Test 3: Stuck Recovery** | Hard-killing a worker mid-process to leave jobs stuck in `processing`, then restarting the worker. | Passed. The sweeper detected the timeout and requeued the job. | Logs showing "Recovering stuck job" and the job subsequently succeeding. | `evidence/test-3-stuck-recovery.md` |
| **Test 4: Idempotency** | Sending the exact same request body with the same `idempotencyKey` multiple times rapidly. | Passed. The API caught the duplicate key. | API returning HTTP 200 with the existing job ID instead of a new one. | `evidence/test-4-idempotency.md` |
| **Test 5: Two Workers** | Running two separate worker processes simultaneously against the same database. | Passed. No duplicate processing occurred. | `SKIP LOCKED` logs ensuring mutually exclusive atomic claims across both processes. | `evidence/test-5-two-workers.md` |

## 12. Evidence Index

Below is the list of required screenshots documenting the system's behavior:

1. **Screenshot 1**: API request/response showing HTTP 202 Accepted. Proves the enqueue endpoint functions correctly.
2. **Screenshot 2**: Worker logs demonstrating successful processing and PDF creation. Proves the background worker functions and writes files.
3. **Screenshot 3**: Exponential backoff logs. Proves that retries are delayed with increasing intervals and jitter.
4. **Screenshot 4**: Dead-letter view or database state. Proves that jobs correctly transition to `dead` after exhausting retries.
5. **Screenshot 5**: Stuck recovery logs. Note: *This screenshot contains the full stuck recovery sequence (before, during, and after) in one unified console view. The PDF requests separate before/after screenshots, but this single screenshot captures the complete unbroken timeline.*
6. **Screenshot 6**: Idempotency key rejection/deduplication. Proves the API enforces the unique constraint.
7. **Screenshot 7**: Jobs table database snapshot. *Captured manually, this screenshot shows all five statuses (pending, processing, succeeded, failed, dead) simultaneously in the database and is included with the final submission evidence.*

## 13. Configuration

The system is configured via environment variables.

- `DATABASE_URL`: The connection string to the PostgreSQL database.
- `PORT`: The HTTP port for the API server (default: 3000).
- `MAX_JOB_ATTEMPTS`: The maximum times a job will retry before dying (default: 3).
- `MAX_CONCURRENCY`: The maximum number of jobs a single worker process can run simultaneously (default: 2).
- `JOB_BACKOFF_BASE_MS`: The base multiplier for exponential backoff (default: 1000).
- `WORKER_POLL_INTERVAL_MS`: How frequently the worker checks the database for new jobs (default: 1000).
- `JOB_PROCESSING_TIMEOUT_MS`: How long before a `processing` job is considered stuck and recovered (default: 10000).
- `PDF_PROCESSING_DELAY_MS`: Simulated delay to mimic slow PDF generation (default: 2000).
- `FORCE_PDF_FAILURE`: A boolean flag used purely for testing to force jobs to fail (default: false).

## 14. Design Decisions

- **Why PDF Generation**: It effectively simulates a synchronous, blocking, CPU-intensive workload that absolutely must be offloaded from a web API.
- **Why PostgreSQL**: It provides robust ACID guarantees, durability, and atomic locking features (`SKIP LOCKED`), allowing us to build a reliable queue without introducing an external message broker like Redis or RabbitMQ.
- **Why a Separate Worker**: To guarantee that a crashing background job cannot bring down the API server, and to allow independent scaling of the web tier and the worker tier.
- **Why Atomic Claim**: Without atomic claims, multiple concurrent workers would pull the same jobs, leading to duplicate processing, file corruption, and wasted CPU cycles.
- **Why Exponential Backoff + Jitter**: Immediate retries on a struggling downstream dependency will only overwhelm it further. Backoff gives the system time to breathe, and jitter prevents synchronized "retry spikes".
- **Why Job-ID Output Keys**: It guarantees deterministic output file names, preventing race conditions and enabling the worker to easily verify if work has already been completed idempotently.
- **Why Minimal UI**: The focus of the assignment is the robust backend state machine and concurrency primitives, not frontend design. A REST API and basic text responses accurately represent how this would be built for a real backend microservice.

## 15. Running Locally

**Prerequisites:** Node.js (v18+) and PostgreSQL.

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Copy the example environment file and configure your local PostgreSQL connection:
   ```bash
   cp .env.example .env
   ```
   *(Ensure you update the `DATABASE_URL` in `.env` with your secure local credentials. Never commit `.env`!)*
3. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```
4. Build the TypeScript code:
   ```bash
   npm run build
   ```
5. Start the API server in one terminal:
   ```bash
   npm run start:api
   ```
6. Start the Worker process in a separate terminal:
   ```bash
   npm run start:worker
   ```
