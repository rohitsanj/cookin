import { config } from '../config.js';
import { canSendMessage, logMessage } from '../services/message-throttle.js';

const MAX_MESSAGE_LENGTH = 1600; // Twilio WhatsApp limit per segment

function getBaseUrl(): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`;
}

function getAuthHeader(): string {
  const credentials = Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64');
  return `Basic ${credentials}`;
}

async function sendRaw(to: string, body: string): Promise<boolean> {
  const params = new URLSearchParams({
    From: config.twilio.whatsappNumber,
    To: `whatsapp:${to}`,
    Body: body,
  });

  const response = await fetch(getBaseUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': getAuthHeader(),
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`Twilio send error: ${err}`);
    return false;
  }

  return true;
}

export async function sendTextMessage(to: string, text: string, skipThrottle = false): Promise<boolean> {
  if (!skipThrottle && !canSendMessage(to)) {
    console.log(`Message throttled for ${to}`);
    return false;
  }

  const chunks = splitMessage(text);

  for (const chunk of chunks) {
    const ok = await sendRaw(to, chunk);
    if (!ok) return false;
    logMessage(to, 'outbound', chunk);
  }

  return true;
}

function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > MAX_MESSAGE_LENGTH) {
    let splitAt = remaining.lastIndexOf('\n\n', MAX_MESSAGE_LENGTH);
    if (splitAt === -1 || splitAt < MAX_MESSAGE_LENGTH / 2) {
      splitAt = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    }
    if (splitAt === -1 || splitAt < MAX_MESSAGE_LENGTH / 2) {
      splitAt = MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
