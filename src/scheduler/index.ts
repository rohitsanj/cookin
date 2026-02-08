import cron from 'node-cron';
import type { User } from '../services/user.js';
import { getAllOnboardedUsers } from '../services/user.js';
import { triggerInventoryConfirmation, triggerCookReminder, triggerPostCookCheckin } from './jobs.js';

const DAY_MAP: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

// Map of user_phone -> Map of job_name -> ScheduledTask
const activeJobs = new Map<string, Map<string, cron.ScheduledTask>>();

function toCronExpression(dayName: string, time: string): string {
  const dayNum = DAY_MAP[dayName];
  if (dayNum === undefined) {
    console.warn(`Unknown day: ${dayName}, defaulting to Saturday`);
    return `0 9 * * 6`;
  }
  const [hours, minutes] = time.split(':').map(Number);
  return `${minutes} ${hours} * * ${dayNum}`;
}

function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  const newH = (h + hours + 24) % 24;
  return `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function scheduleUserJobs(user: User): void {
  // Cancel existing jobs for this user
  cancelUserJobs(user.phone_number);

  const userJobs = new Map<string, cron.ScheduledTask>();

  if (!user.grocery_day) {
    console.warn(`No grocery day set for ${user.phone_number}, skipping scheduling`);
    return;
  }

  // Inventory confirmation: grocery day at grocery_time
  userJobs.set('inventory_confirm', cron.schedule(
    toCronExpression(user.grocery_day, user.grocery_time),
    () => {
      triggerInventoryConfirmation(user.phone_number).catch(err =>
        console.error(`Inventory confirmation error for ${user.phone_number}:`, err)
      );
    },
    { timezone: user.timezone }
  ));

  // Cook reminders: each cook day at cook_reminder_time
  for (const day of user.cook_days) {
    userJobs.set(`cook_reminder_${day}`, cron.schedule(
      toCronExpression(day, user.cook_reminder_time),
      () => {
        triggerCookReminder(user.phone_number, day).catch(err =>
          console.error(`Cook reminder error for ${user.phone_number}:`, err)
        );
      },
      { timezone: user.timezone }
    ));

    // Post-cook check-in: 2 hours after cook reminder
    const checkinTime = addHours(user.cook_reminder_time, 2);
    userJobs.set(`post_cook_${day}`, cron.schedule(
      toCronExpression(day, checkinTime),
      () => {
        triggerPostCookCheckin(user.phone_number).catch(err =>
          console.error(`Post-cook check-in error for ${user.phone_number}:`, err)
        );
      },
      { timezone: user.timezone }
    ));
  }

  activeJobs.set(user.phone_number, userJobs);
  console.log(`Scheduled ${userJobs.size} jobs for ${user.phone_number}`);
}

function cancelUserJobs(phoneNumber: string): void {
  const jobs = activeJobs.get(phoneNumber);
  if (jobs) {
    for (const [, task] of jobs) {
      task.stop();
    }
    activeJobs.delete(phoneNumber);
  }
}

export function bootScheduler(): void {
  const users = getAllOnboardedUsers();
  console.log(`Booting scheduler for ${users.length} onboarded user(s)`);
  for (const user of users) {
    scheduleUserJobs(user);
  }
}
