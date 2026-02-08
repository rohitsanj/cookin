import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

export const webhookRouter = Router();

let landingHtml: string | null = null;

webhookRouter.get('/', (_req, res) => {
  if (!landingHtml) {
    landingHtml = fs.readFileSync(path.join('static', 'index.html'), 'utf-8');
  }
  const html = landingHtml.replace(/\{\{GOOGLE_CLIENT_ID\}\}/g, config.google.clientId);
  res.type('html').send(html);
});
