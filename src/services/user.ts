import { getDb } from '../db/connection.js';
import { ConversationState } from '../conversation/state.js';

export interface User {
  phone_number: string;
  name: string | null;
  cuisine_preferences: string[];
  dietary_restrictions: string[];
  household_size: number;
  skill_level: 'beginner' | 'intermediate' | 'advanced';
  cook_days: string[];
  grocery_day: string | null;
  grocery_time: string;
  cook_reminder_time: string;
  timezone: string;
  max_messages_per_day: number;
  conversation_state: ConversationState;
  state_context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface UserRow {
  phone_number: string;
  name: string | null;
  cuisine_preferences: string;
  dietary_restrictions: string;
  household_size: number;
  skill_level: string;
  cook_days: string;
  grocery_day: string | null;
  grocery_time: string;
  cook_reminder_time: string;
  timezone: string;
  max_messages_per_day: number;
  conversation_state: string;
  state_context: string;
  created_at: string;
  updated_at: string;
}

function deserialize(row: UserRow): User {
  return {
    ...row,
    cuisine_preferences: JSON.parse(row.cuisine_preferences),
    dietary_restrictions: JSON.parse(row.dietary_restrictions),
    cook_days: JSON.parse(row.cook_days),
    skill_level: row.skill_level as User['skill_level'],
    conversation_state: row.conversation_state as ConversationState,
    state_context: JSON.parse(row.state_context),
  };
}

export function getOrCreateUser(phoneNumber: string): User {
  const db = getDb();
  let row = db.prepare('SELECT * FROM user WHERE phone_number = ?').get(phoneNumber) as UserRow | undefined;
  if (!row) {
    db.prepare('INSERT INTO user (phone_number) VALUES (?)').run(phoneNumber);
    row = db.prepare('SELECT * FROM user WHERE phone_number = ?').get(phoneNumber) as UserRow;
  }
  return deserialize(row);
}

export function getUser(phoneNumber: string): User | null {
  const row = getDb().prepare('SELECT * FROM user WHERE phone_number = ?').get(phoneNumber) as UserRow | undefined;
  return row ? deserialize(row) : null;
}

export function getAllOnboardedUsers(): User[] {
  const rows = getDb().prepare(
    "SELECT * FROM user WHERE conversation_state NOT LIKE 'onboarding_%' AND conversation_state != 'new'"
  ).all() as UserRow[];
  return rows.map(deserialize);
}

export function updateUser(phoneNumber: string, fields: Partial<Pick<User,
  'name' | 'cuisine_preferences' | 'dietary_restrictions' | 'household_size' |
  'skill_level' | 'cook_days' | 'grocery_day' | 'grocery_time' |
  'cook_reminder_time' | 'timezone' | 'max_messages_per_day'
>>): void {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    if (Array.isArray(value)) {
      values.push(JSON.stringify(value));
    } else {
      values.push(value);
    }
  }

  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  values.push(phoneNumber);

  db.prepare(`UPDATE user SET ${sets.join(', ')} WHERE phone_number = ?`).run(...values);
}

export function setConversationState(
  phoneNumber: string,
  state: ConversationState,
  context?: Record<string, unknown>
): void {
  getDb().prepare(
    "UPDATE user SET conversation_state = ?, state_context = ?, updated_at = datetime('now') WHERE phone_number = ?"
  ).run(state, JSON.stringify(context ?? {}), phoneNumber);
}
