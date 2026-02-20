import type { Command } from 'commander';

export const registerRecapCommand = (program: Command): void => {
  program
    .command('recap')
    .description('Recap with prayer consistency visualization')
    .option('-r, --range <range>', 'Range like 7d, 30d, ramadan')
    .action(async () => {
      // TODO: Implement recap view.
    });
};
