import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

import { jobsRouter } from './routes/jobs';

// Basic health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'api' });
});

// API Routes
app.use('/api/jobs', jobsRouter);

// Admin Dead-Letter View
app.get('/admin/dead-letters', (req: Request, res: Response) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dead-Letter View</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 2rem; background: #f9fafb; color: #111827; }
        h1 { margin-bottom: 1rem; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #e5e7eb; }
        th { background: #f3f4f6; }
        .retry-btn { background: #2563eb; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
        .retry-btn:hover { background: #1d4ed8; }
      </style>
    </head>
    <body>
      <h1>Dead-Letter Jobs</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Payload</th>
            <th>Attempts</th>
            <th>Error</th>
            <th>Failed At</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="jobs-body">
          <tr><td colspan="7">Loading...</td></tr>
        </tbody>
      </table>

      <script>
        async function fetchJobs() {
          const res = await fetch('/api/jobs/status/dead');
          const jobs = await res.json();
          const tbody = document.getElementById('jobs-body');
          if (jobs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">No dead jobs.</td></tr>';
            return;
          }
          tbody.innerHTML = jobs.map(job => \`
            <tr>
              <td style="font-size: 12px; max-width: 100px; overflow: hidden; text-overflow: ellipsis;">\${job.id}</td>
              <td>\${job.type}</td>
              <td style="font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title='\${JSON.stringify(job.payload)}'>\${JSON.stringify(job.payload)}</td>
              <td>\${job.attempts}/\${job.maxAttempts}</td>
              <td style="color: red; max-width: 200px;">\${job.lastError || ''}</td>
              <td>\${new Date(job.finishedAt || job.runAt).toLocaleString()}</td>
              <td><button class="retry-btn" onclick="retryJob('\${job.id}')">Retry</button></td>
            </tr>
          \`).join('');
        }

        async function retryJob(id) {
          if (!confirm('Retry this job?')) return;
          const res = await fetch(\`/api/jobs/\${id}/retry\`, { method: 'POST' });
          if (res.ok) {
            alert('Job queued for retry!');
            fetchJobs();
          } else {
            const err = await res.json();
            alert('Error: ' + err.error);
          }
        }

        fetchJobs();
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

// Start the server
const startServer = () => {
  app.listen(port, () => {
    console.log(`API Server is running on port ${port}`);
  });
};

startServer();
