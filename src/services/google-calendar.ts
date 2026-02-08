import { google } from 'googleapis';
import { config } from '../config.js';
import { getDb } from '../db/connection.js';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    'postmessage' // For authorization code flow via popup
  );
}

/**
 * Exchange an authorization code for access + refresh tokens, store them.
 */
export async function exchangeCodeForTokens(webUserId: string, code: string) {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  getDb().prepare(`
    UPDATE web_user
    SET google_access_token = ?,
        google_refresh_token = COALESCE(?, google_refresh_token),
        google_token_expiry = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    tokens.access_token,
    tokens.refresh_token,
    tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    webUserId
  );

  return tokens;
}

/**
 * Get an authenticated OAuth2 client for a user.
 */
function getAuthenticatedClient(webUserId: string) {
  const row = getDb().prepare(
    'SELECT google_access_token, google_refresh_token, google_token_expiry FROM web_user WHERE id = ?'
  ).get(webUserId) as { google_access_token: string | null; google_refresh_token: string | null; google_token_expiry: string | null } | undefined;

  if (!row?.google_access_token) {
    return null;
  }

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: row.google_access_token,
    refresh_token: row.google_refresh_token || undefined,
    expiry_date: row.google_token_expiry ? new Date(row.google_token_expiry).getTime() : undefined,
  });

  // Listen for token refresh so we persist new tokens
  oauth2.on('tokens', (tokens) => {
    const updates: string[] = [];
    const params: (string | null)[] = [];

    if (tokens.access_token) {
      updates.push('google_access_token = ?');
      params.push(tokens.access_token);
    }
    if (tokens.refresh_token) {
      updates.push('google_refresh_token = ?');
      params.push(tokens.refresh_token);
    }
    if (tokens.expiry_date) {
      updates.push('google_token_expiry = ?');
      params.push(new Date(tokens.expiry_date).toISOString());
    }

    if (updates.length > 0) {
      params.push(webUserId);
      getDb().prepare(`UPDATE web_user SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
    }
  });

  return oauth2;
}

const DAY_TO_RRULE: Record<string, string> = {
  Monday: 'MO', Tuesday: 'TU', Wednesday: 'WE', Thursday: 'TH',
  Friday: 'FR', Saturday: 'SA', Sunday: 'SU',
};

/**
 * Sync the user's cooking schedule to Google Calendar.
 * Creates recurring weekly events for cook days, grocery day, etc.
 */
export async function syncScheduleToCalendar(
  webUserId: string,
  schedule: {
    cookDays: string[];
    cookReminderTime: string;
    groceryDay: string | null;
    groceryTime?: string;
    timezone: string;
  }
): Promise<{ created: number }> {
  const oauth2 = getAuthenticatedClient(webUserId);
  if (!oauth2) {
    throw new Error('Google Calendar not connected. Please connect your Google account first.');
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2 });

  // Find or create the "Cookin'" calendar
  const calendarId = await getOrCreateCookinCalendar(calendar);

  // Clear old Cookin' events
  await clearCookinEvents(calendar, calendarId);

  let created = 0;

  // Create cook reminder events
  for (const day of schedule.cookDays) {
    const rruleDay = DAY_TO_RRULE[day];
    if (!rruleDay) continue;

    const startDate = getNextDayDate(day);
    const [h, m] = schedule.cookReminderTime.split(':').map(Number);

    await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: 'Cook Dinner',
        description: 'Time to cook! Check Cookin\' for tonight\'s recipe.',
        start: {
          dateTime: `${startDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`,
          timeZone: schedule.timezone,
        },
        end: {
          dateTime: `${startDate}T${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`,
          timeZone: schedule.timezone,
        },
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${rruleDay}`],
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 30 }],
        },
        colorId: '6', // tangerine
      },
    });
    created++;
  }

  // Create grocery day event
  if (schedule.groceryDay) {
    const rruleDay = DAY_TO_RRULE[schedule.groceryDay];
    if (rruleDay) {
      const startDate = getNextDayDate(schedule.groceryDay);
      const groceryTime = schedule.groceryTime || '09:00';
      const [h, m] = groceryTime.split(':').map(Number);

      await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: 'Grocery Shopping',
          description: 'Check Cookin\' for your grocery list.',
          start: {
            dateTime: `${startDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`,
            timeZone: schedule.timezone,
          },
          end: {
            dateTime: `${startDate}T${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`,
            timeZone: schedule.timezone,
          },
          recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${rruleDay}`],
          reminders: {
            useDefault: false,
            overrides: [{ method: 'popup', minutes: 60 }],
          },
          colorId: '9', // blueberry
        },
      });
      created++;
    }
  }

  return { created };
}

async function getOrCreateCookinCalendar(calendar: ReturnType<typeof google.calendar>): Promise<string> {
  // List existing calendars
  const list = await calendar.calendarList.list();
  const existing = list.data.items?.find(c => c.summary === "Cookin'");
  if (existing?.id) return existing.id;

  // Create new calendar
  const created = await calendar.calendars.insert({
    requestBody: {
      summary: "Cookin'",
      description: 'Meal planning and cooking schedule',
      timeZone: 'America/Los_Angeles',
    },
  });

  return created.data.id!;
}

async function clearCookinEvents(calendar: ReturnType<typeof google.calendar>, calendarId: string) {
  try {
    const events = await calendar.events.list({
      calendarId,
      maxResults: 100,
    });

    for (const event of events.data.items || []) {
      if (event.id) {
        await calendar.events.delete({ calendarId, eventId: event.id });
      }
    }
  } catch {
    // Calendar might be empty or inaccessible, that's fine
  }
}

function getNextDayDate(dayName: string): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const targetDay = days.indexOf(dayName);
  const now = new Date();
  const currentDay = now.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  return next.toISOString().split('T')[0];
}

export function hasCalendarTokens(webUserId: string): boolean {
  const row = getDb().prepare(
    'SELECT google_access_token FROM web_user WHERE id = ?'
  ).get(webUserId) as { google_access_token: string | null } | undefined;
  return !!row?.google_access_token;
}

export { SCOPES };
