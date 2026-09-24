import { Router, Request, Response } from 'express';
import { prisma } from '../../db';
import { config } from '../../config';

export const jobsRouter = Router();

jobsRouter.post('/', async (req: Request, res: Response) => {
  const { type, payload, idempotencyKey } = req.body;

  if (typeof type !== 'string' || type.trim() === '') {
    res.status(400).json({ error: 'type must be a non-empty string' });
    return;
  }
  
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    res.status(400).json({ error: 'payload must be a valid JSON object' });
    return;
  }
  
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
    res.status(400).json({ error: 'idempotencyKey must be a non-empty string' });
    return;
  }

  try {
    const job = await prisma.job.create({
      data: {
        type,
        payload,
        idempotencyKey,
        status: 'pending',
        attempts: 0,
        maxAttempts: config.maxJobAttempts,
        runAt: new Date(),
      }
    });

    res.status(202).json({
      id: job.id,
      status: job.status,
      idempotencyKey: job.idempotencyKey
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      // Unique constraint violation means job with this idempotencyKey exists
      const existingJob = await prisma.job.findUnique({
        where: { idempotencyKey }
      });
      
      if (existingJob) {
        res.status(200).json({
          id: existingJob.id,
          status: existingJob.status,
          idempotencyKey: existingJob.idempotencyKey
        });
        return;
      }
    }
    
    console.error('Error enqueuing job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/jobs/status/dead
jobsRouter.get('/status/dead', async (req: Request, res: Response) => {
  try {
    const deadJobs = await prisma.job.findMany({
      where: { status: 'dead' },
      orderBy: { runAt: 'desc' }
    });
    res.status(200).json(deadJobs);
  } catch (error) {
    console.error('Error fetching dead jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/jobs/:id/retry
jobsRouter.post('/:id/retry', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    if (job.status !== 'dead') {
      res.status(400).json({ error: 'Only dead jobs can be retried' });
      return;
    }

    const retriedJob = await prisma.job.update({
      where: { id },
      data: {
        status: 'pending',
        attempts: 0,
        lastError: null,
        runAt: new Date(),
        startedAt: null,
        finishedAt: null
      }
    });

    res.status(200).json(retriedJob);
  } catch (error) {
    console.error(`Error retrying job ${id}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/jobs/:id
jobsRouter.get('/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const job = await prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        lastError: true,
        runAt: true,
        startedAt: true,
        finishedAt: true
      }
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.status(200).json(job);
  } catch (error) {
    console.error(`Error fetching job ${id}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
