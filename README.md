# Background PDF Job Generator

A robust Node.js and PostgreSQL background job processing system designed to handle slow, blocking tasks (simulated PDF generation) asynchronously.

## Architecture Summary
This project decouples a fast API from a heavy background workload using a PostgreSQL-backed job queue. The API (`Express.js`) receives job requests and instantly returns an HTTP 202. A completely separate Worker process (`Node.js`) constantly polls the database, claiming jobs atomically using PostgreSQL's `FOR UPDATE SKIP LOCKED`, ensuring maximum concurrency safety. The system includes built-in exponential backoff, dead-letter queuing, and automated stuck-job recovery.

## Requirements
- Node.js (v18 or newer)
- PostgreSQL (v12 or newer)
- npm

## Setup & Execution

**1. Install dependencies**
```bash
npm install
```

**2. Configure Environment**
Copy the example config and add your PostgreSQL credentials:
```bash
cp .env.example .env
```
*(Security Note: `.env` is deliberately excluded via `.gitignore` and should never be committed to source control.)*

**3. Run Database Migrations**
```bash
npx prisma migrate dev
```

**4. Build the Project**
```bash
npm run build
```

**5. Start the API** (In terminal 1)
```bash
npm run start:api
```

**6. Start the Worker** (In terminal 2)
```bash
npm run start:worker
```

## Endpoints
- `POST /api/jobs` - Enqueue a new PDF generation job (requires `idempotencyKey`).
- `GET /api/jobs/:id` - Check the status of a specific job.
- `GET /admin/dead-letters` - View jobs that exhausted all retry attempts.
- `POST /api/jobs/:id/retry` - Manually requeue a dead job.

## Documentation & Evidence
For a complete technical deep-dive, architecture decisions, and test results, please refer to the [DOCUMENTATION.md](./DOCUMENTATION.md).

All performance and break-it test logs are located in the `evidence/` directory.
