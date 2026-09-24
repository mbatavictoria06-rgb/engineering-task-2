# Test 2: Failure, Retry, Dead

- **Date/time**: 2026-09-23 00:26:00 PST
- **Configuration used**:
  - `FORCE_PDF_FAILURE`: true
  - `MAX_JOB_ATTEMPTS`: 3
  - `JOB_BACKOFF_BASE_MS`: 1000
- **Job ID**: `e648c6f5-9bc3-4386-a658-e57887393a34`
- **Max Attempts**: 3
- **Final Dead Status**: Confirmed. `status` is `dead`, `attempts` is 3, `finishedAt` is populated.

## Attempt Lifecycle & Delays

1. **Attempt 1**:
   - `status`: pending -> processing
   - Failed with `lastError`: "Forced PDF generation failure for testing."
   - Retrying in: `2150ms` (Base delay: 1000 * 2^1 = 2000ms + 150ms jitter)

2. **Attempt 2**:
   - `status`: failed -> pending -> processing
   - Failed with `lastError`: "Forced PDF generation failure for testing."
   - Retrying in: `4341ms` (Base delay: 1000 * 2^2 = 4000ms + 341ms jitter)

3. **Attempt 3**:
   - `status`: failed -> pending -> processing
   - Failed with `lastError`: "Forced PDF generation failure for testing."
   - Transitions to `dead` state because attempts reached `maxAttempts`.

**Delay observation**: The delays grew exponentially. Attempt 1 took ~2.1s, while Attempt 2 took ~4.3s, proving the `baseDelay * Math.pow(2, attempts) + jitter` logic works perfectly.

## Worker Continuation
The worker daemon continued polling the database uninterrupted after the job was marked `dead`. There were no crash stack traces.

## Log Evidence

```text
[Worker 5796] Claimed job: e648c6f5-9bc3-4386-a658-e57887393a34 | Attempt: 1/3 | Concurrency: 1/2
[Worker 5796] Error processing job e648c6f5-9bc3-4386-a658-e57887393a34: Forced PDF generation failure for testing.
[Worker 5796] Job e648c6f5-9bc3-4386-a658-e57887393a34 failed on attempt 1. Retrying in 2150ms at 2026-09-23T08:25:48.802Z
[Worker 5796] Claimed job: e648c6f5-9bc3-4386-a658-e57887393a34 | Attempt: 2/3 | Concurrency: 1/2
[Worker 5796] Error processing job e648c6f5-9bc3-4386-a658-e57887393a34: Forced PDF generation failure for testing.
[Worker 5796] Job e648c6f5-9bc3-4386-a658-e57887393a34 failed on attempt 2. Retrying in 4341ms at 2026-09-23T08:25:56.057Z
[Worker 5796] Claimed job: e648c6f5-9bc3-4386-a658-e57887393a34 | Attempt: 3/3 | Concurrency: 1/2
[Worker 5796] Error processing job e648c6f5-9bc3-4386-a658-e57887393a34: Forced PDF generation failure for testing.
[Worker 5796] Job e648c6f5-9bc3-4386-a658-e57887393a34 is DEAD after 3 attempts.
```
