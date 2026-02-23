import { cancel, confirm, intro, isCancel, outro } from '@clack/prompts';
import type { Command } from 'commander';
import pc from 'picocolors';

import { getAttendance, setAttendance } from '../lib/store.js';
import { getConfig } from '../lib/store.js';
import { formatDateKey } from '../utils/date-utils.js';
import { isRamadanDate } from '../utils/ramadan-utils.js';

const toTodayKey = (timezone?: string): string => formatDateKey(new Date(), timezone);

export const registerFastCommand = (program: Command): void => {
  program
    .command('fast')
    .description('Log fasting for today')
    .action(async () => {
      intro('Fasting check-in');

      const config = getConfig();
      const dateKey = toTodayKey(config.timezone);

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
