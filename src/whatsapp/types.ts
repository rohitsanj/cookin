export interface InboundMessage {
  from: string;
  text: string;
  timestamp: string;
  messageId: string;
}

// Twilio sends form-urlencoded POST data with these fields
export interface TwilioWebhookBody {
  MessageSid: string;
  AccountSid: string;
  From: string;        // e.g. "whatsapp:+1234567890"
  To: string;          // e.g. "whatsapp:+14155238886"
  Body: string;
  NumMedia: string;
  ProfileName?: string;
}

export function extractMessage(body: TwilioWebhookBody): InboundMessage | null {
  if (!body.Body || !body.From) return null;

  // Strip the "whatsapp:" prefix from the phone number
  const from = body.From.replace('whatsapp:', '');

  return {
    from,
    text: body.Body,
    timestamp: new Date().toISOString(),
    messageId: body.MessageSid,
  };
}
