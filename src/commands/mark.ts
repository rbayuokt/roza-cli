import type { Command } from 'commander';

export const registerMarkCommand = (program: Command): void => {
  program
    .command('mark')
    .description('Mark attendance for today\'s prayers')
    .action(async () => {
      // TODO: Implement mark flow.
    });
};
