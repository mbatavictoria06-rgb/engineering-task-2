import { prisma } from '../db';
import { config } from '../config';
import { Job } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

let isShuttingDown = false;
let currentConcurrentJobs = 0;

// Ensure storage directory exists
const storageDir = path.join(process.cwd(), 'storage', 'jobs');
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

function calculateBackoffDelay(attempts: number): number {
  const baseDelay = config.jobBackoffBaseMs;
  // exponential backoff: baseDelay * 2^attempts + random jitter
  const exponentialPart = baseDelay * Math.pow(2, attempts);
  const jitter = Math.floor(Math.random() * 500); // 0-500ms random jitter
  return exponentialPart + jitter;
}

async function processJobData(job: Job): Promise<void> {
  if (job.type !== 'pdf-generation') {
    throw new Error(`Unknown job type: ${job.type}`);
  }

  const outputPath = path.join(storageDir, `${job.id}.pdf`);

  // Idempotent Output Preparation
  if (fs.existsSync(outputPath)) {
    console.log(`[Worker ${process.pid}] PDF already exists for job ${job.id}. Skipping generation.`);
    return;
  }

  // Artificial processing delay (configurable)
  await new Promise(resolve => setTimeout(resolve, config.pdfProcessingDelayMs));

  // Testability hook
  if (config.forcePdfFailure) {
    throw new Error('Forced PDF generation failure for testing.');
  }

  // Generate the PDF
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const writeStream = fs.createWriteStream(outputPath);
      
      doc.pipe(writeStream);
      doc.fontSize(25).text(`PDF Report for Job: ${job.id}`, 100, 100);
      doc.fontSize(12).text(`Payload: ${JSON.stringify(job.payload)}`, 100, 150);
      doc.end();

      writeStream.on('finish', () => resolve(undefined));
      writeStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function claimNextJob(): Promise<Job | null> {
  const jobs = await prisma.$queryRaw<Job[]>`
    UPDATE "Job"
    SET status = 'processing'::"JobStatus",
        "startedAt" = timezone('utc', NOW()),
        attempts = attempts + 1
    WHERE id = (
      SELECT id
      FROM "Job"
      WHERE status::text = 'pending' AND "runAt" <= timezone('utc', NOW())
      ORDER BY "runAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
  `;
  return jobs.length > 0 ? jobs[0] : null;
}

async function processJob(job: Job) {
  currentConcurrentJobs++;
  const processId = process.pid;
  console.log(`[Worker ${processId}] Claimed job: ${job.id} | Attempt: ${job.attempts}/${job.maxAttempts} | Concurrency: ${currentConcurrentJobs}/${config.maxConcurrency}`);

  try {
    // 1. Do the actual processing
    await processJobData(job);
    
    // 2. Mark as succeeded
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'succeeded',
        finishedAt: new Date(),
        lastError: null,
      }
    });
    console.log(`[Worker ${processId}] Succeeded job: ${job.id}`);
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    console.error(`[Worker ${processId}] Error processing job ${job.id}:`, errorMessage);

    if (job.attempts < job.maxAttempts) {
      // Failed but can retry
      const delayMs = calculateBackoffDelay(job.attempts);
      const nextRunAt = new Date(Date.now() + delayMs);
      
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          lastError: errorMessage,
          runAt: nextRunAt,
        }
      });
      
      console.log(`[Worker ${processId}] Job ${job.id} failed on attempt ${job.attempts}. Retrying in ${delayMs}ms at ${nextRunAt.toISOString()}`);
    } else {
      // Exhausted retries -> Dead
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'dead',
          lastError: errorMessage,
          finishedAt: new Date(),
        }
      });
      console.log(`[Worker ${processId}] Job ${job.id} is DEAD after ${job.attempts} attempts.`);
    }
  } finally {
    currentConcurrentJobs--;
  }
}

async function requeueFailedJobs() {
  await prisma.$executeRaw`
    UPDATE "Job"
    SET status = 'pending'::"JobStatus"
    WHERE status::text = 'failed' AND "runAt" <= timezone('utc', NOW())
  `;
}

async function recoverStuckJobs() {
  const timeoutMs = config.jobProcessingTimeoutMs;
  const stuckCutoff = new Date(Date.now() - timeoutMs);

  const stuckJobs = await prisma.job.findMany({
    where: {
      status: 'processing',
      startedAt: {
        lt: stuckCutoff
      }
    }
  });

  for (const job of stuckJobs) {
    const errorMessage = 'Job processing timed out';
    console.log(`[Worker ${process.pid}] Detected stuck job ${job.id} (startedAt: ${job.startedAt}). Attempt: ${job.attempts}`);

    if (job.attempts < job.maxAttempts) {
      const delayMs = calculateBackoffDelay(job.attempts);
      const nextRunAt = new Date(Date.now() + delayMs);

      const res = await prisma.job.updateMany({
        where: { id: job.id, status: 'processing' },
        data: {
          status: 'pending',
          lastError: errorMessage,
          runAt: nextRunAt
        }
      });
      if (res.count > 0) {
        console.log(`[Worker ${process.pid}] Stuck job ${job.id} recovered (status -> pending). Retrying in ${delayMs}ms at ${nextRunAt.toISOString()}`);
      }
    } else {
      const res = await prisma.job.updateMany({
        where: { id: job.id, status: 'processing' },
        data: {
          status: 'dead',
          lastError: errorMessage,
          finishedAt: new Date()
        }
      });
      if (res.count > 0) {
        console.log(`[Worker ${process.pid}] Stuck job ${job.id} is DEAD (status -> dead) after ${job.attempts} attempts.`);
      }
    }
  }
}

async function poll() {
  if (isShuttingDown) return;

  if (currentConcurrentJobs >= config.maxConcurrency) {
    setTimeout(poll, config.workerPollInterval);
    return;
  }

  try {
    // Recover stuck jobs
    await recoverStuckJobs();

    // Requeue jobs whose retry delay has elapsed
    await requeueFailedJobs();

    const job = await claimNextJob();
    
    if (job) {
      processJob(job);
      setImmediate(poll);
    } else {
      setTimeout(poll, config.workerPollInterval);
    }
  } catch (error) {
    console.error('[Worker] Error polling jobs:', error);
    setTimeout(poll, config.workerPollInterval);
  }
}

async function gracefulShutdown() {
  console.log('\n[Worker] Graceful shutdown initiated...');
  isShuttingDown = true;
  
  while (currentConcurrentJobs > 0) {
    console.log(`[Worker] Waiting for ${currentConcurrentJobs} jobs to finish...`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('[Worker] Disconnecting from database...');
  await prisma.$disconnect();
  console.log('[Worker] Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

console.log(`[Worker ${process.pid}] Started. Max concurrency: ${config.maxConcurrency}`);
poll();
