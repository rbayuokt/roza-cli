import { cancel, confirm, intro, isCancel, outro } from '@clack/prompts';
import type { Command } from 'commander';
import pc from 'picocolors';

import { clearConfig } from '../lib/store.js';

export const registerResetCommand = (program: Command): void => {
  program
    .command('reset')
    .description('Reset saved configuration')
    .action(async () => {
      intro('Reset configuration');

      const answer = await confirm({
        message: 'Remove saved location, method, and preferences?',
        initialValue: false,
      });

      if (isCancel(answer)) {
        cancel('Reset cancelled.');
        return;
      }

      if (!answer) {
        outro(pc.dim('No changes made.'));
        return;
      }

      const finalConfirm = await confirm({
        message: 'This will permanently delete your data. Continue?',
        initialValue: false,
      });

      if (isCancel(finalConfirm)) {
        cancel('Reset cancelled.');
        return;
      }

      if (!finalConfirm) {
        outro(pc.dim('No changes made.'));
        return;
      }

      clearConfig();
      outro('Configuration cleared. Run any command to set up again.');
    });
};
