import { cancel, confirm, intro, isCancel, multiselect, outro, text } from '@clack/prompts';
import type { Command } from 'commander';
import pc from 'picocolors';

import { getAttendance, PRAYERS, setAttendance, type PrayerName } from '../lib/store.js';
import { isRamadanDate } from '../utils/ramadan-utils.js';

type BackfillOptions = {
  date?: string;
};

const parseDateKey = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (month < 1 || month > 12) {
    throw new Error('Month must be between 01 and 12');
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Invalid day for the given month');
  }
  return value;
};

const isFutureDate = (dateKey: string): boolean => {
  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  return dateKey > todayKey;
};


export const registerBackfillCommand = (program: Command): void => {
  program
    .command('backfill')
    .description('Fill in missed prayer attendance for a past date')
    .option('-d, --date <date>', 'Date in YYYY-MM-DD format')
    .action(async (options: BackfillOptions) => {
      intro('📅 Backfill log - Log prayers and fasting for a past date.');

      let dateKey: string;
      const promptForDate = async (): Promise<string | null> => {
        while (true) {
          const dateInput = await text({
            message: 'Which date do you want to update? (YYYY-MM-DD)',
            validate: (value) => {
              if (!value) return 'Date is required';
              try {
                parseDateKey(value);
                return undefined;
              } catch (error) {
                return error instanceof Error ? error.message : 'Invalid date';
              }
            },
          });

          if (isCancel(dateInput)) {
            return null;
          }

          const parsed = parseDateKey(String(dateInput));
          if (isFutureDate(parsed)) {
            console.log('');
            console.log(pc.yellow('Reminder:'));
            console.log(pc.yellow('“O believers! Be mindful of Allah, and say what is right.”'));
            console.log(pc.yellow('Surah Al-Ahzab (33:70–71)'));
            console.log('');
            continue;
          }

          return parsed;
        }
      };

      if (options.date) {
        dateKey = parseDateKey(options.date);
        if (isFutureDate(dateKey)) {
          console.log('');
          console.log(pc.yellow('Reminder:'));
          console.log(pc.yellow('“O believers! Be mindful of Allah, and say what is right.”'));
          console.log(pc.yellow('Surah Al-Ahzab (33:70–71)'));
          console.log('');
          const prompted = await promptForDate();
          if (!prompted) {
            cancel('Backfill cancelled.');
            return;
          }
          dateKey = prompted;
        }
      } else {
        const prompted = await promptForDate();
        if (!prompted) {
          cancel('Backfill cancelled.');
          return;
        }
        dateKey = prompted;
      }

      const existing = getAttendance(dateKey);
      const initialValues = PRAYERS.filter((prayer) => existing?.prayers[prayer] === true);

      const selected = await multiselect({
        message: `Which prayers did you complete for ${dateKey}?`,
        options: PRAYERS.map((prayer) => ({ value: prayer, label: prayer })),
        initialValues,
        required: false,
      });

      if (isCancel(selected)) {
        cancel('Backfill cancelled.');
        return;
      }

      const selectedSet = new Set(selected as PrayerName[]);
      const record = Object.fromEntries(
        PRAYERS.map((prayer) => [prayer, selectedSet.has(prayer)]),
      ) as Record<PrayerName, boolean>;

      let fasted: boolean | undefined = existing?.fasted;
      if (await isRamadanDate(dateKey)) {
        const fastingAnswer = await confirm({
          message: `Did you complete your fast on ${dateKey}?`,
          initialValue: existing?.fasted ?? false,
        });

        if (isCancel(fastingAnswer)) {
          cancel('Backfill cancelled.');
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
