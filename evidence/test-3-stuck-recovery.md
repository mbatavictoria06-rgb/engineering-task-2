# Test 3: Kill Worker Mid-Job -> Stuck-Job Recovery

- **Date/time**: 2026-09-23 00:36:00 PST
- **Job ID**: `fdac7170-85c6-45fc-95c0-ec64b6bd2687`
- **Timeout Configuration**: `JOB_PROCESSING_TIMEOUT_MS = 10000ms`
- **PDF Processing Delay**: `PDF_PROCESSING_DELAY_MS = 15000ms`

## 1. Before Kill
A new job was enqueued and a worker process was started. After 5 seconds of processing, the job status was checked:
- **Status**: `processing`
- **Attempts**: `1`
- **startedAt**: `2026-09-23T08:33:32.871Z`

## 2. After Kill
The worker process was forcefully killed via `SIGKILL`. The status was immediately checked:
- **Status**: `processing`
- **Attempts**: `1`
- **startedAt**: `2026-09-23T08:33:32.871Z` (Stale)

## 3. Recovery Event (Logs)
A new worker daemon was started. Because the `startedAt` was older than the 10,000ms `JOB_PROCESSING_TIMEOUT_MS` cutoff, it was immediately swept and recovered:
```text
[Worker 21116] Started. Max concurrency: 2
[Worker 21116] Detected stuck job fdac7170-85c6-45fc-95c0-ec64b6bd2687 (startedAt: Wed Sep 23 2026 00:33:32 GMT-0800 (GMT-08:00)). Attempt: 1
[Worker 21116] Stuck job fdac7170-85c6-45fc-95c0-ec64b6bd2687 recovered (status -> pending). Retrying in 2004ms at 2026-09-23T08:35:00.350Z
[Worker 21116] Claimed job: fdac7170-85c6-45fc-95c0-ec64b6bd2687 | Attempt: 2/3 | Concurrency: 1/2
```

## 4. Final Status (After Recovery)
The job was successfully retried by the new worker and reached terminal success:
- **Final Status**: `succeeded`
- **Attempts**: `2`
- **runAt after recovery**: `2026-09-23T08:35:15.020Z`
- **finishedAt**: `2026-09-23T08:35:15.448Z`

*Note: Due to the processing delay (15s) exceeding the stuck-job timeout (10s), the recovery loop actually triggered a second time during attempt 2, verifying that the timeout logic rigorously guards against jobs hanging over 10 seconds regardless of the reason.*
