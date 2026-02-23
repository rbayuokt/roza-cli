import { cancel, confirm, intro, isCancel, multiselect, outro } from '@clack/prompts';
import type { Command } from 'commander';
import pc from 'picocolors';

import { fetchHijriByDate } from '../lib/api.js';
import { getConfig, getAttendance, PRAYERS, setAttendance, type PrayerName } from '../lib/store.js';

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

export const registerMarkCommand = (program: Command): void => {
  program
    .command('mark')
    .description('Mark attendance for today\'s prayers')
    .action(async () => {
      intro('Prayer check-in');

      const config = getConfig();
      const dateKey = formatDateKey(new Date(), config.timezone);
      const existing = getAttendance(dateKey);
      const initialValues = PRAYERS.filter((prayer) => existing?.prayers[prayer] === true);

      const selected = await multiselect({
        message: `Which prayers did you complete for ${dateKey}?`,
        options: PRAYERS.map((prayer) => ({ value: prayer, label: prayer })),
        initialValues,
        required: false,
      });

      if (isCancel(selected)) {
        cancel('Marking cancelled.');
        return;
      }

      const selectedSet = new Set(selected as PrayerName[]);
      const record = Object.fromEntries(
        PRAYERS.map((prayer) => [prayer, selectedSet.has(prayer)]),
      ) as Record<PrayerName, boolean>;

      let fasted: boolean | undefined = existing?.fasted;
      if (await isRamadanDate(dateKey)) {
        const fastingAnswer = await confirm({
          message: 'Did you complete your fast today?',
          initialValue: existing?.fasted ?? false,
        });

        if (isCancel(fastingAnswer)) {
          cancel('Marking cancelled.');
          return;
        }

        fasted = Boolean(fastingAnswer);
        if (fasted) {
          console.log(pc.green('MashaAllah'));
        }
      }

      setAttendance(dateKey, record, fasted);
      outro(pc.dim('Saved.'));
    });
};
