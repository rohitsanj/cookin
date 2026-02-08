import { Router } from 'express';
import express from 'express';
import { extractMessage, type TwilioWebhookBody } from './types.js';
import { handleInbound } from '../conversation/handler.js';

export const webhookRouter = Router();

// Twilio sends form-urlencoded data
webhookRouter.use(express.urlencoded({ extended: false }));

const processedMessages = new Set<string>();

webhookRouter.get('/', (_req, res) => {
  res.sendFile('index.html', { root: 'static' });
});

webhookRouter.post('/webhook', (req, res) => {
  const body = req.body as TwilioWebhookBody;
  const message = extractMessage(body);

  // Respond with empty TwiML so Twilio doesn't send an auto-reply
  res.type('text/xml').send('<Response></Response>');

  if (!message) return;

  // Deduplicate
  if (processedMessages.has(message.messageId)) return;
  processedMessages.add(message.messageId);
  if (processedMessages.size > 1000) {
    const first = processedMessages.values().next().value;
    if (first) processedMessages.delete(first);
  }

  handleInbound(message.from, message.text).catch(err => {
    console.error(`Error handling message from ${message.from}:`, err);
  });
});
