# Test 5: Two Workers Running Simultaneously

- **Test Name**: Concurrency & Atomic Claims Validation
- **Date/time**: 2026-09-23 00:44:00 PST
- **Number of jobs submitted**: 20
- **Worker 1 Identity**: `PID: 10940`
- **Worker 2 Identity**: `PID: 16712`

## Job Claim Statistics
- **Jobs claimed by Worker 1**: 12
- **Jobs claimed by Worker 2**: 8
- **Total unique jobs claimed**: 20
- **Total jobs completed**: 20
- **Overlapping/Duplicate jobs claimed**: **0**

## Findings
An analysis script cross-referenced every `Claimed job: <id>` regex match from `worker_5_1.log` against `worker_5_2.log`.
The intersection of both sets was strictly empty (`0`). This confirms that the Postgres `FOR UPDATE SKIP LOCKED` query acts as an atomic lock, completely preventing race conditions between concurrently polling instances.

Every single job successfully reached `succeeded` status without being double-processed.

## Log Excerpt

### Worker 1 (`PID: 10940`) First 10 Lines
```text
[Worker 10940] Started. Max concurrency: 2
[Worker 10940] Claimed job: fc935111-6c45-449b-aa16-aaebedca20d6 | Attempt: 1/3 | Concurrency: 1/2
[Worker 10940] Claimed job: 3709acb4-bbe7-481e-90ed-ec9a4e95d008 | Attempt: 1/3 | Concurrency: 2/2
[Worker 10940] Succeeded job: fc935111-6c45-449b-aa16-aaebedca20d6
[Worker 10940] Succeeded job: 3709acb4-bbe7-481e-90ed-ec9a4e95d008
[Worker 10940] Claimed job: a21ca729-7130-4f5a-85ad-80835e0717b5 | Attempt: 1/3 | Concurrency: 1/2
[Worker 10940] Claimed job: f8d01f06-3991-4f2d-beb8-0f5e6d667203 | Attempt: 1/3 | Concurrency: 2/2
[Worker 10940] Succeeded job: a21ca729-7130-4f5a-85ad-80835e0717b5
[Worker 10940] Succeeded job: f8d01f06-3991-4f2d-beb8-0f5e6d667203
```

### Worker 2 (`PID: 16712`) First 10 Lines
```text
[Worker 16712] Started. Max concurrency: 2
[Worker 16712] Claimed job: 10338560-02db-40d2-b10a-a47981deeb48 | Attempt: 1/3 | Concurrency: 1/2
[Worker 16712] Claimed job: 6b259710-5427-49a3-92c8-0c204c5f383c | Attempt: 1/3 | Concurrency: 2/2
[Worker 16712] Succeeded job: 10338560-02db-40d2-b10a-a47981deeb48
[Worker 16712] Succeeded job: 6b259710-5427-49a3-92c8-0c204c5f383c
[Worker 16712] Claimed job: 8d538fdf-afdc-4521-a8a3-7d22d00f0d3c | Attempt: 1/3 | Concurrency: 1/2
[Worker 16712] Claimed job: 7b4a4bc6-7bc7-469d-9ef0-938ce42f7cc0 | Attempt: 1/3 | Concurrency: 2/2
[Worker 16712] Succeeded job: 8d538fdf-afdc-4521-a8a3-7d22d00f0d3c
[Worker 16712] Succeeded job: 7b4a4bc6-7bc7-469d-9ef0-938ce42f7cc0
```

## Conclusion
The atomic claim methodology natively implemented via Postgres `FOR UPDATE SKIP LOCKED` successfully handles multiple competing workers without yielding duplicate jobs, achieving faultless distributed queue execution.
