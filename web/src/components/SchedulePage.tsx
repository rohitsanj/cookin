import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import type { UserPreferences } from '../types';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  const newH = (h + hours + 24) % 24;
  return `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

interface ScheduleEvent {
  time: string;
  label: string;
  description: string;
  type: 'grocery' | 'cook' | 'checkin';
}

function buildSchedule(prefs: UserPreferences): Map<string, ScheduleEvent[]> {
  const schedule = new Map<string, ScheduleEvent[]>();

  for (const day of prefs.cook_days) {
    const events = schedule.get(day) || [];
    events.push({
      time: prefs.cook_reminder_time,
      label: 'Cook Reminder',
      description: 'Get tonight\'s recipe and ingredients list',
      type: 'cook',
    });
    events.push({
      time: addHours(prefs.cook_reminder_time, 2),
      label: 'Post-Cook Check-in',
      description: 'Rate the meal and share feedback',
      type: 'checkin',
    });
    schedule.set(day, events);
  }

  return schedule;
}

const typeStyles: Record<string, { bg: string; dot: string }> = {
  grocery: { bg: 'bg-blue-500/10', dot: 'bg-blue-400' },
  cook: { bg: 'bg-accent-soft', dot: 'bg-accent' },
  checkin: { bg: 'bg-success/10', dot: 'bg-success' },
};

export function SchedulePage() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarScopes, setCalendarScopes] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [gsiLoaded, setGsiLoaded] = useState(!!window.google);

  useEffect(() => {
    Promise.all([
      api.preferences.get().then(({ preferences }) => setPrefs(preferences)),
      api.calendar.status().then(({ connected, scopes }) => {
        setCalendarConnected(connected);
        setCalendarScopes(scopes);
      }),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load Google Identity Services library
  useEffect(() => {
    if (calendarConnected) return;
    if (window.google) {
      setGsiLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => setGsiLoaded(true);
    script.onerror = () => {
      if (window.google) setGsiLoaded(true);
    };
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, [calendarConnected]);

  const connectCalendar = useCallback(() => {
    if (!window.google || !gsiLoaded) return;

    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: __GOOGLE_CLIENT_ID__,
      scope: calendarScopes.join(' '),
      callback: async (response: { code?: string; error?: string }) => {
        if (response.error || !response.code) {
          setSyncMessage('Failed to connect Google Calendar.');
          return;
        }
        try {
          await api.calendar.connect(response.code);
          setCalendarConnected(true);
          setSyncMessage('Google Calendar connected!');
        } catch {
          setSyncMessage('Failed to connect Google Calendar.');
        }
      },
    });

    client.requestCode();
  }, [gsiLoaded, calendarScopes]);

  const syncCalendar = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.calendar.sync();
      setSyncMessage(`Synced ${result.created} event${result.created !== 1 ? 's' : ''} to Google Calendar.`);
    } catch (err: any) {
      setSyncMessage(err.message || 'Failed to sync calendar.');
    } finally {
      setSyncing(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        Loading schedule...
      </div>
    );
  }

  if (!prefs || (prefs.cook_days.length === 0 && !prefs.grocery_day)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-3xl mb-3">📅</p>
        <h2 className="text-lg font-medium mb-2">No schedule set up yet</h2>
        <p className="text-muted text-sm max-w-sm">
          Set your cook days and grocery day in Preferences to see your weekly schedule here.
        </p>
      </div>
    );
  }

  const schedule = buildSchedule(prefs);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-medium mb-1">Weekly Schedule</h2>
            <p className="text-sm text-muted">
              Your cooking and grocery schedule ({prefs.timezone})
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {calendarConnected ? (
              <button
                onClick={syncCalendar}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-black text-sm font-medium rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path d="M12 6v6l4 2" />
                </svg>
                {syncing ? 'Syncing...' : 'Sync to Calendar'}
              </button>
            ) : (
              <button
                onClick={connectCalendar}
                disabled={!gsiLoaded}
                className="flex items-center gap-2 px-4 py-2 bg-white text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors border border-gray-300"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Connect Google Calendar
              </button>
            )}
          </div>
        </div>

        {syncMessage && (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-card border border-border text-sm">
            {syncMessage}
          </div>
        )}

        <div className="space-y-3">
          {DAY_ORDER.map(day => {
            const events = schedule.get(day);
            if (!events || events.length === 0) {
              return (
                <div key={day} className="flex items-center gap-4 py-3 px-4 rounded-xl">
                  <span className="text-sm font-medium text-muted w-24 shrink-0">{day}</span>
                  <span className="text-xs text-muted/50">No events</span>
                </div>
              );
            }

            return (
              <div key={day} className="bg-card rounded-xl border border-border p-4">
                <h3 className="text-sm font-medium text-accent mb-3">{day}</h3>
                <div className="space-y-2.5">
                  {events
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map((event, i) => {
                      const style = typeStyles[event.type];
                      return (
                        <div key={i} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${style.bg}`}>
                          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${style.dot}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{event.label}</span>
                              <span className="text-xs text-muted">{formatTime(event.time)}</span>
                            </div>
                            <p className="text-xs text-muted mt-0.5">{event.description}</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
