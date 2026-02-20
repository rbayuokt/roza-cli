import type { Command } from 'commander';

export const registerBackfillCommand = (program: Command): void => {
  program
    .command('backfill')
    .description('Fill in missed prayer attendance for a past date')
    .option('-d, --date <date>', 'Date in YYYY-MM-DD format')
    .action(async () => {
      // TODO: Implement backfill flow.
    });
};
