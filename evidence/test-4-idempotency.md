# Test 4: Duplicate Idempotency Key

- **Test Name**: Duplicate Idempotency Key Verification
- **Date/time**: 2026-09-23 00:40:00 PST
- **Idempotency Key used**: `test-4-duplicate-key-1790152835585`

## 1. First Request
A new job was submitted with the fresh idempotency key.
- **HTTP Status**: `202 Accepted`
- **Job ID**: `8d041428-29a2-4ff6-b77a-1d5b9359341a`

## 2. Second Request
An identical request with the exact same idempotency key was submitted immediately after.
- **HTTP Status**: `200 OK` (Indicates the API safely intercepted the unique constraint violation and returned the existing job rather than returning a 500 error or a new 202).
- **Job ID**: `8d041428-29a2-4ff6-b77a-1d5b9359341a`

## 3. Database Verification
The Prisma database was queried directly for all jobs matching the `idempotencyKey`: `test-4-duplicate-key-1790152835585`.
- **Database Count**: Exactly `1` row found.
- **Database Job ID**: `8d041428-29a2-4ff6-b77a-1d5b9359341a`

## 4. Final Job Status
The single instantiated job was correctly picked up by the worker process and successfully processed.
- **Final Status**: `succeeded`

## Conclusion
The API completely respects the idempotency contract. A duplicate request does not crash the server and does not result in duplicate database entries. Instead, it securely identifies the existing pending job and returns its ID, ensuring at-most-once execution for identical workloads.
