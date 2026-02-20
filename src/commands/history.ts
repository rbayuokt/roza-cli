import type { Command } from 'commander';

export const registerHistoryCommand = (program: Command): void => {
  program
    .command('history')
    .description('View prayer attendance history')
    .option('-f, --from <date>', 'From date YYYY-MM-DD')
    .option('-t, --to <date>', 'To date YYYY-MM-DD')
    .action(async () => {
      // TODO: Implement history view.
    });
};
