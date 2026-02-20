#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';

import { registerBackfillCommand } from './commands/backfill.js';
import { registerHistoryCommand } from './commands/history.js';
import { registerMarkCommand } from './commands/mark.js';
import { registerRecapCommand } from './commands/recap.js';
import { registerResetCommand } from './commands/reset.js';
import { registerScheduleCommand } from './commands/schedule.js';
import { ensureSetup } from './lib/setup.js';

const program = new Command();

program
  .name('puasa-cli')
  .description('Ramadan and prayer attendance CLI')
  .version('0.1.0');

registerScheduleCommand(program);
registerMarkCommand(program);
registerBackfillCommand(program);
registerHistoryCommand(program);
registerRecapCommand(program);
registerResetCommand(program);

const argv = process.argv.slice(2);
const wantsHelp = argv.includes('-h') || argv.includes('--help');
if (!wantsHelp) {
  program.hook('preAction', async (_thisCommand, actionCommand) => {
    if (actionCommand?.name() === 'reset') {
      return;
    }

    try {
      await ensureSetup();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Setup failed.';
      console.error(pc.red(message));
      process.exit(1);
    }
  });
}

program.on('command:*', () => {
  console.error(pc.red('Invalid command.'));
  program.help();
});

program.parse();
