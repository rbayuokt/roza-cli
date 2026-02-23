import { cancel, confirm, intro, isCancel, multiselect, outro } from '@clack/prompts';
import type { Command } from 'commander';
import pc from 'picocolors';

import { getConfig, getAttendance, PRAYERS, setAttendance, type PrayerName } from '../lib/store.js';
import { formatDateKey } from '../utils/date-utils.js';
import { isRamadanDate } from '../utils/ramadan-utils.js';

const toTodayKey = (timezone?: string): string => formatDateKey(new Date(), timezone);

export const registerMarkCommand = (program: Command): void => {
  program
    .command('mark')
    .description('Mark attendance for today\'s prayers')
    .action(async () => {
      intro('Prayer check-in');

      const config = getConfig();
      const dateKey = toTodayKey(config.timezone);
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
