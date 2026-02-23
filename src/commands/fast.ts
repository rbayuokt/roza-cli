import { cancel, confirm, intro, isCancel, outro } from '@clack/prompts';
import type { Command } from 'commander';
import pc from 'picocolors';

import { fetchHijriByDate } from '../lib/api.js';
import { getAttendance, setAttendance } from '../lib/store.js';
import { getConfig } from '../lib/store.js';

const formatDateKey = (date: Date, timezone?: string): string => {
  if (timezone) {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const parts = formatter.formatToParts(date);
      const year = parts.find((part) => part.type === 'year')?.value;
      const month = parts.find((part) => part.type === 'month')?.value;
      const day = parts.find((part) => part.type === 'day')?.value;
      if (year && month && day) {
        return `${year}-${month}-${day}`;
      }
    } catch {
      // fallback below
    }
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isRamadanDate = async (dateKey: string): Promise<boolean> => {
  try {
    const converted = await fetchHijriByDate(dateKey);
    return converted.hijri.month.number === 9;
  } catch {
    return false;
  }
};

export const registerFastCommand = (program: Command): void => {
  program
    .command('fast')
    .description('Log fasting for today')
    .action(async () => {
      intro('Fasting check-in');

      const config = getConfig();
      const dateKey = formatDateKey(new Date(), config.timezone);

      if (!(await isRamadanDate(dateKey))) {
        outro(pc.dim('Today is not a Ramadan day.'));
        return;
      }

      const existing = getAttendance(dateKey);
      const fastingAnswer = await confirm({
        message: 'Did you complete your fast today?',
        initialValue: existing?.fasted ?? false,
      });

      if (isCancel(fastingAnswer)) {
        cancel('Logging cancelled.');
        return;
      }

      const fasted = Boolean(fastingAnswer);
      if (fasted) {
        console.log(pc.green('MashaAllah'));
      }

      setAttendance(dateKey, {}, fasted);
      outro(pc.dim('Saved.'));
    });
};
