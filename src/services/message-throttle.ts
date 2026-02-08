import { getDb } from '../db/connection.js';
import { getOrCreateUser } from './user.js';

export function canSendMessage(phoneNumber: string): boolean {
  const user = getOrCreateUser(phoneNumber);
  const today = new Date().toISOString().split('T')[0];
  const row = getDb().prepare(
    `SELECT COUNT(*) as cnt FROM message_log
     WHERE user_phone = ? AND direction = 'outbound' AND sent_at >= ?`
  ).get(phoneNumber, today + 'T00:00:00') as { cnt: number };
  return row.cnt < user.max_messages_per_day;
}

export function logMessage(phoneNumber: string, direction: 'inbound' | 'outbound', content: string): void {
  getDb().prepare(
    'INSERT INTO message_log (user_phone, direction, content) VALUES (?, ?, ?)'
  ).run(phoneNumber, direction, content);
}

export function getRecentMessages(phoneNumber: string, limit: number): Array<{ role: 'user' | 'assistant'; content: string }> {
  const rows = getDb().prepare(
    `SELECT direction, content FROM message_log
     WHERE user_phone = ? ORDER BY sent_at DESC LIMIT ?`
  ).all(phoneNumber, limit) as Array<{ direction: string; content: string }>;

  return rows.reverse().map(row => ({
    role: row.direction === 'inbound' ? 'user' as const : 'assistant' as const,
    content: row.content,
  }));
}
