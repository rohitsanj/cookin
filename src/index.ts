import 'dotenv/config';
import express from 'express';
import { config } from './config.js';
import { getDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { webhookRouter } from './whatsapp/webhook.js';
import { bootScheduler } from './scheduler/index.js';

function main() {
  // 1. Initialize database + run migrations
  const db = getDb();
  runMigrations(db);
  console.log('Database initialized');

  // 2. Create Express app
  const app = express();
  app.use(express.json());

  // 3. Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 4. WhatsApp webhook routes
  app.use('/', webhookRouter);

  // 5. Start scheduler
  bootScheduler();

  // 6. Listen
  app.listen(config.port, () => {
    console.log(`Cookin server running on port ${config.port}`);
  });
}

main();
