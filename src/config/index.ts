import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL,
  nodeEnv: process.env.NODE_ENV || 'development',
  maxJobAttempts: parseInt(process.env.MAX_JOB_ATTEMPTS || '3', 10),
  maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '2', 10),
  workerPollInterval: parseInt(process.env.WORKER_POLL_INTERVAL || '1000', 10),
  jobBackoffBaseMs: parseInt(process.env.JOB_BACKOFF_BASE_MS || '1000', 10),
  pdfProcessingDelayMs: parseInt(process.env.PDF_PROCESSING_DELAY_MS || '2000', 10),
  forcePdfFailure: process.env.FORCE_PDF_FAILURE === 'true',
  jobProcessingTimeoutMs: parseInt(process.env.JOB_PROCESSING_TIMEOUT_MS || '10000', 10),
};
