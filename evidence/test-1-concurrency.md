# Test 1: 50 Jobs + Concurrency Cap

- **Date/time**: 2026-09-23 00:20:00 PST
- **Configuration used**:
  - `MAX_CONCURRENCY`: 2
  - `FORCE_PDF_FAILURE`: false
  - `PDF_PROCESSING_DELAY_MS`: 2000
- **Number of jobs submitted**: 50
- **Expected concurrency**: 2
- **Maximum observed concurrency**: 2
- **Result**: PASS

## Summary
The API correctly processed the enqueue payload 50 times in rapid succession, resulting in 50 distinct pending jobs. A single worker daemon was started and correctly restricted itself to processing a maximum of 2 jobs concurrently at any given time.

A check across the entire `worker_50.log` file for `Concurrency: 3/2` yielded no results, confirming the cap was never breached. The final output verified that exactly 50 "Succeeded job" events were logged.

## Log Excerpt (First 10 lines)

```text
[Worker 24096] Started. Max concurrency: 2
[Worker 24096] Claimed job: 555b5c53-3177-498d-9760-0bb1d071802d | Attempt: 1/3 | Concurrency: 1/2
[Worker 24096] Claimed job: 3d9b325a-85f9-46d7-bb2b-39a9b148b777 | Attempt: 1/3 | Concurrency: 2/2
[Worker 24096] Succeeded job: 555b5c53-3177-498d-9760-0bb1d071802d
[Worker 24096] Succeeded job: 3d9b325a-85f9-46d7-bb2b-39a9b148b777
[Worker 24096] Claimed job: b2fffcc4-0c8b-471c-ae4a-8bec17e8c334 | Attempt: 1/3 | Concurrency: 1/2
[Worker 24096] Claimed job: 48158448-171c-4a0f-9869-d8bbb2de5ee9 | Attempt: 1/3 | Concurrency: 2/2
[Worker 24096] Succeeded job: b2fffcc4-0c8b-471c-ae4a-8bec17e8c334
[Worker 24096] Succeeded job: 48158448-171c-4a0f-9869-d8bbb2de5ee9
```
