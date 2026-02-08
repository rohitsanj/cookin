import 'dotenv/config'

import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { getDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { webhookRouter } from './sender/webhook.js';
import { apiRouter } from './api/router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function main() {
  // 1. Initialize database + run migrations
  const db = getDb();
  runMigrations(db);
  console.log('Database initialized');

  // 2. Create Express app
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // 3. Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 4. Web API routes
  app.use('/api', apiRouter);

  // 5. Landing page
  app.use('/', webhookRouter);

  // 6. Serve React frontend in production
  const webDir = path.join(__dirname, '..', 'web-dist');
  app.use(express.static(webDir));
  app.get('*', (_req, res, next) => {
    if (_req.path.startsWith('/api') || _req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(webDir, 'index.html'));
  });

  // 7. Listen
  app.listen(config.port, () => {
    console.log(`Cookin server running on port ${config.port}`);
  });
}

main();
